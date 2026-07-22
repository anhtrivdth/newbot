import { checkBearer } from "../../../../lib/auth";
import { errorResponse, orderCode } from "../../../../lib/http";
import { runtime } from "../../../../lib/runtime";
import { botOwnerId } from "../../../../lib/bot-owner";

export async function GET(request: Request) {
  const denied = checkBearer(request, "BOT_API_TOKEN");
  if (denied) return denied;
  try {
    const ownerId=await botOwnerId(request);
    const status = new URL(request.url).searchParams.get("status") ?? "PAID";
    if (!["PENDING", "PAID"].includes(status)) return Response.json({ error: "Trạng thái không hợp lệ" }, { status: 400 });
    const rows = await runtime().DB.prepare(`
      SELECT o.code, o.telegram_user_id, o.telegram_chat_id, o.status, o.amount, p.name product_name
      FROM orders o JOIN products p ON p.id=o.product_id WHERE o.status=? AND p.owner_id=? ORDER BY o.id LIMIT 100
    `).bind(status,ownerId).all();
    return Response.json({ orders: rows.results });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const denied = checkBearer(request, "BOT_API_TOKEN");
  if (denied) return denied;
  try {
    const ownerId=await botOwnerId(request);
    const body = await request.json() as { productId?: number; telegramUserId?: string; telegramChatId?: string; quantity?: number };
    const productId = Number(body.productId);
    const quantity = Number(body.quantity ?? 1);
    if (!Number.isInteger(productId) || !body.telegramUserId || !body.telegramChatId) {
      return Response.json({ error: "Thiếu thông tin tạo đơn" }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return Response.json({error:"Số lượng mua phải từ 1 đến 20"},{status:400});

    const db = runtime().DB;
    const product = await db.prepare("SELECT id, name, price FROM products WHERE id=? AND owner_id=? AND active=1").bind(productId,ownerId).first() as { id: number; name: string; price: number } | null;
    if (!product) return Response.json({ error: "Sản phẩm không tồn tại" }, { status: 404 });
    const isFree=Number(product.price)===0;
    if(isFree&&quantity!==1)return Response.json({error:"Sản phẩm miễn phí chỉ được nhận 1 key"},{status:400});
    const accountAdmin=ownerId?await db.prepare("SELECT telegram_user_id value FROM account_bot_connections WHERE user_id=? AND kind='admin' AND verified_at IS NOT NULL").bind(ownerId).first() as {value:string}|null:null;
    const adminSetting=accountAdmin??await db.prepare("SELECT value FROM system_settings WHERE key='admin_telegram_id'").first() as {value:string}|null;
    const freeLimitExempt=isFree&&body.telegramUserId===String(adminSetting?.value??"1801754034");
    if(isFree&&!freeLimitExempt){
      const recent=await db.prepare("SELECT strftime('%H:%M %d/%m/%Y',claimed_at,'+31 hours') available_at FROM free_claims WHERE telegram_user_id=? AND product_id=? AND claimed_at>datetime('now','-24 hours')").bind(body.telegramUserId,productId).first() as {available_at:string}|null;
      if(recent)return Response.json({error:`Bạn đã nhận key miễn phí. Có thể nhận lại sau ${recent.available_at} (GMT+7).`,availableAt:recent.available_at},{status:409});
    }
    const stocks=await db.prepare("SELECT id FROM stock_items WHERE product_id=? AND status='AVAILABLE' ORDER BY id LIMIT ?").bind(productId,quantity).all() as {results:Array<{id:number}>};
    if(stocks.results.length<quantity)return Response.json({error:`Kho chỉ còn ${stocks.results.length} key, không đủ số lượng ${quantity}`},{status:409});

    const code = orderCode();
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 19).replace("T", " ");
    const stockIds=stocks.results.map((stock)=>stock.id);
    const initialStatus = Number(product.price) === 0 ? "PAID" : "PENDING";
    let freeClaimed=false;
    let insertedId:number|null=null;
    try{
      if(isFree&&!freeLimitExempt){
        const claim=await db.prepare(`INSERT INTO free_claims (telegram_user_id,product_id,claimed_at,order_code) VALUES (?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(telegram_user_id,product_id) DO UPDATE SET claimed_at=CURRENT_TIMESTAMP,order_code=excluded.order_code WHERE free_claims.claimed_at<=datetime('now','-24 hours') RETURNING claimed_at`).bind(body.telegramUserId,productId,code).first();
        if(!claim)return Response.json({error:"Bạn chỉ được nhận lại key miễn phí sau 24 giờ"},{status:409});
        freeClaimed=true;
      }
      const inserted=await db.prepare(`
        INSERT INTO orders (code, telegram_user_id, telegram_chat_id, product_id, stock_item_id, quantity, amount, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
      `).bind(code,body.telegramUserId,body.telegramChatId,productId,stockIds[0],quantity,Number(product.price)*quantity,initialStatus,expiresAt).first() as {id:number};
      insertedId=inserted.id;
      const reservations=await db.batch(stockIds.map((id)=>db.prepare("UPDATE stock_items SET status='RESERVED',reserved_until=? WHERE id=? AND status='AVAILABLE'").bind(expiresAt,id)));
      if(reservations.some((result:{meta:{changes?:number}})=>!result.meta.changes)){
        await db.batch([db.prepare("DELETE FROM orders WHERE id=?").bind(inserted.id),...stockIds.map((id)=>db.prepare("UPDATE stock_items SET status='AVAILABLE',reserved_until=NULL WHERE id=? AND status='RESERVED' AND reserved_until=?").bind(id,expiresAt)),...(freeClaimed?[db.prepare("DELETE FROM free_claims WHERE telegram_user_id=? AND product_id=? AND order_code=?").bind(body.telegramUserId,productId,code)]:[])]);
        return Response.json({error:"Kho vừa thay đổi, vui lòng thử lại"},{status:409});
      }
      await db.batch(stockIds.map((id)=>db.prepare("INSERT INTO order_items (order_id,stock_item_id) VALUES (?,?)").bind(inserted.id,id)));
    }catch(error){
      if(insertedId)await db.batch([db.prepare("DELETE FROM order_items WHERE order_id=?").bind(insertedId),db.prepare("DELETE FROM orders WHERE id=?").bind(insertedId),...stockIds.map((id)=>db.prepare("UPDATE stock_items SET status='AVAILABLE',reserved_until=NULL WHERE id=? AND status='RESERVED' AND reserved_until=?").bind(id,expiresAt))]);
      if(freeClaimed)await db.prepare("DELETE FROM free_claims WHERE telegram_user_id=? AND product_id=? AND order_code=?").bind(body.telegramUserId,productId,code).run();
      throw error;
    }
    const remaining=await db.prepare("SELECT COUNT(*) total FROM stock_items WHERE product_id=? AND status='AVAILABLE'").bind(productId).first() as {total:number};
    return Response.json({ order: { code, productName: product.name, quantity, unitPrice:product.price, amount:Number(product.price)*quantity, status: initialStatus, expiresAt,remainingStock:Number(remaining.total),lowStock:Number(remaining.total)<6 } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

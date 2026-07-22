import { checkBearer } from "../../../../../lib/auth";
import { decryptSecret } from "../../../../../lib/crypto";
import { errorResponse } from "../../../../../lib/http";
import { runtime } from "../../../../../lib/runtime";
import { botOwnerId } from "../../../../../lib/bot-owner";

type OrderRow = { id: number; code: string; status: string; amount: number; quantity:number; expires_at: string; product_name: string; stock_item_id: number|null; telegram_user_id: string };

async function findOrder(request:Request,code: string) {
  return runtime().DB.prepare(`SELECT o.*, p.name product_name FROM orders o JOIN products p ON p.id=o.product_id WHERE o.code=? AND p.owner_id=?`).bind(code,await botOwnerId(request)).first() as Promise<OrderRow | null>;
}

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const denied = checkBearer(request, "BOT_API_TOKEN");
  if (denied) return denied;
  try {
    const { code } = await context.params;
    const order = await findOrder(request,code);
    if (!order) return Response.json({ error: "Không tìm thấy đơn" }, { status: 404 });
    return Response.json({ order: { code: order.code, status: order.status, amount: order.amount, quantity:order.quantity, expiresAt: order.expires_at, productName: order.product_name } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const denied = checkBearer(request, "BOT_API_TOKEN");
  if (denied) return denied;
  try {
    const { code } = await context.params;
    const body = await request.json().catch(() => ({})) as { telegramUserId?: string };
    const order = await findOrder(request,code);
    if (!order) return Response.json({ error: "Không tìm thấy đơn" }, { status: 404 });
    if (body.telegramUserId && body.telegramUserId !== order.telegram_user_id) return Response.json({ error: "Sai người nhận" }, { status: 403 });
    if(order.status==="DELIVERED")return Response.json({delivery:{alreadyDelivered:true,productName:order.product_name}});
    if(order.status!=="PAID")return Response.json({error:"Đơn chưa thanh toán"},{status:409});
    let stocks=(await runtime().DB.prepare("SELECT s.id,s.encrypted_value,s.iv FROM order_items oi JOIN stock_items s ON s.id=oi.stock_item_id WHERE oi.order_id=? AND s.status IN ('RESERVED','SOLD') ORDER BY oi.id").bind(order.id).all()).results as Array<{id:number;encrypted_value:string;iv:string}>;
    if(!stocks.length&&order.stock_item_id){const legacy=await runtime().DB.prepare("SELECT id,encrypted_value,iv FROM stock_items WHERE id=? AND status IN ('RESERVED','SOLD')").bind(order.stock_item_id).first() as {id:number;encrypted_value:string;iv:string}|null;if(legacy)stocks=[legacy]}
    if(stocks.length!==order.quantity)return Response.json({error:"Số key đang giữ không khớp đơn hàng"},{status:409});
    const secrets=await Promise.all(stocks.map((stock)=>decryptSecret(stock.encrypted_value,stock.iv)));
    const claimed=await runtime().DB.prepare("UPDATE orders SET status='DELIVERED',delivered_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PAID'").bind(order.id).run();
    if(!claimed.meta.changes)return Response.json({delivery:{alreadyDelivered:true,productName:order.product_name}});
    await runtime().DB.batch(stocks.map((stock)=>runtime().DB.prepare("UPDATE stock_items SET status='SOLD',reserved_until=NULL WHERE id=? AND status='RESERVED'").bind(stock.id)));
    return Response.json({delivery:{secrets,secret:secrets[0],quantity:secrets.length,productName:order.product_name,alreadyDelivered:false}});
  } catch (error) { return errorResponse(error); }
}

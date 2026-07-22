import { checkBearer } from "../../../../../../lib/auth";
import { errorResponse } from "../../../../../../lib/http";
import { runtime } from "../../../../../../lib/runtime";
import { botOwnerId } from "../../../../../../lib/bot-owner";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const denied = checkBearer(request, "BOT_API_TOKEN");
  if (denied) return denied;
  try {
    const { code } = await context.params;
    const ownerId=await botOwnerId(request);
    const body = await request.json() as { status?: "PAID" | "CANCELLED" };
    if (!body.status || !["PAID", "CANCELLED"].includes(body.status)) {
      return Response.json({ error: "Trạng thái không hợp lệ" }, { status: 400 });
    }
    const db = runtime().DB;
    const order = await db.prepare(`SELECT o.id,o.stock_item_id,o.status,o.quantity,o.telegram_chat_id,o.telegram_user_id,o.expires_at,p.name product_name,CASE WHEN o.expires_at<CURRENT_TIMESTAMP THEN 1 ELSE 0 END expired FROM orders o JOIN products p ON p.id=o.product_id WHERE o.code=? AND p.owner_id=?`).bind(code,ownerId).first() as {id:number;stock_item_id:number|null;status:string;quantity:number;telegram_chat_id:string;telegram_user_id:string;expires_at:string;product_name:string;expired:number}|null;
    if (!order) return Response.json({ error: "Không tìm thấy đơn" }, { status: 404 });
    if (order.status !== "PENDING") {
      return Response.json({ error: `Đơn đang ở trạng thái ${order.status}` }, { status: 409 });
    }
    const release=()=>db.prepare("UPDATE stock_items SET status='AVAILABLE',reserved_until=NULL WHERE status='RESERVED' AND (id=? OR id IN (SELECT stock_item_id FROM order_items WHERE order_id=?))").bind(order.stock_item_id,order.id);
    if(order.expired){
      await db.batch([db.prepare("UPDATE orders SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(order.id),release()]);
      return Response.json({ok:true,code,status:"CANCELLED",expired:true,customerChatId:order.telegram_chat_id,telegramUserId:order.telegram_user_id,productName:order.product_name,quantity:order.quantity});
    }
    if (body.status === "PAID") {
      const inventory=await db.prepare("SELECT COUNT(*) total FROM order_items oi JOIN stock_items s ON s.id=oi.stock_item_id WHERE oi.order_id=? AND s.status='RESERVED'").bind(order.id).first() as {total:number};
      const legacyReserved=!Number(inventory.total)&&order.stock_item_id?await db.prepare("SELECT id FROM stock_items WHERE id=? AND status='RESERVED'").bind(order.stock_item_id).first():null;
      const reservedCount=Number(inventory.total)||(legacyReserved?1:0);
      if(reservedCount<order.quantity){
        await db.batch([db.prepare("UPDATE orders SET status='REFUND_REQUIRED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(order.id),release()]);
        return Response.json({ok:true,code,status:"REFUND_REQUIRED",refundRequired:true,customerChatId:order.telegram_chat_id,telegramUserId:order.telegram_user_id,productName:order.product_name,quantity:order.quantity,reservedCount});
      }
      await db.prepare("UPDATE orders SET status='PAID', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(order.id).run();
    } else {
      await db.batch([
        db.prepare("UPDATE orders SET status='CANCELLED', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(order.id),
        release(),
      ]);
    }
    return Response.json({ok:true,code,status:body.status,customerChatId:order.telegram_chat_id,telegramUserId:order.telegram_user_id,productName:order.product_name,quantity:order.quantity});
  } catch (error) { return errorResponse(error); }
}

import { checkBearer } from "../../../../../lib/auth";
import { errorResponse } from "../../../../../lib/http";
import { runtime } from "../../../../../lib/runtime";
import { botOwnerId } from "../../../../../lib/bot-owner";

type ExpiredOrder={id:number;code:string;telegram_chat_id:string;telegram_user_id:string;quantity:number;product_name:string};

export async function POST(request:Request){
  const denied=checkBearer(request,"BOT_API_TOKEN");if(denied)return denied;
  try{
    const db=runtime().DB;
    const rows=await db.prepare(`SELECT o.id,o.code,o.telegram_chat_id,o.telegram_user_id,o.quantity,p.name product_name FROM orders o JOIN products p ON p.id=o.product_id WHERE o.status='PENDING' AND o.expires_at<CURRENT_TIMESTAMP AND p.owner_id=? ORDER BY o.id`).bind(await botOwnerId(request)).all() as {results:ExpiredOrder[]};
    const expired=[];
    for(const order of rows.results){
      const cancelled=await db.prepare("UPDATE orders SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING' AND expires_at<CURRENT_TIMESTAMP").bind(order.id).run();
      if(!cancelled.meta.changes)continue;
      await db.prepare("UPDATE stock_items SET status='AVAILABLE',reserved_until=NULL WHERE status='RESERVED' AND (id IN (SELECT stock_item_id FROM order_items WHERE order_id=?) OR id=(SELECT stock_item_id FROM orders WHERE id=?))").bind(order.id,order.id).run();
      expired.push(order);
    }
    return Response.json({expired});
  }catch(error){return errorResponse(error)}
}

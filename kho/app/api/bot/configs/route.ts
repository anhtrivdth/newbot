import { checkBearer } from "../../../../lib/auth";
import { runtime } from "../../../../lib/runtime";

export async function GET(request:Request){
  const denied=checkBearer(request,"BOT_API_TOKEN");if(denied)return denied;
  const [rows,legacy]=await Promise.all([
    runtime().DB.prepare(`SELECT u.id shop_id FROM users u WHERE u.active=1 AND EXISTS(SELECT 1 FROM account_bot_connections s WHERE s.user_id=u.id AND s.kind='sales' AND s.verified_at IS NOT NULL) AND EXISTS(SELECT 1 FROM account_bot_connections a WHERE a.user_id=u.id AND a.kind='admin' AND a.verified_at IS NOT NULL AND a.telegram_user_id IS NOT NULL) ORDER BY u.id`).all(),
    runtime().DB.prepare("SELECT value FROM system_settings WHERE key='bot_owner_user_id'").first() as Promise<{value:string}|null>,
  ]);
  const shops=rows.results as Array<{shop_id:number}>;const legacyId=Number(legacy?.value);
  if(Number.isInteger(legacyId)&&legacyId>0&&!shops.some((shop)=>shop.shop_id===legacyId)){
    const configuring=await runtime().DB.prepare("SELECT 1 found FROM account_bot_connections WHERE user_id=? LIMIT 1").bind(legacyId).first();
    if(!configuring)shops.push({shop_id:legacyId});
  }
  return Response.json({shops});
}

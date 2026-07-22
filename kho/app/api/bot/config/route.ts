import { checkBearer } from "../../../../lib/auth";
import { decryptSecret } from "../../../../lib/crypto";
import { errorResponse } from "../../../../lib/http";
import { runtime } from "../../../../lib/runtime";

export async function GET(request: Request) {
  const denied = checkBearer(request, "BOT_API_TOKEN");
  if (denied) return denied;
  try {
    const shopId=Number(request.headers.get("x-bot-shop-id"));
    if(Number.isInteger(shopId)&&shopId>0){
      const [rows,shop]=await Promise.all([
        runtime().DB.prepare("SELECT kind,encrypted_token,iv,telegram_user_id,verified_at FROM account_bot_connections WHERE user_id=?").bind(shopId).all() as Promise<{results:Array<{kind:string;encrypted_token:string;iv:string;telegram_user_id:string|null;verified_at:string|null}>}>,
        runtime().DB.prepare("SELECT role FROM users WHERE id=? AND active=1").bind(shopId).first() as Promise<{role:string}|null>,
      ]);
      if(!shop)return Response.json({error:"Shop không tồn tại hoặc đã bị khóa"},{status:403});
      const sales=rows.results.find((row)=>row.kind==="sales"&&row.verified_at);const admin=rows.results.find((row)=>row.kind==="admin"&&row.verified_at);
      if(sales&&admin?.telegram_user_id)return Response.json({config:{shop_id:String(shopId),shop_role:shop.role,customer_bot_token:await decryptSecret(sales.encrypted_token,sales.iv),admin_bot_token:await decryptSecret(admin.encrypted_token,admin.iv),admin_telegram_id:admin.telegram_user_id}});
      const legacyOwner=await runtime().DB.prepare("SELECT value FROM system_settings WHERE key='bot_owner_user_id'").first() as {value:string}|null;
      if(String(shopId)!==legacyOwner?.value)return Response.json({error:"Shop chưa xác minh đủ Bot bán hàng và Bot thông báo admin"},{status:409});
    }
    const [publicRows, secretRows] = await Promise.all([
      runtime().DB.prepare("SELECT key, value FROM system_settings WHERE key='admin_telegram_id'").all(),
      runtime().DB.prepare("SELECT key, encrypted_value, iv FROM secret_settings").all(),
    ]);
    const config:Record<string,string> = Object.fromEntries(publicRows.results.map((row: { key: string; value: string }) => [row.key, row.value]));
    for (const row of secretRows.results as Array<{ key: string; encrypted_value: string; iv: string }>) config[row.key] = await decryptSecret(row.encrypted_value, row.iv);
    if (!config.customer_bot_token || !config.admin_bot_token || !config.admin_telegram_id) return Response.json({ error: "Chưa cấu hình đủ token bot và Telegram ID admin" }, { status: 409 });
    const legacyOwner=await runtime().DB.prepare("SELECT value FROM system_settings WHERE key='bot_owner_user_id'").first() as {value:string}|null;
    if(legacyOwner?.value){const owner=await runtime().DB.prepare("SELECT role FROM users WHERE id=? AND active=1").bind(Number(legacyOwner.value)).first() as {role:string}|null;config.shop_id=legacyOwner.value;config.shop_role=owner?.role??"user"}
    return Response.json({ config });
  } catch (error) { return errorResponse(error); }
}

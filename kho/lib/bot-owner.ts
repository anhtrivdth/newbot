import { runtime } from "./runtime";

export async function botOwnerId(request?:Request) {
  const requested=Number(request?.headers.get("x-bot-shop-id"));
  if(Number.isInteger(requested)&&requested>0){const user=await runtime().DB.prepare("SELECT id FROM users WHERE id=? AND active=1").bind(requested).first();if(user)return requested}
  const row=await runtime().DB.prepare("SELECT value FROM system_settings WHERE key='bot_owner_user_id'").first() as {value:string}|null;
  const id=Number(row?.value);
  return Number.isInteger(id)&&id>0?id:null;
}

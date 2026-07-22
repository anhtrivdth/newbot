import { encryptSecret } from "../../../../../lib/crypto";
import { errorResponse } from "../../../../../lib/http";
import { requireUser } from "../../../../../lib/user-auth";
import { runtime } from "../../../../../lib/runtime";

export async function POST(request:Request){
  const auth=await requireUser(request);if(auth.denied)return auth.denied;
  try{const {token,kind,adminTelegramId}=await request.json() as {token?:string;kind?:string;adminTelegramId?:string};if(!token)return Response.json({error:"Thiếu token bot"},{status:400});if(!kind||!["sales","admin"].includes(kind))return Response.json({error:"Loại bot không hợp lệ"},{status:400});
    const telegramId=String(adminTelegramId??"").trim();if(kind==="admin"&&!/^[1-9][0-9]{4,19}$/.test(telegramId))return Response.json({error:"Telegram Admin ID không hợp lệ. Hãy lấy ID số từ @userinfobot"},{status:400});
    const response=await fetch(`https://api.telegram.org/bot${token}/getMe`);const data=await response.json() as {ok:boolean;result?:{id:number;username?:string;first_name:string}};if(!data.ok||!data.result?.username)return Response.json({error:"Token Telegram không hợp lệ"},{status:400});
    const used=await runtime().DB.prepare("SELECT user_id,kind FROM account_bot_connections WHERE bot_id=? AND NOT (user_id=? AND kind=?)").bind(String(data.result.id),auth.user!.id,kind).first();if(used)return Response.json({error:"Bot này đã được liên kết với một shop hoặc vai trò khác"},{status:409});
    const encrypted=await encryptSecret(token);const nonce=crypto.randomUUID().replaceAll("-","").slice(0,24);await runtime().DB.prepare(`INSERT INTO account_bot_connections (user_id,kind,encrypted_token,iv,bot_id,bot_username,bot_name,challenge_nonce,telegram_user_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,kind) DO UPDATE SET encrypted_token=excluded.encrypted_token,iv=excluded.iv,bot_id=excluded.bot_id,bot_username=excluded.bot_username,bot_name=excluded.bot_name,challenge_nonce=excluded.challenge_nonce,code_hash=NULL,code_expires_at=NULL,telegram_user_id=excluded.telegram_user_id,verified_at=NULL,updated_at=CURRENT_TIMESTAMP`).bind(auth.user!.id,kind,encrypted.encryptedValue,encrypted.iv,String(data.result.id),data.result.username,data.result.first_name,nonce,kind==="admin"?telegramId:null).run();
    return Response.json({kind,bot:{username:data.result.username,name:data.result.first_name},deepLink:`https://t.me/${data.result.username}?start=${nonce}`});
  }catch(error){return errorResponse(error)}
}

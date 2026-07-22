import { requireUser } from "../../../../../lib/user-auth";
import { runtime } from "../../../../../lib/runtime";
export async function GET(request:Request){const auth=await requireUser(request);if(auth.denied)return auth.denied;const rows=await runtime().DB.prepare("SELECT kind,bot_username,bot_name,telegram_user_id,verified_at,updated_at FROM account_bot_connections WHERE user_id=? ORDER BY kind").bind(auth.user!.id).all();const connections=Object.fromEntries((rows.results as Array<{kind:string}>).map((row)=>[row.kind,row]));return Response.json({connections})}

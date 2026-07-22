import { checkBearer } from "../../../../lib/auth";
import { errorResponse } from "../../../../lib/http";
import { runtime } from "../../../../lib/runtime";
import { botOwnerId } from "../../../../lib/bot-owner";

export async function GET(request: Request) {
  const denied = checkBearer(request, "BOT_API_TOKEN");
  if (denied) return denied;
  try {
    const ownerId=await botOwnerId(request);
    const systemRows=await runtime().DB.prepare("SELECT key, value FROM system_settings").all();
    const values:Record<string,string>=Object.fromEntries(systemRows.results.map((row: { key: string; value: string }) => [row.key, row.value]));
    if(ownerId){
      const [accountRows,qr]=await Promise.all([runtime().DB.prepare("SELECT key,value FROM account_settings WHERE user_id=?").bind(ownerId).all(),runtime().FILES.head(`payment-qr/${ownerId}`)]);
      Object.assign(values,Object.fromEntries(accountRows.results.map((row:{key:string;value:string})=>[row.key,row.value])));
      values.payment_qr_url=qr?"/api/bot/payment-qr":"";
    }
    return Response.json({ settings: values });
  } catch (error) { return errorResponse(error); }
}

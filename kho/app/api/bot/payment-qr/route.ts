import { botOwnerId } from "../../../../lib/bot-owner";
import { runtime } from "../../../../lib/runtime";

export async function GET(request:Request) {
  const ownerId=await botOwnerId(request);
  if(!ownerId)return new Response("QR not configured",{status:404});
  const object=await runtime().FILES.get(`payment-qr/${ownerId}`);
  if(!object)return new Response("QR not found",{status:404});
  const headers=new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control","public, max-age=60");
  return new Response(object.body,{headers});
}

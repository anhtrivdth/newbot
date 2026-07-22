import { runtime } from "../../../lib/runtime";
import { currentUser } from "../../../lib/user-auth";

export async function GET(request:Request) {
  const user=await currentUser(request);if(!user)return new Response("Unauthorized",{status:401});
  const object = await runtime().FILES.get(`payment-qr/${user.id}`);
  if (!object) return new Response("QR not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "no-store");
  return new Response(object.body, { headers });
}

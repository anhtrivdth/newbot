import { requireUser } from "../../../../lib/user-auth";
import { errorResponse } from "../../../../lib/http";
import { runtime } from "../../../../lib/runtime";

export async function POST(request: Request) {
  const auth=await requireUser(request);if(auth.denied)return auth.denied;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.type.startsWith("image/")) return Response.json({ error: "Vui lòng chọn file ảnh" }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return Response.json({ error: "Ảnh QR tối đa 5MB" }, { status: 400 });
    await runtime().FILES.put(`payment-qr/${auth.user!.id}`, file.stream(), { httpMetadata: { contentType: file.type } });
    return Response.json({ ok: true, url: "/api/payment-qr" });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  const auth=await requireUser(request);if(auth.denied)return auth.denied;
  try { await runtime().FILES.delete(`payment-qr/${auth.user!.id}`); return Response.json({ ok: true }); }
  catch (error) { return errorResponse(error); }
}

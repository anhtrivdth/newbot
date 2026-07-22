import { checkWebhook } from "../../../../lib/auth";
import { errorResponse } from "../../../../lib/http";
import { runtime } from "../../../../lib/runtime";

export async function POST(request: Request) {
  const denied = checkWebhook(request);
  if (denied) return denied;
  try {
    const body = await request.json() as { transactionId?: string; orderCode?: string; amount?: number; content?: string };
    const orderCode = body.orderCode?.trim().toUpperCase() || body.content?.toUpperCase().match(/NF[A-Z0-9]+/)?.[0];
    const amount = Number(body.amount);
    if (!body.transactionId || !orderCode || !Number.isFinite(amount)) {
      return Response.json({ error: "Webhook thiếu transactionId, orderCode/content hoặc amount" }, { status: 400 });
    }
    const db = runtime().DB;
    const exists = await db.prepare("SELECT id FROM payments WHERE transaction_id=?").bind(body.transactionId).first();
    if (exists) return Response.json({ ok: true, duplicate: true });
    const order = await db.prepare("SELECT id, amount, status FROM orders WHERE code=?").bind(orderCode).first() as { id: number; amount: number; status: string } | null;
    if (!order || order.status !== "PENDING" || amount < order.amount) {
      return Response.json({ error: "Không khớp đơn hoặc số tiền" }, { status: 409 });
    }
    await db.batch([
      db.prepare("INSERT INTO payments (transaction_id, order_code, amount, raw_payload) VALUES (?, ?, ?, ?)").bind(body.transactionId, orderCode, amount, JSON.stringify(body)),
      db.prepare("UPDATE orders SET status='PAID', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(order.id),
    ]);
    return Response.json({ ok: true, orderCode });
  } catch (error) { return errorResponse(error); }
}

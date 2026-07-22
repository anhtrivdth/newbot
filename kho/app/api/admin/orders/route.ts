import { checkBearer } from "../../../../lib/auth";
import { errorResponse } from "../../../../lib/http";
import { runtime } from "../../../../lib/runtime";

export async function GET(request: Request) {
  const denied = checkBearer(request, "ADMIN_TOKEN");
  if (denied) return denied;
  try {
    const rows = await runtime().DB.prepare(`
      SELECT o.*, p.name product_name FROM orders o JOIN products p ON p.id=o.product_id
      ORDER BY o.id DESC LIMIT 200
    `).all();
    return Response.json({ orders: rows.results });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  const denied = checkBearer(request, "ADMIN_TOKEN");
  if (denied) return denied;
  try {
    const body = await request.json() as { id?: number; status?: "PAID" | "CANCELLED" };
    if (!body.id || !["PAID", "CANCELLED"].includes(body.status ?? "")) {
      return Response.json({ error: "Dữ liệu đơn hàng không hợp lệ" }, { status: 400 });
    }
    const order = await runtime().DB.prepare("SELECT * FROM orders WHERE id=?").bind(body.id).first() as { stock_item_id: number; status: string } | null;
    if (!order || order.status !== "PENDING") return Response.json({ error: "Đơn không ở trạng thái chờ" }, { status: 409 });
    if (body.status === "CANCELLED") {
      await runtime().DB.batch([
        runtime().DB.prepare("UPDATE orders SET status='CANCELLED', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.id),
        runtime().DB.prepare("UPDATE stock_items SET status='AVAILABLE', reserved_until=NULL WHERE id=?").bind(order.stock_item_id),
      ]);
    } else {
      await runtime().DB.prepare("UPDATE orders SET status='PAID', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.id).run();
    }
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

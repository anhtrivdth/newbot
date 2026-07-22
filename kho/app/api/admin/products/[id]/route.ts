import { requireUser } from "../../../../../lib/user-auth";
import { errorResponse } from "../../../../../lib/http";
import { runtime } from "../../../../../lib/runtime";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request); if (auth.denied) return auth.denied;
  try {
    const { id } = await context.params;
    const body = await request.json() as { name?: string; description?: string; price?: number; active?: boolean };
    const current = await runtime().DB.prepare("SELECT * FROM products WHERE id = ? AND owner_id=?").bind(id,auth.user!.id).first() as Record<string, unknown> | null;
    if (!current) return Response.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });
    const product = await runtime().DB.prepare(`
      UPDATE products SET name = ?, description = ?, price = ?, active = ? WHERE id = ? AND owner_id=? RETURNING *
    `).bind(
      body.name?.trim() || current.name,
      body.description === undefined ? current.description : body.description.trim(),
      body.price === undefined ? current.price : Number(body.price),
      body.active === undefined ? current.active : (body.active ? 1 : 0),
      id, auth.user!.id,
    ).first();
    return Response.json({ product });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request); if (auth.denied) return auth.denied;
  try {
    const { id } = await context.params;
    const usage = await runtime().DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM stock_items WHERE product_id=?) stock_count,
        (SELECT COUNT(*) FROM orders WHERE product_id=?) order_count
    `).bind(id, id).first() as { stock_count: number; order_count: number } | null;
    if (!usage) return Response.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });
    if (Number(usage.stock_count) > 0 || Number(usage.order_count) > 0) {
      return Response.json({ error: "Sản phẩm đã có key hoặc đơn hàng; hãy tắt thay vì xóa" }, { status: 409 });
    }
    const result = await runtime().DB.prepare("DELETE FROM products WHERE id=? AND owner_id=?").bind(id,auth.user!.id).run();
    if (!result.meta.changes) return Response.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

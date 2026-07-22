import { requireUser } from "../../../../lib/user-auth";
import { errorResponse } from "../../../../lib/http";
import { runtime } from "../../../../lib/runtime";

export async function GET(request: Request) {
  const auth = await requireUser(request); if (auth.denied) return auth.denied;
  try {
    const result = await runtime().DB.prepare(`
      SELECT p.*, COUNT(s.id) AS total_stock,
        SUM(CASE WHEN s.status = 'AVAILABLE' THEN 1 ELSE 0 END) AS available_stock,
        SUM(CASE WHEN s.status = 'SOLD' THEN 1 ELSE 0 END) AS sold_stock
      FROM products p LEFT JOIN stock_items s ON s.product_id = p.id
      WHERE p.owner_id=? GROUP BY p.id ORDER BY p.id DESC
    `).bind(auth.user!.id).all();
    return Response.json({ products: result.results });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const auth = await requireUser(request); if (auth.denied) return auth.denied;
  try {
    const body = await request.json() as { name?: string; description?: string; price?: number };
    const name = body.name?.trim();
    const price = Number(body.price);
    if (!name || !Number.isFinite(price) || price < 0) {
      return Response.json({ error: "Tên và giá sản phẩm không hợp lệ" }, { status: 400 });
    }
    const result = await runtime().DB.prepare(
      "INSERT INTO products (name, description, price, owner_id) VALUES (?, ?, ?, ?) RETURNING *"
    ).bind(name, body.description?.trim() ?? "", price, auth.user!.id).first();
    return Response.json({ product: result }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

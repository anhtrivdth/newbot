import { checkBearer } from "../../../../lib/auth";
import { errorResponse } from "../../../../lib/http";
import { runtime } from "../../../../lib/runtime";
import { botOwnerId } from "../../../../lib/bot-owner";

export async function GET(request: Request) {
  const denied = checkBearer(request, "BOT_API_TOKEN");
  if (denied) return denied;
  try {
    const ownerId=await botOwnerId(request);
    const query = ownerId ? runtime().DB.prepare(`
      SELECT p.id, p.name, p.description, p.price, COUNT(s.id) available_stock
      FROM products p LEFT JOIN stock_items s ON s.product_id=p.id AND s.status='AVAILABLE'
      WHERE p.active=1 AND p.owner_id=? GROUP BY p.id ORDER BY p.id DESC
    `).bind(ownerId) : runtime().DB.prepare(`
      SELECT p.id, p.name, p.description, p.price, COUNT(s.id) available_stock
      FROM products p LEFT JOIN stock_items s ON s.product_id=p.id AND s.status='AVAILABLE'
      WHERE p.active=1 AND p.owner_id IS NULL GROUP BY p.id ORDER BY p.id DESC
    `);
    const rows = await query.all();
    return Response.json({ products: rows.results });
  } catch (error) { return errorResponse(error); }
}

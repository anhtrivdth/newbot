import { requireUser } from "../../../../lib/user-auth";
import { decryptSecret, encryptSecret } from "../../../../lib/crypto";
import { errorResponse } from "../../../../lib/http";
import { runtime } from "../../../../lib/runtime";

export async function GET(request: Request) {
  const auth = await requireUser(request); if (auth.denied) return auth.denied;
  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");
    const query = productId
      ? runtime().DB.prepare(`SELECT s.id, s.product_id, s.encrypted_value, s.iv, s.hint, s.status, s.reserved_until, s.created_at, p.name product_name FROM stock_items s JOIN products p ON p.id=s.product_id WHERE s.product_id=? AND p.owner_id=? ORDER BY s.id DESC`).bind(productId,auth.user!.id)
      : runtime().DB.prepare(`SELECT s.id, s.product_id, s.encrypted_value, s.iv, s.hint, s.status, s.reserved_until, s.created_at, p.name product_name FROM stock_items s JOIN products p ON p.id=s.product_id WHERE p.owner_id=? ORDER BY s.id DESC`).bind(auth.user!.id);
    const rows=(await query.all()).results as Array<Record<string,unknown>&{encrypted_value:string;iv:string}>;
    const stock=await Promise.all(rows.map(async ({encrypted_value,iv,...row})=>({...row,value:await decryptSecret(encrypted_value,iv)})));
    return Response.json({ stock });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request:Request){
  const auth=await requireUser(request);if(auth.denied)return auth.denied;
  try{const {id,value}=await request.json() as {id?:number;value?:string};const stockId=Number(id);const clean=String(value??"").trim();if(!Number.isInteger(stockId)||stockId<1||!clean)return Response.json({error:"ID và nội dung key là bắt buộc"},{status:400});
    const item=await runtime().DB.prepare("SELECT s.status FROM stock_items s JOIN products p ON p.id=s.product_id WHERE s.id=? AND p.owner_id=?").bind(stockId,auth.user!.id).first() as {status:string}|null;if(!item)return Response.json({error:"Không tìm thấy key trong shop này"},{status:404});if(item.status!=="AVAILABLE")return Response.json({error:"Chỉ có thể sửa key đang ở trạng thái Sẵn sàng"},{status:409});
    const encrypted=await encryptSecret(clean);const hint=clean.length<=6?"Key đã mã hóa":`${clean.slice(0,2)}••••${clean.slice(-4)}`;await runtime().DB.prepare("UPDATE stock_items SET encrypted_value=?,iv=?,hint=? WHERE id=? AND status='AVAILABLE'").bind(encrypted.encryptedValue,encrypted.iv,hint,stockId).run();return Response.json({ok:true});
  }catch(error){return errorResponse(error)}
}

export async function DELETE(request:Request){
  const auth=await requireUser(request);if(auth.denied)return auth.denied;
  try{const body=await request.json() as {id?:number;ids?:number[]};const source=Array.isArray(body.ids)?body.ids:[body.id];const ids=[...new Set(source.map(Number).filter((id)=>Number.isInteger(id)&&id>0))];if(!ids.length||ids.length>500)return Response.json({error:"Cần chọn từ 1 đến 500 key hợp lệ"},{status:400});
    const placeholders=ids.map(()=>"?").join(",");const owned=await runtime().DB.prepare(`SELECT s.id,s.status FROM stock_items s JOIN products p ON p.id=s.product_id WHERE s.id IN (${placeholders}) AND p.owner_id=?`).bind(...ids,auth.user!.id).all() as {results:Array<{id:number;status:string}>};if(owned.results.length!==ids.length)return Response.json({error:"Có key không tồn tại hoặc không thuộc shop này"},{status:404});const protectedIds=owned.results.filter((item)=>item.status!=="AVAILABLE").map((item)=>item.id);if(protectedIds.length)return Response.json({error:`Không thể xóa key đang giữ hoặc đã bán: ${protectedIds.join(", ")}`},{status:409});
    const linked=await runtime().DB.prepare(`SELECT DISTINCT stock_item_id id FROM order_items WHERE stock_item_id IN (${placeholders}) UNION SELECT DISTINCT stock_item_id id FROM orders WHERE stock_item_id IN (${placeholders})`).bind(...ids,...ids).all() as {results:Array<{id:number}>};if(linked.results.length)return Response.json({error:`Key đã liên kết lịch sử đơn hàng nên không thể xóa: ${linked.results.map((item)=>item.id).join(", ")}`},{status:409});await runtime().DB.batch(ids.map((id)=>runtime().DB.prepare("DELETE FROM stock_items WHERE id=?").bind(id)));return Response.json({ok:true,deleted:ids.length});
  }catch(error){return errorResponse(error)}
}

export async function POST(request: Request) {
  const auth = await requireUser(request); if (auth.denied) return auth.denied;
  try {
    const body = await request.json() as { productId?: number; keys?: string[] | string };
    const productId = Number(body.productId);
    const source = Array.isArray(body.keys) ? body.keys : String(body.keys ?? "").split(/\r?\n/);
    const keys = source.map((value) => value.trim()).filter(Boolean);
    if (!Number.isInteger(productId) || !keys.length || keys.length > 500) {
      return Response.json({ error: "productId và 1-500 key là bắt buộc" }, { status: 400 });
    }
    if (!await runtime().DB.prepare("SELECT id FROM products WHERE id=? AND owner_id=?").bind(productId,auth.user!.id).first()) return Response.json({error:"Sản phẩm không thuộc tài khoản này"},{status:403});
    const statements = [];
    for (const value of keys) {
      const encrypted = await encryptSecret(value);
      const hint = value.length <= 6 ? "Key đã mã hóa" : `${value.slice(0, 2)}••••${value.slice(-4)}`;
      statements.push(runtime().DB.prepare("INSERT INTO stock_items (product_id, encrypted_value, iv, hint) VALUES (?, ?, ?, ?)").bind(productId, encrypted.encryptedValue, encrypted.iv, hint));
    }
    await runtime().DB.batch(statements);
    return Response.json({ imported: keys.length }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

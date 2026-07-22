import { errorResponse } from "../../../../lib/http";
import { runtime } from "../../../../lib/runtime";
import { hashPassword, requireAdmin } from "../../../../lib/user-auth";

type UserRow = {
  id:number; username:string; role:"admin"|"user"; active:number; created_at:string;
  product_count:number; stock_count:number; available_stock:number;
  bot_username:string|null; bot_verified_at:string|null;
};

export async function GET(request:Request) {
  try {
    const auth=await requireAdmin(request); if(auth.denied)return auth.denied;
    const result=await (runtime().DB.prepare(`
      SELECT u.id,u.username,u.role,u.active,u.created_at,
        (SELECT COUNT(*) FROM products p WHERE p.owner_id=u.id) AS product_count,
        (SELECT COUNT(*) FROM stock_items s JOIN products p ON p.id=s.product_id WHERE p.owner_id=u.id) AS stock_count,
        (SELECT COUNT(*) FROM stock_items s JOIN products p ON p.id=s.product_id WHERE p.owner_id=u.id AND s.status='AVAILABLE') AS available_stock,
        b.bot_username,b.verified_at AS bot_verified_at
      FROM users u LEFT JOIN account_bot_connections b ON b.user_id=u.id AND b.kind='sales'
      ORDER BY u.created_at DESC,u.id DESC
    `).all() as Promise<{results:UserRow[]}>);
    return Response.json({users:result.results});
  } catch(error){return errorResponse(error)}
}

export async function PATCH(request:Request) {
  try {
    const auth=await requireAdmin(request); if(auth.denied||!auth.user)return auth.denied;
    const body=await request.json() as {id?:number;role?:string;active?:boolean;resetPassword?:boolean};
    const id=Number(body.id); if(!Number.isInteger(id)||id<1)return Response.json({error:"User không hợp lệ"},{status:400});
    const target=await runtime().DB.prepare("SELECT id,role,active FROM users WHERE id=?").bind(id).first() as {id:number;role:string;active:number}|null;
    if(!target)return Response.json({error:"Không tìm thấy user"},{status:404});
    if(id===auth.user.id&&body.active===false)return Response.json({error:"Admin không thể tự khóa tài khoản"},{status:400});
    if(body.role!==undefined)return Response.json({error:"Hệ thống chỉ có một role admin cố định; không thể thay đổi role"},{status:400});
    if(body.resetPassword){
      if(id===auth.user.id)return Response.json({error:"Admin không thể tự reset mật khẩu đang sử dụng"},{status:400});
      const password=await hashPassword("123456");
      await runtime().DB.prepare("UPDATE users SET password_hash=?,password_salt=?,must_change_password=1 WHERE id=?").bind(password.hash,password.salt,id).run();
      await runtime().DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();
      return Response.json({ok:true,temporaryPassword:"123456",dataPreserved:true});
    }
    const nextActive=body.active===undefined?target.active:(body.active?1:0);
    await runtime().DB.prepare("UPDATE users SET active=? WHERE id=?").bind(nextActive,id).run();
    if(!nextActive)await runtime().DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();
    return Response.json({ok:true});
  } catch(error){return errorResponse(error)}
}

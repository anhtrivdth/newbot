import { runtime } from "./runtime";

const encoder = new TextEncoder();

function base64(bytes: Uint8Array) { let value=""; bytes.forEach((b) => value += String.fromCharCode(b)); return btoa(value); }
function fromBase64(value: string) { return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)); }
function hex(bytes: ArrayBuffer) { return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2,"0")).join(""); }

export async function hashText(value: string) { return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value))); }

export async function hashPassword(password: string, saltValue?: string) {
  const salt = saltValue ? fromBase64(saltValue) : crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt, iterations:210000, hash:"SHA-256" }, material, 256);
  return { hash:hex(bits), salt:base64(salt) };
}

export async function createSession(userId: number) {
  const token = base64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
  const expiresAt = new Date(Date.now()+7*86400000).toISOString();
  await runtime().DB.prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)").bind(userId, await hashText(token), expiresAt).run();
  return { token, expiresAt };
}

export function sessionCookie(token: string, maxAge=604800) { return `botnf_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`; }

export async function currentUser(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie.split(";").map((v) => v.trim()).find((v) => v.startsWith("botnf_session="))?.slice(14);
  if (!token) return null;
  return runtime().DB.prepare(`SELECT u.id, u.username, u.role, u.active, u.must_change_password FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP`).bind(await hashText(token)).first() as Promise<{id:number;username:string;role:"admin"|"user";active:number;must_change_password:number}|null>;
}

export async function requireUser(request: Request) {
  const user = await currentUser(request);
  if (!user) return { user:null, denied:Response.json({error:"Vui lòng đăng nhập"},{status:401}) };
  if (!user.active) return { user:null, denied:Response.json({error:"Tài khoản đã bị khóa"},{status:403}) };
  if (user.must_change_password) return { user:null, denied:Response.json({error:"Bạn phải đổi mật khẩu tạm trước khi sử dụng kho",code:"PASSWORD_CHANGE_REQUIRED"},{status:403}) };
  return { user, denied:null };
}

export async function requireAdmin(request: Request) {
  const auth = await requireUser(request);
  if (auth.denied || !auth.user) return auth;
  return auth.user.role === "admin"
    ? auth
    : { user:null, denied:Response.json({error:"Chỉ role admin được quản lý người dùng"},{status:403}) };
}

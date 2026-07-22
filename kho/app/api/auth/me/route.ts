import { currentUser, sessionCookie } from "../../../../lib/user-auth";
export async function GET(request:Request){const user=await currentUser(request);return user?Response.json({user}):Response.json({error:"Chưa đăng nhập"},{status:401})}
export async function DELETE(){return Response.json({ok:true},{headers:{"Set-Cookie":sessionCookie("",0)}})}

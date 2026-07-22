import { requireEnv } from "./runtime";

function unauthorized(message = "Không có quyền truy cập") {
  return Response.json({ error: message }, { status: 401 });
}

export function checkBearer(request: Request, expected: "ADMIN_TOKEN" | "BOT_API_TOKEN") {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token && token === requireEnv(expected) ? null : unauthorized();
}

export function checkWebhook(request: Request) {
  const token = request.headers.get("x-webhook-secret") ?? "";
  return token && token === requireEnv("PAYMENT_WEBHOOK_SECRET") ? null : unauthorized();
}

import { env } from "cloudflare:workers";

export type BotnfEnv = {
  DB: D1Database;
  FILES: R2Bucket;
  ADMIN_TOKEN?: string;
  BOT_API_TOKEN?: string;
  PAYMENT_WEBHOOK_SECRET?: string;
  ENCRYPTION_KEY?: string;
};

export function runtime(): BotnfEnv {
  return env as unknown as BotnfEnv;
}

export function requireEnv(name: keyof Omit<BotnfEnv, "DB">): string {
  const value = runtime()[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

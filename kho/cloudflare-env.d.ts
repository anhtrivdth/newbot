/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "cloudflare:workers" {
  export const env: Record<string, any>;
}

type D1Database = any;
type R2Bucket = any;
type Fetcher = { fetch(request: Request): Promise<Response> };

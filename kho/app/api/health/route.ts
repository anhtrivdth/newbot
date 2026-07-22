export async function GET() {
  return Response.json({ service: "botnf-kho", status: "ok", time: new Date().toISOString() });
}

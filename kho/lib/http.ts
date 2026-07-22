export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Lỗi không xác định";
  console.error(error);
  return Response.json({ error: message }, { status: 500 });
}

export function orderCode() {
  return `NF${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

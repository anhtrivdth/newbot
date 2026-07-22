import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard source contains the product-specific admin flows", async () => {
  const [page, layout, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /botnf Kho/);
  assert.match(page, /Sản phẩm/);
  assert.match(page, /Nhập kho/);
  assert.match(page, /Cấu hình Bot/);
  assert.match(page, /Bot bán hàng/);
  assert.match(page, /Bot thông báo admin/);
  assert.match(page, /Quản lý người dùng/);
  assert.match(page, /ROLE ADMIN/);
  assert.match(page, /Lưu cấu hình/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.doesNotMatch(page + layout, /codex-preview|react-loading-skeleton/i);
});

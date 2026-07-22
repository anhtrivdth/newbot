# botnf

Hệ thống bán key/tài khoản có sẵn trong kho qua Telegram, gồm hai dịch vụ tách biệt:

```text
botnf/
├── kho/          # Dashboard quản trị + API + D1
└── botbanhang/  # Telegram bot Python (aiogram)
```

## Luồng bán hàng

1. Quản trị tạo sản phẩm và nhập key trong dashboard `kho`.
2. Key được mã hóa AES-256-GCM trước khi lưu vào D1.
3. Khách chọn sản phẩm trên Telegram; hệ thống giữ một key trong 15 phút.
4. Khách chuyển khoản với nội dung là mã đơn `NF...`.
5. Webhook ngân hàng/cổng thanh toán đánh dấu đơn đã trả. Bot quét đơn, giải mã key và gửi riêng cho khách.
6. Đơn hết hạn được hủy và key được trả về kho khi có lượt mua tiếp theo.

## Chạy kho

Yêu cầu Node.js 22.13+.

```powershell
cd D:\Code\botnf\kho
Copy-Item .env.example .dev.vars
# Sửa bốn secret trong .dev.vars
npm install
npm run dev
```

Tạo `ENCRYPTION_KEY` đúng chuẩn:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Dashboard mặc định chạy ở `http://localhost:3001`. Dùng giá trị `ADMIN_TOKEN` để đăng nhập. Migration trong `kho/drizzle/` được nền tảng áp dụng khi deploy.

## Chạy bot Telegram

Yêu cầu Python 3.12+ và một bot tạo bằng `@BotFather`.

```powershell
cd D:\Code\botnf\botbanhang
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Chỉ cần cấu hình KHO_API_URL và KHO_BOT_API_TOKEN
python -m app.main
```

`KHO_BOT_API_TOKEN` phải giống `BOT_API_TOKEN` trong dịch vụ kho.
Token bot bán hàng, token bot quản lý, Telegram ID admin, ngân hàng và ảnh QR được nhập trong tab **Thanh toán & Bot**. Token Telegram được mã hóa và không lưu trong `.env`.

## Nối webhook thanh toán

Cấu hình nhà cung cấp gọi `POST /api/webhooks/payment`, header `x-webhook-secret` bằng `PAYMENT_WEBHOOK_SECRET`, body sau:

```json
{
  "transactionId": "bank-unique-123",
  "orderCode": "NFABC123",
  "amount": 89000,
  "content": "NFABC123"
}
```

`transactionId` có ràng buộc duy nhất để webhook gọi lặp không giao hàng hai lần. Nếu chưa nối webhook, có thể xác nhận tiền thủ công trong tab **Đơn hàng**.

## Phân quyền

- `ADMIN_TOKEN`: API dashboard quản trị.
- `BOT_API_TOKEN`: giao tiếp nội bộ giữa bot và kho.
- `PAYMENT_WEBHOOK_SECRET`: xác thực webhook thanh toán.
- `ENCRYPTION_KEY`: khóa mã hóa 32 byte; mất key này sẽ không thể giải mã kho cũ.

Không commit `.env`, `.dev.vars` hoặc key thật lên Git.

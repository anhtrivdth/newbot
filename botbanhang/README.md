# botnf-botbanhang

Bot Telegram viết bằng aiogram 3. Bot không lưu key; mọi dữ liệu kho được lấy qua API có bearer token.

Lệnh cho khách:

- `/start`: mở menu cửa hàng chuyên nghiệp.
- `/sanpham`: xem danh sách còn hàng có phân trang, giá và tồn kho.
- `/donhang NF...`: xem trạng thái mã đơn.
- `/huongdan`: xem quy trình mua và nhận key.
- `/hotro`: mở thông tin hỗ trợ.

Luồng mua hàng: Menu sản phẩm → Chi tiết → Mua ngay → QR/thông tin chuyển khoản → Xác nhận → giao key tự động.

`app.supervisor` tự đồng bộ các shop đã xác minh đủ Bot bán hàng và Bot thông báo admin, sau đó chạy một runtime tách biệt cho từng shop.

Xem [`../README.md`](../README.md) để cấu hình và chạy.

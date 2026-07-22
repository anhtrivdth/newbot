# botnf-kho

Dashboard và API trung tâm cho botnf. Hướng dẫn cấu hình đầy đủ nằm ở [`../README.md`](../README.md).

API chính:

- `/api/admin/*`: quản trị sản phẩm, kho và đơn hàng của tài khoản hiện tại.
- `/api/admin/users`: chỉ role `admin` được xem user, đổi role và khóa/mở khóa tài khoản.
- `/api/account/bot/*`: liên kết riêng `sales` và `admin` bot cho từng shop, xác minh bằng mã Telegram 4 số.
- `/api/bot/*`: API nội bộ cho bot Telegram.
- `/api/webhooks/payment`: nhận xác nhận giao dịch.
- `/api/health`: kiểm tra trạng thái dịch vụ.

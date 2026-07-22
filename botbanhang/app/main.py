import asyncio
import contextlib
import html
import logging
from datetime import datetime
from urllib.parse import quote

from aiogram import BaseMiddleware, Bot, Dispatcher, F
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command, CommandStart
from aiogram.types import BotCommand, BufferedInputFile, CallbackQuery, InlineKeyboardMarkup, Message, Update

from .config import settings
from .keyboards import (
    admin_order_keyboard,
    delivered_keyboard,
    home_keyboard,
    order_keyboard,
    product_detail_keyboard,
    product_keyboard,
)
from .kho_client import KhoClient, KhoError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
bot: Bot
admin_bot: Bot
admin_telegram_id = 0
dp = Dispatcher()
kho = KhoClient()
catalog_views: dict[int, tuple[int, int]] = {}


class BotRoleMiddleware(BaseMiddleware):
    async def __call__(self,handler,event:Update,data):
        active_bot=data.get("bot")
        callback=event.callback_query
        is_admin_action=bool(callback and callback.data and callback.data.startswith("admin_"))
        is_admin_command=bool(event.message and event.message.text and event.message.text.split()[0].split("@")[0]=="/reg")
        if active_bot and active_bot.id==admin_bot.id:
            return await handler(event,data) if is_admin_action or is_admin_command else None
        return None if is_admin_action or is_admin_command else await handler(event,data)


dp.update.outer_middleware(BotRoleMiddleware())

STATUS_LABELS = {
    "PENDING": "⏳ Chờ thanh toán",
    "PAID": "✅ Đã thanh toán",
    "DELIVERED": "📦 Đã giao hàng",
    "CANCELLED": "❌ Đã hủy",
    "REFUND_REQUIRED": "💸 Cần hoàn tiền",
}


def currency(value: float) -> str:
    if float(value) == 0:
        return "MIỄN PHÍ"
    return f"{float(value):,.0f}".replace(",", ".") + "đ"


def expiry(value: str) -> str:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).strftime("%H:%M · %d/%m/%Y")
    except (TypeError, ValueError):
        return value


async def replace_or_send(callback: CallbackQuery, text: str, markup: InlineKeyboardMarkup) -> Message | None:
    if not callback.message:
        return None
    if callback.message.photo:
        return await callback.message.answer(text, parse_mode="HTML", reply_markup=markup)
    try:
        result = await callback.message.edit_text(text, parse_mode="HTML", reply_markup=markup)
        return result if isinstance(result, Message) else callback.message
    except TelegramBadRequest as error:
        if "message is not modified" in str(error).lower():
            return callback.message
        return await callback.message.answer(text, parse_mode="HTML", reply_markup=markup)


async def storefront_settings() -> tuple[str, str]:
    remote = await kho.settings()
    return (
        remote.get("store_name") or "BOTNF Store",
        remote.get("support_username") or settings.support_username,
    )


def home_text(store_name: str, customer_name: str) -> str:
    return (
        f"🏪 <b>{html.escape(store_name.upper())}</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"Xin chào <b>{html.escape(customer_name)}</b> 👋\n\n"
        "Nền tảng mua hàng số tự động 24/7. Key được lấy trực tiếp từ kho và giao ngay "
        "sau khi thanh toán được xác nhận.\n\n"
        "⚡ <b>Giao hàng tự động</b>\n"
        "🔐 <b>Thông tin được bảo mật</b>\n"
        "🛟 <b>Có hỗ trợ khi cần</b>\n\n"
        "Chọn một chức năng bên dưới để bắt đầu."
    )


async def show_home(target: Message | CallbackQuery) -> None:
    store_name, support = await storefront_settings()
    user = target.from_user
    text = home_text(store_name, user.full_name)
    if isinstance(target, CallbackQuery):
        if target.message:
            catalog_views.pop(target.message.chat.id, None)
        await replace_or_send(target, text, home_keyboard(support))
    else:
        await target.answer(text, parse_mode="HTML", reply_markup=home_keyboard(support))


async def catalog_payload(products: list[dict], page: int) -> tuple[str, InlineKeyboardMarkup]:
    if not products:
        text = "📦 <b>KHO TẠM HẾT HÀNG</b>\n\nSản phẩm đang được bổ sung. Vui lòng quay lại sau."
        markup = home_keyboard((await storefront_settings())[1])
    else:
        total_stock = sum(int(product.get("available_stock", 0)) for product in products)
        text = (
            "🛍 <b>MENU SẢN PHẨM</b>\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"Hiện có <b>{len(products)} sản phẩm</b> và <b>{total_stock} key</b> sẵn sàng.\n\n"
            "Chạm vào sản phẩm để xem mô tả, giá và tồn kho trước khi đặt hàng."
        )
        markup = product_keyboard(products, page)
    return text, markup


async def show_catalog(target: Message | CallbackQuery, page: int = 0) -> None:
    products = await kho.products()
    text, markup = await catalog_payload(products, page)
    if isinstance(target, CallbackQuery):
        sent = await replace_or_send(target, text, markup)
    else:
        sent = await target.answer(text, reply_markup=markup, parse_mode="HTML")
    if sent:
        catalog_views[sent.chat.id] = (sent.message_id, page)


@dp.message(CommandStart())
async def start(message: Message) -> None:
    await show_home(message)


@dp.message(Command("sanpham"))
async def catalog_command(message: Message) -> None:
    await show_catalog(message)


@dp.message(Command("huongdan", "help"))
async def guide_command(message: Message) -> None:
    await message.answer(
        "📖 <b>HƯỚNG DẪN MUA HÀNG</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        "<b>1.</b> Mở Menu sản phẩm và chọn mặt hàng.\n"
        "<b>2.</b> Kiểm tra mô tả, giá bán và tồn kho.\n"
        "<b>3.</b> Bấm Mua ngay để hệ thống giữ một key trong 15 phút.\n"
        "<b>4.</b> Quét QR hoặc chuyển đúng số tiền và nội dung.\n"
        "<b>5.</b> Bấm Tôi đã chuyển khoản; key sẽ được giao ngay khi tiền được xác nhận.\n\n"
        "⚠️ Không sửa nội dung chuyển khoản để tránh chậm giao hàng.",
        parse_mode="HTML",
        reply_markup=home_keyboard((await storefront_settings())[1]),
    )


@dp.message(Command("hotro"))
async def support_command(message: Message) -> None:
    _, support = await storefront_settings()
    await message.answer(
        "💬 <b>TRUNG TÂM HỖ TRỢ</b>\n\n"
        f"Liên hệ: <b>{html.escape(support or 'Chưa cấu hình')}</b>\n"
        "Khi cần hỗ trợ đơn hàng, hãy gửi kèm mã đơn bắt đầu bằng <code>NF</code>.",
        parse_mode="HTML",
        reply_markup=home_keyboard(support),
    )


@dp.message(Command("reg"))
async def register_user_command(message:Message) -> None:
    if message.from_user.id!=admin_telegram_id:
        await message.answer("⛔ Bạn không có quyền cấp tài khoản.")
        return
    parts=(message.text or "").split(maxsplit=1)
    if len(parts)<2:
        await message.answer("Dùng: <code>/reg username</code>",parse_mode="HTML")
        return
    try:
        result=await kho.register_user(parts[1].strip())
        user=result["user"]
        await message.answer(
            "✅ <b>ĐÃ CẤP TÀI KHOẢN USER</b>\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"Username: <code>{html.escape(user['username'])}</code>\n"
            "Mật khẩu tạm: <code>123456</code>\n"
            "Role: <b>user</b>\n\n"
            "Người dùng bắt buộc đổi mật khẩu ngay sau lần đăng nhập đầu tiên.",
            parse_mode="HTML",
        )
    except KhoError as error:
        await message.answer(f"⚠️ {html.escape(str(error))}")


@dp.message(Command("donhang"))
async def order_command(message: Message) -> None:
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer(
            "🔎 <b>KIỂM TRA ĐƠN HÀNG</b>\n\nNhập theo mẫu: <code>/donhang NF...</code>",
            parse_mode="HTML",
        )
        return
    try:
        order = await kho.order(parts[1].strip().upper())
        await message.answer(
            "🧾 <b>THÔNG TIN ĐƠN HÀNG</b>\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"Mã đơn: <code>{html.escape(order['code'])}</code>\n"
            f"Số lượng: <b>{order.get('quantity', 1)} key</b>\n"
            f"Trạng thái: <b>{STATUS_LABELS.get(order['status'], order['status'])}</b>",
            parse_mode="HTML",
            reply_markup=order_keyboard(order["code"]),
        )
    except KhoError as error:
        await message.answer(f"⚠️ {html.escape(str(error))}")


@dp.callback_query(F.data == "noop")
async def noop(callback: CallbackQuery) -> None:
    await callback.answer()


@dp.callback_query(F.data == "home")
async def home_callback(callback: CallbackQuery) -> None:
    await callback.answer()
    await show_home(callback)


@dp.callback_query(F.data.startswith("catalog"))
async def catalog_callback(callback: CallbackQuery) -> None:
    await callback.answer("Đang cập nhật kho…")
    try:
        page = int(callback.data.split(":", 1)[1]) if ":" in callback.data else 0
        await show_catalog(callback, page)
    except (KhoError, ValueError) as error:
        if callback.message:
            await callback.message.answer(f"⚠️ {html.escape(str(error))}")


@dp.callback_query(F.data.startswith("product:"))
async def product_detail(callback: CallbackQuery) -> None:
    await callback.answer()
    try:
        if callback.message:
            catalog_views.pop(callback.message.chat.id, None)
        _, raw_id, raw_page = callback.data.split(":", 2)
        await render_product_detail(callback, int(raw_id), int(raw_page), 1)
    except (KhoError, ValueError) as error:
        if callback.message:
            await callback.message.answer(f"⚠️ {html.escape(str(error))}")


async def render_product_detail(callback:CallbackQuery,product_id:int,page:int,quantity:int) -> None:
    product=next((item for item in await kho.products() if int(item["id"])==product_id),None)
    if not product:raise KhoError("Sản phẩm không tồn tại hoặc đã ngừng bán")
    stock=int(product.get("available_stock",0)); quantity=max(1,min(quantity,stock or 1,20)); price=float(product["price"])
    description=html.escape(product.get("description") or "Sản phẩm số giao tự động sau thanh toán.")
    selection="" if price==0 or stock==0 else f"\n🧺 Đang chọn: <b>{quantity} key</b> · Tổng <b>{currency(price*quantity)}</b>\n"
    text=(
        "📦 <b>CHI TIẾT SẢN PHẨM</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"<b>{html.escape(product['name'])}</b>\n\n"
        f"{description}\n\n"
        f"💳 Đơn giá: <b>{currency(price)}</b>\n"
        f"📊 Tồn kho: <b>{stock} key</b>\n"
        f"🏷 Mã sản phẩm: <code>{int(product['id']):03d}</code>\n"
        f"{selection}\n"
        + ("🎁 Mỗi Telegram ID được nhận 1 key miễn phí trong mỗi 24 giờ." if price==0 and stock>0 else "⚡ Key được giữ riêng cho bạn trong 15 phút sau khi tạo đơn." if stock>0 else "⛔ Sản phẩm đang hết hàng. Bạn có thể kiểm tra lại sau.")
    )
    await replace_or_send(callback,text,product_detail_keyboard(product_id,page,stock,price,quantity))


@dp.callback_query(F.data.startswith("quantity:"))
async def change_quantity(callback:CallbackQuery) -> None:
    await callback.answer()
    try:
        _,raw_id,raw_page,raw_quantity=callback.data.split(":",3)
        await render_product_detail(callback,int(raw_id),int(raw_page),int(raw_quantity))
    except (KhoError,ValueError) as error:
        if callback.message:await callback.message.answer(f"⚠️ {html.escape(str(error))}")


@dp.callback_query(F.data == "order_help")
async def order_help_callback(callback: CallbackQuery) -> None:
    await callback.answer()
    if callback.message:
        await callback.message.answer(
            "🔎 <b>KIỂM TRA ĐƠN HÀNG</b>\n\nGửi lệnh <code>/donhang MÃ_ĐƠN</code>\nVí dụ: <code>/donhang NF123456</code>",
            parse_mode="HTML",
        )


@dp.callback_query(F.data == "guide")
async def guide_callback(callback: CallbackQuery) -> None:
    await callback.answer()
    if callback.message:
        await guide_command(callback.message)


@dp.callback_query(F.data == "support")
async def support_callback(callback: CallbackQuery) -> None:
    await callback.answer()
    if callback.message:
        await support_command(callback.message)


@dp.callback_query(F.data.startswith("buy:"))
async def buy(callback: CallbackQuery) -> None:
    await callback.answer("⏳ Đang giữ một key cho bạn…")
    if not callback.message:
        return
    try:
        parts=callback.data.split(":")
        product_id=int(parts[1]); quantity=int(parts[2]) if len(parts)>2 else 1
        order = await kho.create_order(product_id, callback.from_user.id, callback.message.chat.id, quantity)
        transfer = order["code"]
        remote_settings = await kho.settings()
        store_name = remote_settings.get("store_name") or "BOTNF Store"
        bank_name = remote_settings.get("bank_name") or settings.bank_name
        bank_account = remote_settings.get("bank_account") or settings.bank_account
        bank_owner = remote_settings.get("bank_owner") or settings.bank_owner
        qr = remote_settings.get("payment_qr_url") or settings.payment_qr_base_url
        qr_source: str | BufferedInputFile | None = None
        support_username = remote_settings.get("support_username") or settings.support_username
        if qr:
            if qr.startswith("/"):
                image, content_type = await kho.payment_qr(qr)
                extension = "jpg" if "jpeg" in content_type else "webp" if "webp" in content_type else "png"
                qr_source = BufferedInputFile(image, filename=f"payment-{transfer}.{extension}")
            else:
                separator = "&" if "?" in qr else "?"
                qr_source = f"{qr}{separator}amount={int(order['amount'])}&addInfo={quote(transfer)}"
        text = (
            f"🧾 <b>{html.escape(store_name.upper())} · THANH TOÁN</b>\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"Sản phẩm: <b>{html.escape(order['productName'])}</b>\n"
            f"Số lượng: <b>{order.get('quantity', 1)} key</b>\n"
            f"Mã đơn: <code>{transfer}</code>\n"
            f"Số tiền: <b>{currency(order['amount'])}</b>\n"
            f"Hết hạn: <b>{expiry(order.get('expiresAt', ''))}</b>\n\n"
            "🏦 <b>THÔNG TIN CHUYỂN KHOẢN</b>\n"
            f"Ngân hàng: <b>{html.escape(bank_name)}</b>\n"
            f"Số tài khoản: <code>{html.escape(bank_account)}</code>\n"
            f"Chủ tài khoản: <b>{html.escape(bank_owner)}</b>\n"
            f"Nội dung: <code>{transfer}</code>\n\n"
            "⚠️ Chuyển <b>đúng số tiền</b> và <b>đúng nội dung</b>. Key được giữ trong 15 phút."
        )
        is_free = float(order["amount"]) == 0
        if is_free:
            await callback.message.answer(
                f"🎁 <b>ĐƠN HÀNG MIỄN PHÍ</b>\n\n<b>{html.escape(order['productName'])}</b> đang được giao tự động…",
                parse_mode="HTML",
            )
        elif qr_source:
            try:
                await callback.message.answer_photo(qr_source, caption=text, parse_mode="HTML", reply_markup=order_keyboard(transfer))
            except Exception:
                logging.exception("Không thể hiển thị QR cho đơn %s", transfer)
                await callback.message.answer(text + "\n\n<i>QR chưa tải được; vui lòng chuyển khoản theo thông tin trên.</i>", parse_mode="HTML", reply_markup=order_keyboard(transfer))
        else:
            await callback.message.answer(text, parse_mode="HTML", reply_markup=order_keyboard(transfer))
        try:
            username = f"@{callback.from_user.username}" if callback.from_user.username else "Không có username"
            low_stock_warning=(f"\n\n⚠️ <b>CẢNH BÁO SẮP HẾT HÀNG</b>\nKho chỉ còn <b>{order.get('remainingStock', 0)} key</b>. Vui lòng refill." if order.get("lowStock") else "")
            await admin_bot.send_message(
                admin_telegram_id,
                "🔔 <b>BOTNF · ĐƠN HÀNG MỚI</b>\n"
                "━━━━━━━━━━━━━━━━━━\n"
                f"Mã đơn: <code>{transfer}</code>\n"
                f"Sản phẩm: <b>{html.escape(order['productName'])}</b>\n"
                f"Số lượng: <b>{order.get('quantity', 1)} key</b>\n"
                f"Số tiền: <b>{currency(order['amount'])}</b>\n"
                f"Hết hạn: <b>{expiry(order.get('expiresAt', ''))}</b>\n\n"
                f"Khách hàng: <b>{html.escape(callback.from_user.full_name)}</b>\n"
                f"Telegram: {html.escape(username)}\n"
                f"User ID: <code>{callback.from_user.id}</code>\n\n"
                "Chỉ xác nhận sau khi đã đối soát tiền vào tài khoản."
                f"{low_stock_warning}",
                parse_mode="HTML",
                reply_markup=None if is_free else admin_order_keyboard(transfer),
            )
        except Exception:
            logging.exception("Không thể báo đơn %s cho admin", transfer)
        if is_free:
            await deliver_order(transfer, str(callback.from_user.id), callback.message.chat.id)
    except (KhoError, ValueError) as error:
        await callback.message.answer(f"⚠️ {html.escape(str(error))}")


@dp.callback_query(F.data.startswith("check:"))
async def check_order(callback: CallbackQuery) -> None:
    await callback.answer("Đang kiểm tra giao dịch…")
    if not callback.message:
        return
    try:
        code = callback.data.split(":", 1)[1]
        order = await kho.order(code)
        if order["status"] == "PAID":
            await deliver_order(code, str(callback.from_user.id), callback.message.chat.id)
        elif order["status"] == "DELIVERED":
            await callback.message.answer("✅ Đơn này đã được giao trước đó. Vì an toàn, hệ thống không gửi lại key lần hai.")
        elif order["status"] == "CANCELLED":
            await callback.message.answer("❌ Đơn đã hủy hoặc hết thời gian giữ key. Vui lòng tạo đơn mới.")
        elif order["status"] == "REFUND_REQUIRED":
            await callback.message.answer("💸 Đơn đã nhận tiền nhưng kho không còn đủ key. Vui lòng nhắn admin và gửi kèm mã đơn để được hoàn tiền.")
        else:
            await callback.message.answer(
                "⏳ <b>CHƯA GHI NHẬN THANH TOÁN</b>\n\n"
                "Vui lòng kiểm tra đúng số tiền và nội dung chuyển khoản. Nếu vừa chuyển, hãy chờ một chút rồi kiểm tra lại.",
                parse_mode="HTML",
                reply_markup=order_keyboard(code),
            )
    except KhoError as error:
        await callback.message.answer(f"⚠️ {html.escape(str(error))}")


@dp.callback_query(F.data.startswith("admin_paid:"))
async def admin_confirm_payment(callback: CallbackQuery) -> None:
    if callback.from_user.id != admin_telegram_id:
        await callback.answer("Bạn không có quyền xác nhận đơn.", show_alert=True)
        return
    code = callback.data.split(":", 1)[1]
    try:
        result=await kho.set_order_status(code, "PAID")
        if result.get("refundRequired"):
            await callback.answer("Kho không đủ key — cần hoàn tiền.",show_alert=True)
            await bot.send_message(int(result["customerChatId"]),"💸 <b>ĐƠN HÀNG CẦN HOÀN TIỀN</b>\n\nKho không còn đủ key để giao đơn <code>"+html.escape(code)+"</code>. Vui lòng nhắn admin, gửi kèm mã đơn và thông tin thanh toán để được refund.",parse_mode="HTML")
            if callback.message:await callback.message.edit_text((callback.message.html_text or callback.message.text or "")+"\n\n💸 <b>KHÔNG ĐỦ KEY · VUI LÒNG REFUND KHÁCH</b>",parse_mode="HTML")
            return
        if result.get("expired"):
            await callback.answer("Đơn đã hết hạn và được hoàn key.",show_alert=True)
            await bot.send_message(int(result["customerChatId"]),"⌛ <b>ĐƠN HÀNG ĐÃ HẾT HẠN</b>\n\nChưa nhận được thanh toán cho đơn <code>"+html.escape(code)+"</code> trong 15 phút. Key đã được hoàn lại kho; vui lòng tạo đơn hàng mới.",parse_mode="HTML")
            if callback.message:await callback.message.edit_text((callback.message.html_text or callback.message.text or "")+"\n\n⌛ <b>ĐƠN HẾT HẠN · ĐÃ HOÀN KEY</b>",parse_mode="HTML")
            return
        await callback.answer("Đã xác nhận thanh toán.")
        if callback.message:
            await callback.message.edit_text(
                (callback.message.html_text or callback.message.text or "") +
                "\n\n✅ <b>ĐÃ XÁC NHẬN · HỆ THỐNG ĐANG GIAO KEY</b>",
                parse_mode="HTML",
            )
    except KhoError as error:
        await callback.answer(str(error), show_alert=True)


@dp.callback_query(F.data.startswith("admin_cancel:"))
async def admin_cancel_order(callback: CallbackQuery) -> None:
    if callback.from_user.id != admin_telegram_id:
        await callback.answer("Bạn không có quyền hủy đơn.", show_alert=True)
        return
    code = callback.data.split(":", 1)[1]
    try:
        result=await kho.set_order_status(code, "CANCELLED")
        await callback.answer("Đã hủy đơn.")
        await bot.send_message(int(result["customerChatId"]),"❌ <b>ĐƠN HÀNG ĐÃ BỊ HỦY</b>\n\nAdmin đã hủy đơn <code>"+html.escape(code)+"</code>. Key giữ chỗ đã được hoàn lại kho. Nếu vẫn muốn mua, vui lòng tạo đơn hàng mới.",parse_mode="HTML")
        if callback.message:
            await callback.message.edit_text(
                (callback.message.html_text or callback.message.text or "") +
                "\n\n❌ <b>ĐƠN ĐÃ ĐƯỢC ADMIN HỦY</b>",
                parse_mode="HTML",
            )
    except KhoError as error:
        await callback.answer(str(error), show_alert=True)


async def deliver_order(code: str, user_id: str, chat_id: int) -> None:
    delivery = await kho.deliver(code, user_id)
    if delivery.get("alreadyDelivered"):
        return
    secrets=delivery.get("secrets") or [delivery["secret"]]
    if len(secrets)==1:
        secret_block=f"<code>{html.escape(secrets[0])}</code>"
    else:
        secret_block="\n\n".join(f"<b>Key {index}:</b> <code>{html.escape(secret)}</code>" for index,secret in enumerate(secrets,1))
    product = html.escape(delivery["productName"])
    _, support = await storefront_settings()
    await bot.send_message(
        chat_id,
        "✅ <b>THANH TOÁN THÀNH CÔNG</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"Sản phẩm: <b>{product}</b>\n"
        f"Số lượng: <b>{len(secrets)} key</b>\n"
        f"Mã đơn: <code>{html.escape(code)}</code>\n\n"
        "🔐 <b>THÔNG TIN SẢN PHẨM</b>\n"
        f"{secret_block}\n\n"
        "Hãy sao chép và lưu thông tin ngay. Không chia sẻ key cho người khác.\n"
        f"Cần hỗ trợ: <b>{html.escape(support)}</b>",
        parse_mode="HTML",
        reply_markup=delivered_keyboard(support),
    )


async def payment_watcher() -> None:
    while True:
        try:
            for order in await kho.paid_orders():
                try:
                    await deliver_order(order["code"], order["telegram_user_id"], int(order["telegram_chat_id"]))
                except Exception:
                    logging.exception("Không thể giao đơn %s, sẽ thử lại", order["code"])
        except Exception:
            logging.exception("Lỗi khi quét đơn đã thanh toán")
        await asyncio.sleep(max(settings.poll_interval_seconds, 2))


async def expiration_watcher() -> None:
    while True:
        try:
            for order in await kho.expire_orders():
                code=html.escape(order["code"]); product=html.escape(order["product_name"])
                try:
                    await bot.send_message(int(order["telegram_chat_id"]),f"⌛ <b>ĐƠN HÀNG ĐÃ HẾT HẠN</b>\n━━━━━━━━━━━━━━━━━━\nSản phẩm: <b>{product}</b>\nMã đơn: <code>{code}</code>\n\nSau 15 phút hệ thống chưa nhận được xác nhận thanh toán. Đơn đã tự hủy và key đã được hoàn lại kho. Vui lòng tạo đơn hàng mới.",parse_mode="HTML")
                    await admin_bot.send_message(admin_telegram_id,f"⌛ Đơn <code>{code}</code> đã tự hủy sau 15 phút và hoàn key về kho.",parse_mode="HTML")
                except Exception:logging.exception("Không thể báo đơn hết hạn %s",order["code"])
        except Exception:logging.exception("Không thể quét đơn hết hạn")
        await asyncio.sleep(max(settings.poll_interval_seconds,3))


async def catalog_watcher() -> None:
    previous: tuple | None = None
    while True:
        try:
            products = await kho.products()
            signature = tuple(
                (int(item["id"]), item["name"], item.get("description", ""), float(item["price"]), int(item.get("available_stock", 0)))
                for item in products
            )
            if previous is not None and signature != previous:
                for chat_id, (message_id, page) in list(catalog_views.items()):
                    text, markup = await catalog_payload(products, page)
                    try:
                        await bot.edit_message_text(text, chat_id=chat_id, message_id=message_id, parse_mode="HTML", reply_markup=markup)
                    except TelegramBadRequest as error:
                        if "message is not modified" not in str(error).lower():
                            catalog_views.pop(chat_id, None)
            previous = signature
        except Exception:
            logging.exception("Không thể cập nhật menu sản phẩm thời gian thực")
        await asyncio.sleep(max(settings.poll_interval_seconds, 3))


async def configure_bot_profile() -> None:
    commands = [
        BotCommand(command="start", description="Mở menu chính"),
        BotCommand(command="sanpham", description="Xem menu sản phẩm"),
        BotCommand(command="donhang", description="Kiểm tra trạng thái đơn"),
        BotCommand(command="huongdan", description="Hướng dẫn mua hàng"),
        BotCommand(command="hotro", description="Liên hệ hỗ trợ"),
    ]
    await bot.set_my_commands(commands)
    # /reg vẫn được handler xử lý cho admin hợp lệ, nhưng không công khai trong menu lệnh.
    await admin_bot.delete_my_commands()
    with contextlib.suppress(Exception):
        await bot.set_my_description("Cửa hàng sản phẩm số tự động 24/7 · Chọn sản phẩm, thanh toán và nhận key ngay trên Telegram.")
        await bot.set_my_short_description("Mua sản phẩm số và nhận key tự động 24/7.")


async def main() -> None:
    global bot, admin_bot, admin_telegram_id
    config = await kho.bot_config()
    bot = Bot(config["customer_bot_token"])
    admin_bot = Bot(config["admin_bot_token"])
    admin_telegram_id = int(config["admin_telegram_id"])
    await configure_bot_profile()
    watchers = [asyncio.create_task(payment_watcher()),asyncio.create_task(expiration_watcher()),asyncio.create_task(catalog_watcher())]
    try:
        await dp.start_polling(bot, admin_bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        for watcher in watchers:
            watcher.cancel()
        for watcher in watchers:
            with contextlib.suppress(asyncio.CancelledError):
                await watcher
        await kho.close()
        await bot.session.close()
        await admin_bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())

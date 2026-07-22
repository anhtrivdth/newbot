from math import ceil

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


PAGE_SIZE = 6


def home_keyboard(support_username: str = "") -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text="🛍 Xem sản phẩm", callback_data="catalog:0")],
        [
            InlineKeyboardButton(text="🔎 Kiểm tra đơn", callback_data="order_help"),
            InlineKeyboardButton(text="📖 Hướng dẫn", callback_data="guide"),
        ],
    ]
    if support_username.startswith("@"):
        rows.append([InlineKeyboardButton(text="💬 Hỗ trợ", url=f"https://t.me/{support_username[1:]}")])
    else:
        rows.append([InlineKeyboardButton(text="💬 Hỗ trợ", callback_data="support")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def product_keyboard(products: list[dict], page: int = 0) -> InlineKeyboardMarkup:
    pages = max(1, ceil(len(products) / PAGE_SIZE))
    page = max(0, min(page, pages - 1))
    start = page * PAGE_SIZE
    rows: list[list[InlineKeyboardButton]] = []
    for product in products[start:start + PAGE_SIZE]:
        price = "MIỄN PHÍ" if float(product["price"]) == 0 else f"{float(product['price']):,.0f}đ".replace(",", ".")
        stock = int(product.get("available_stock", 0))
        availability = f"còn {stock}" if stock > 0 else "HẾT HÀNG"
        rows.append([InlineKeyboardButton(
            text=f"{product['name']}  •  {price}  •  {availability}",
            callback_data=f"product:{product['id']}:{page}",
        )])
    if pages > 1:
        navigation = []
        if page > 0:
            navigation.append(InlineKeyboardButton(text="‹ Trước", callback_data=f"catalog:{page - 1}"))
        navigation.append(InlineKeyboardButton(text=f"{page + 1}/{pages}", callback_data="noop"))
        if page < pages - 1:
            navigation.append(InlineKeyboardButton(text="Sau ›", callback_data=f"catalog:{page + 1}"))
        rows.append(navigation)
    rows.append([InlineKeyboardButton(text="🔄 Cập nhật danh sách", callback_data=f"catalog:{page}")])
    rows.append([InlineKeyboardButton(text="⌂ Menu chính", callback_data="home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def product_detail_keyboard(product_id: int, page: int, available_stock: int, price: float, quantity: int = 1) -> InlineKeyboardMarkup:
    rows = []
    if available_stock > 0:
        if float(price) == 0:
            rows.append([InlineKeyboardButton(text="🎁 NHẬN 1 KEY MIỄN PHÍ", callback_data=f"buy:{product_id}:1")])
        else:
            quantity = max(1, min(quantity, available_stock, 20))
            rows.append([
                InlineKeyboardButton(text="−", callback_data=f"quantity:{product_id}:{page}:{max(1, quantity - 1)}"),
                InlineKeyboardButton(text=f"Số lượng: {quantity}", callback_data="noop"),
                InlineKeyboardButton(text="+", callback_data=f"quantity:{product_id}:{page}:{min(available_stock, 20, quantity + 1)}"),
            ])
            total = f"{float(price) * quantity:,.0f}đ".replace(",", ".")
            rows.append([InlineKeyboardButton(text=f"⚡ MUA {quantity} · {total}", callback_data=f"buy:{product_id}:{quantity}")])
    else:
        rows.append([InlineKeyboardButton(text="🔄 Kiểm tra lại tồn kho", callback_data=f"product:{product_id}:{page}")])
    rows.append([
        InlineKeyboardButton(text="‹ Danh sách", callback_data=f"catalog:{page}"),
        InlineKeyboardButton(text="⌂ Menu", callback_data="home"),
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def order_keyboard(code: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ TÔI ĐÃ CHUYỂN KHOẢN", callback_data=f"check:{code}")],
        [
            InlineKeyboardButton(text="🛍 Mua thêm", callback_data="catalog:0"),
            InlineKeyboardButton(text="⌂ Menu chính", callback_data="home"),
        ],
    ])


def delivered_keyboard(support_username: str = "") -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text="🛍 Tiếp tục mua hàng", callback_data="catalog:0")]]
    if support_username.startswith("@"):
        rows.append([InlineKeyboardButton(text="💬 Liên hệ hỗ trợ", url=f"https://t.me/{support_username[1:]}")])
    rows.append([InlineKeyboardButton(text="⌂ Menu chính", callback_data="home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def admin_order_keyboard(code: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Xác nhận đã nhận tiền", callback_data=f"admin_paid:{code}"),
        InlineKeyboardButton(text="❌ Hủy đơn", callback_data=f"admin_cancel:{code}"),
    ]])

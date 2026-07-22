from typing import Any

import httpx

from .config import settings


class KhoError(RuntimeError):
    pass


class KhoClient:
    def __init__(self, shop_id: int | None = None) -> None:
        headers={"Authorization": f"Bearer {settings.kho_bot_api_token}"}
        active_shop=shop_id or settings.bot_shop_id
        if active_shop:
            headers["X-Bot-Shop-Id"]=str(active_shop)
        self.client = httpx.AsyncClient(
            base_url=settings.kho_api_url.rstrip("/"),
            headers=headers,
            timeout=15,
        )

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        response = await self.client.request(method, path, **kwargs)
        data = response.json()
        if response.is_error:
            raise KhoError(data.get("error", "Kho không phản hồi"))
        return data

    async def products(self) -> list[dict[str, Any]]:
        return (await self._request("GET", "/api/bot/products"))["products"]

    async def create_order(self, product_id: int, user_id: int, chat_id: int, quantity: int = 1) -> dict[str, Any]:
        data = await self._request("POST", "/api/bot/orders", json={
            "productId": product_id,
            "telegramUserId": str(user_id),
            "telegramChatId": str(chat_id),
            "quantity": quantity,
        })
        return data["order"]

    async def order(self, code: str) -> dict[str, Any]:
        return (await self._request("GET", f"/api/bot/orders/{code}"))["order"]

    async def paid_orders(self) -> list[dict[str, Any]]:
        return (await self._request("GET", "/api/bot/orders?status=PAID"))["orders"]

    async def expire_orders(self) -> list[dict[str, Any]]:
        return (await self._request("POST", "/api/bot/orders/expire", json={}))["expired"]

    async def settings(self) -> dict[str, str]:
        return (await self._request("GET", "/api/bot/settings"))["settings"]

    async def payment_qr(self, path: str) -> tuple[bytes, str]:
        response = await self.client.get(path)
        if response.is_error:
            raise KhoError("Không thể tải ảnh QR thanh toán")
        return response.content, response.headers.get("content-type", "image/png")

    async def bot_config(self) -> dict[str, str]:
        return (await self._request("GET", "/api/bot/config"))["config"]

    async def shops(self) -> list[dict[str, Any]]:
        return (await self._request("GET", "/api/bot/configs"))["shops"]

    async def register_user(self, username: str) -> dict[str, Any]:
        return await self._request("POST", "/api/bot/users/register", json={"username": username})

    async def deliver(self, code: str, user_id: str) -> dict[str, Any]:
        return (await self._request("POST", f"/api/bot/orders/{code}", json={"telegramUserId": user_id}))["delivery"]

    async def set_order_status(self, code: str, status: str) -> dict[str, Any]:
        return await self._request("POST", f"/api/bot/orders/{code}/payment", json={"status": status})

    async def close(self) -> None:
        await self.client.aclose()

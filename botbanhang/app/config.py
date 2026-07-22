from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    kho_api_url: str = "http://127.0.0.1:3001"
    kho_bot_api_token: str
    bank_name: str = "MB Bank"
    bank_account: str
    bank_owner: str
    payment_qr_base_url: str = ""
    poll_interval_seconds: int = 5
    support_username: str = "@hotro_botnf"
    bot_shop_id: int | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()

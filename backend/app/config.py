from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    backend_api_key: str


try:
    settings = Settings()
except ValidationError as error:
    missing = ", ".join(str(detail["loc"][0]).upper() for detail in error.errors())
    raise SystemExit(f"Missing environment variables: {missing}. See .env.example.") from None

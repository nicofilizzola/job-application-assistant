from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    backend_api_key: str
    openai_api_key: str
    openai_model: str = "gpt-5.5"
    # Swaps the OpenAI call for a fixed answer. Playwright sets it: the analyse request is made
    # server-side, so the browser has nothing to intercept and the seam has to live here.
    ai_stub: bool = False


try:
    settings = Settings()
except ValidationError as error:
    missing = ", ".join(str(detail["loc"][0]).upper() for detail in error.errors())
    raise SystemExit(f"Missing environment variables: {missing}. See .env.example.") from None

"""Environment configuration; paths are independent of the working directory."""

import os
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    server_host: str = "127.0.0.1"
    server_port: int = Field(default=8000, ge=1, le=65535)
    cors_origins: list[str] = []
    auth_enabled: bool = True
    auth_encryption_keys: SecretStr = SecretStr("{}")
    auth_encryption_key_id: str = "primary"
    auth_lookup_key: SecretStr = SecretStr("")
    kakao_client_id: str = ""
    kakao_client_secret: SecretStr = SecretStr("")
    kakao_redirect_uri: str = ""
    kakao_web_url: str = ""
    auth_sqlite_path: Path = Path("data/auth.sqlite3")
    db_enabled: bool = False
    db_host: str = "127.0.0.1"
    db_port: int = Field(default=3307, ge=1, le=65535)
    db_name: str = "bokji_compass_dev"
    db_user: str = "bokji_dev"
    db_password: SecretStr = SecretStr("")
    db_ssl_ca: str = ""
    data_go_kr_api_key: SecretStr = SecretStr("")
    bokjiro_api_key: SecretStr = SecretStr("")
    codex_executable: str = ""
    codex_model: str = Field(default="gpt-5.6-luna", pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$")
    codex_reasoning_effort: Literal["low", "medium", "high", "xhigh"] = "medium"
    codex_fallback_model: str = Field(
        default="gpt-5.6-terra", pattern=r"^(?:[a-zA-Z0-9][a-zA-Z0-9._:/-]*)?$"
    )
    codex_timeout_seconds: int = Field(default=300, ge=10, le=1800)
    parsing_max_input_chars: int = Field(default=60000, ge=1000, le=200000)

    @model_validator(mode="after")
    def check_database_configuration(self) -> "Settings":
        if any("*" in origin for origin in self.cors_origins):
            raise ValueError("Credentialed auth requires explicit CORS origins, not wildcards")
        if self.db_enabled and not all(
            (self.db_host, self.db_name, self.db_user, self.db_password.get_secret_value())
        ):
            raise ValueError("DB_ENABLED requires host, database, user and password")
        return self


def load_settings() -> Settings:
    config_file = Path(os.environ.get("APP_CONFIG_FILE", BACKEND_ROOT / ".env"))
    if not config_file.is_absolute():
        config_file = BACKEND_ROOT / config_file
    if "APP_CONFIG_FILE" in os.environ and not config_file.is_file():
        raise ValueError("APP_CONFIG_FILE does not exist")
    return Settings(_env_file=config_file)

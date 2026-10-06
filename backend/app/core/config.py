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
    # Used only by explicit restoration of older encrypted databases.
    auth_encryption_keys: SecretStr = SecretStr("{}")
    auth_encryption_key_id: str = "primary"
    auth_lookup_key: SecretStr = SecretStr("")
    kakao_client_id: str = ""
    kakao_client_secret: SecretStr = SecretStr("")
    kakao_redirect_uri: str = ""
    kakao_web_url: str = ""
    auth_sqlite_path: Path = Path("data/auth.sqlite3")
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_security: Literal["starttls", "ssl"] = "starttls"
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_from_email: str = ""
    db_enabled: bool = False
    db_host: str = "127.0.0.1"
    db_port: int = Field(default=3307, ge=1, le=65535)
    db_name: str = "bokji_compass_dev"
    db_user: str = "bokji_dev"
    db_password: SecretStr = SecretStr("")
    db_ssl_ca: str = ""
    policy_auto_publish: bool = True
    data_go_kr_api_key: SecretStr = SecretStr("")
    bokjiro_api_key: SecretStr = SecretStr("")
    codex_executable: str = ""
    codex_model: str = Field(default="gpt-5.6-luna", pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$")
    codex_reasoning_effort: Literal["low", "medium", "high", "xhigh"] = "medium"
    codex_fallback_reasoning_effort: Literal["low", "medium", "high", "xhigh"] = "medium"
    codex_fallback_model: str = Field(
        default="gpt-5.6-terra", pattern=r"^(?:[a-zA-Z0-9][a-zA-Z0-9._:/-]*)?$"
    )
    codex_timeout_seconds: int = Field(default=300, ge=10, le=1800)
    parsing_max_input_chars: int = Field(default=60000, ge=1000, le=200000)
    ingestion_enabled: bool = True
    ingestion_profile: Literal["custom", "bootstrap", "steady"] = "custom"
    ingestion_ai_batch_size: int = Field(default=1, ge=1, le=8)
    ingestion_ai_batch_input_chars: int = Field(default=24000, ge=4000, le=100000)
    ingestion_page_size: int = Field(default=50, ge=1, le=100)
    ingestion_max_pages: int = Field(default=3, ge=0, le=30)
    ingestion_max_jobs: int = Field(default=5, ge=0, le=100)
    ingestion_max_seconds: int = Field(default=600, ge=15, le=3600)
    ingestion_max_http_calls: int = Field(default=10, ge=0, le=100)
    ingestion_max_response_bytes: int = Field(default=2_000_000, ge=1000, le=20_000_000)
    ingestion_http_interval_seconds: float = Field(default=2, ge=0, le=30)
    ingestion_max_model_calls: int = Field(default=4, ge=0, le=100)
    ingestion_max_tokens: int = Field(default=100000, ge=0, le=1000000)
    ingestion_daily_model_calls: int = Field(default=20, ge=0, le=1000)
    ingestion_daily_bokjiro_calls: int = Field(default=60, ge=0, le=100000)
    ingestion_daily_gov24_calls: int = Field(default=200, ge=0, le=100000)
    ingestion_daily_notice_calls: int = Field(default=20, ge=0, le=10000)
    ingestion_scan_interval_seconds: int = Field(default=86400, ge=600, le=604800)
    ingestion_recheck_seconds: int = Field(default=86400, ge=600, le=2592000)
    ingestion_queue_limit: int = Field(default=200, ge=1, le=100000)
    ingestion_max_attempts: int = Field(default=3, ge=1, le=10)
    ingestion_min_available_memory_mb: int = Field(default=512, ge=0, le=65536)
    ingestion_min_free_disk_mb: int = Field(default=512, ge=0, le=65536)
    ingestion_discovery_enabled: bool = False
    ingestion_discovery_domains: list[str] = ["youth.seoul.go.kr", "www.nowon.kr"]
    ingestion_discovery_query: str = "서울 노원구 복지 지원금 장학금 주거 지원 참여자 모집 공고"

    @model_validator(mode="after")
    def check_database_configuration(self) -> "Settings":
        if self.ingestion_queue_limit < self.ingestion_page_size:
            raise ValueError("Collection queue limit must fit at least one page")
        if any("*" in origin for origin in self.cors_origins):
            raise ValueError("Credentialed auth requires explicit CORS origins, not wildcards")
        if self.db_enabled and not all(
            (self.db_host, self.db_name, self.db_user, self.db_password.get_secret_value())
        ):
            raise ValueError("DB_ENABLED requires host, database, user and password")
        return self

    @property
    def auth_uses_mysql(self) -> bool:
        return self.db_enabled


def load_settings() -> Settings:
    config_file = Path(os.environ.get("APP_CONFIG_FILE", BACKEND_ROOT / ".env"))
    if not config_file.is_absolute():
        config_file = BACKEND_ROOT / config_file
    if "APP_CONFIG_FILE" in os.environ and not config_file.is_file():
        raise ValueError("APP_CONFIG_FILE does not exist")
    return Settings(_env_file=config_file)

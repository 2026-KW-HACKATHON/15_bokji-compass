"""MySQL connection factory. Construction never connects or creates tables."""

from sqlalchemy import URL, Engine, create_engine

from app.core.config import Settings


def create_database_engine(settings: Settings) -> Engine:
    url = URL.create(
        "mysql+pymysql",
        username=settings.db_user,
        password=settings.db_password.get_secret_value(),
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
        query={"charset": "utf8mb4"},
    )
    connect_args = {"connect_timeout": 3, "read_timeout": 3, "write_timeout": 3}
    if settings.db_ssl_ca:
        connect_args["ssl"] = {"ca": settings.db_ssl_ca, "check_hostname": True}
    return create_engine(
        url, pool_pre_ping=True, pool_size=5, max_overflow=0,
        pool_timeout=3, connect_args=connect_args,
    )

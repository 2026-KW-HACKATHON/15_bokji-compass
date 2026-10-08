"""Private member connections; public policy storage keeps its own connection pool."""

import ssl
from pathlib import Path

from sqlalchemy import URL, create_engine, event

from app.core.config import BACKEND_ROOT
from app.modules.auth.privacy import PrivacyError


def create_member_engine(settings):
    if not settings.auth_uses_mysql:
        path = settings.auth_sqlite_path
        if not path.is_absolute():
            path = BACKEND_ROOT / path
        path.parent.mkdir(parents=True, exist_ok=True)
        engine = create_engine(
            URL.create("sqlite", database=str(path)),
            connect_args={"check_same_thread": False, "timeout": 10},
            hide_parameters=True,
        )

        @event.listens_for(engine, "connect")
        def protect_sqlite(connection, record):
            cursor = connection.cursor()
            try:
                cursor.execute("PRAGMA secure_delete=ON")
                cursor.execute("PRAGMA temp_store=MEMORY")
            finally:
                cursor.close()

        return engine

    ca = settings.auth_db_ssl_ca or settings.db_ssl_ca
    remote = settings.db_host.lower() not in {"localhost", "127.0.0.1", "::1"}
    require_tls = bool(ca) or (settings.app_env == "production" and remote)
    if require_tls and not ca:
        raise PrivacyError("Remote production member storage requires AUTH_DB_SSL_CA or DB_SSL_CA")
    options = {
        "connect_timeout": 3,
        "read_timeout": 3,
        "write_timeout": 3,
        "local_infile": False,
    }
    if require_tls:
        try:
            ca_path = Path(ca)
            if not ca_path.is_absolute():
                ca_path = BACKEND_ROOT / ca_path
            context = ssl.create_default_context(cafile=str(ca_path))
            context.minimum_version = ssl.TLSVersion.TLSv1_2
            options["ssl"] = context
        except (OSError, ssl.SSLError, ValueError):
            raise PrivacyError("Invalid member database TLS configuration") from None
    engine = create_engine(
        URL.create(
            "mysql+pymysql",
            username=settings.auth_db_user or settings.db_user,
            password=(
                settings.auth_db_password if settings.auth_db_user else settings.db_password
            ).get_secret_value(),
            host=settings.db_host,
            port=settings.db_port,
            database=settings.db_name,
            query={"charset": "utf8mb4"},
        ),
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=0,
        pool_timeout=3,
        connect_args=options,
        hide_parameters=True,
    )
    if require_tls:

        @event.listens_for(engine, "connect")
        def require_encrypted_connection(connection, record):
            # Verify the negotiated transport before issuing any member query.
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SHOW SESSION STATUS LIKE 'Ssl_cipher'")
                    cipher = cursor.fetchone()
                    if not cipher or not cipher[1]:
                        raise PrivacyError("Member database refused an encrypted connection")
            except Exception:
                connection.close()
                raise

    return engine

"""One-use loopback setup form. Passwords stay out of arguments, logs, and chat."""

import argparse
import html
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs

from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.core.config import load_settings  # noqa: E402
from app.core.database import create_database_engine  # noqa: E402
from app.modules.admin.provision import create_operator  # noqa: E402
from app.modules.auth.privacy import PrivacyCipher, PrivacyError  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", default="bokji_admin")
    parser.add_argument("--share", action="store_true",
                        help="Use the shared site's configured member database")
    parser.add_argument("--port", type=int, default=5190)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Invalid port")
    settings = load_settings()
    try:
        cipher = PrivacyCipher(settings)
    except PrivacyError:
        parser.error("Configure member encryption and lookup keys before administrator setup")
    if settings.auth_uses_mysql:
        engine = create_database_engine(settings)
    elif settings.app_env == "test":
        db_path = settings.auth_sqlite_path
        if not db_path.is_absolute():
            db_path = BACKEND / db_path
        engine = create_engine("sqlite:///" + db_path.as_posix())
    else:
        parser.error("Development and production administrator accounts require MySQL")
    token = secrets.token_urlsafe(32)
    setup_path = "/setup/" + token
    deadline = time.monotonic() + 900
    origin = f"http://127.0.0.1:{args.port}"
    completed = False

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Never log the capability URL, form, password or cookie.

        def allowed(self):
            return (
                not completed
                and time.monotonic() < deadline
                and self.client_address[0] == "127.0.0.1"
                and self.headers.get("Host") == f"127.0.0.1:{args.port}"
                and self.path == setup_path
                and self.headers.get("Origin", origin) == origin
                and self.headers.get("Sec-Fetch-Site") != "cross-site"
                and not any(
                    key.lower().startswith("x-forwarded-")
                    or key.lower() in {"forwarded", "cf-connecting-ip"}
                    for key in self.headers
                )
            )

        def respond(self, status, message="", success=False):
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            # no-referrer turns a normal HTML form POST Origin into "null" in Chromium.
            # same-origin preserves the Origin check without leaking this local token externally.
            self.send_header("Referrer-Policy", "same-origin")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; "
                "base-uri 'none'; frame-ancestors 'none'",
            )
            self.end_headers()
            form = (
                ""
                if success or status == 403
                else f'''<form method="post" action="{setup_path}">
                <input type="hidden" name="csrf" value="{token}">
                <p>관리자 아이디: <strong>{html.escape(args.username)}</strong></p>
                <label>비밀번호<input name="password" type="password" autocomplete="new-password"
                required minlength="12" maxlength="128"></label>
                <label>비밀번호 확인<input name="confirm" type="password"
                autocomplete="new-password"
                required minlength="12" maxlength="128"></label>
                <p>영문과 숫자를 포함해 12자 이상 입력해 주세요.
                휴대전화 인증은 필요하지 않습니다.</p>
                <button>관리자 계정 만들기</button></form>'''
            )
            body = f"""<!doctype html><html lang="ko"><meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>복지나침반 관리자 계정 설정</title>
                <style>body{{font-family:system-ui,sans-serif;background:#f1f6f3;
                color:#17324d;padding:32px}}
                main{{max-width:460px;margin:auto;background:white;
                padding:28px;border-radius:18px}}label{{display:block;margin:20px 0}}
                input:not([type=hidden]){{box-sizing:border-box;width:100%;padding:12px;margin-top:8px}}
                button{{background:#087b52;color:white;border:0;border-radius:8px;
                padding:14px 20px;font-size:16px}}p{{line-height:1.7}}</style>
                <main><h1>관리자 계정 설정</h1><p>{html.escape(message)}</p>{form}</main></html>"""
            self.wfile.write(body.encode())

        def do_GET(self):
            if not self.allowed():
                self.respond(403, "설정 링크가 만료되었거나 허용되지 않은 접속입니다.")
                return
            self.respond(
                200,
                "이 PC에서 한 번만 사용하는 설정 화면입니다. "
                "비밀번호는 서버에서 해시로 저장됩니다.",
            )

        def do_POST(self):
            nonlocal completed
            if not self.allowed():
                self.respond(403, "허용되지 않은 요청입니다.")
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if (
                    not 0 < length <= 4096
                    or self.headers.get("Content-Type") != "application/x-www-form-urlencoded"
                ):
                    raise ValueError("입력 형식을 확인해 주세요.")
                data = parse_qs(self.rfile.read(length).decode("utf-8"), max_num_fields=3)
                if not secrets.compare_digest(data.get("csrf", [""])[0], token):
                    self.respond(403, "허용되지 않은 요청입니다.")
                    return
                password = data.get("password", [""])[0]
                if password != data.get("confirm", [""])[0]:
                    raise ValueError("비밀번호 확인이 일치하지 않습니다.")
                create_operator(engine, args.username, password,
                                cipher=cipher, role="superadmin")
            except PrivacyError:
                self.respond(503, "회원 정보 보안 설정과 데이터 이관 상태를 확인해 주세요.")
                return
            except ValueError as error:
                self.respond(400, str(error))
                return
            except SQLAlchemyError:
                self.respond(
                    409, "계정 생성에 실패했습니다. 중복 계정 또는 DB 상태를 확인해 주세요."
                )
                return
            completed = True
            self.respond(
                201,
                "관리자 계정을 만들었습니다. 이 창을 닫고 복지나침반 사이트에서 로그인해 주세요.",
                success=True,
            )
            print("ADMIN_SETUP_COMPLETE", flush=True)
            threading.Thread(target=self.server.shutdown, daemon=True).start()

    server = HTTPServer(("127.0.0.1", args.port), Handler)
    server.timeout = 5
    timer = threading.Timer(900, server.shutdown)
    timer.daemon = True
    timer.start()
    print("ADMIN_SETUP_URL=" + origin + setup_path, flush=True)
    try:
        server.serve_forever()
    finally:
        timer.cancel()
        server.server_close()
        engine.dispose()


if __name__ == "__main__":
    main()

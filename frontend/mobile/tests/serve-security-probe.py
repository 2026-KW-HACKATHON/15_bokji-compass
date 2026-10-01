"""Local-only redirect regression fixture. Never use real account credentials.

Start this process, point a development build at http://127.0.0.1:8772,
and attempt login with dummy inputs. /stats must show origin_posts=1,
sink_requests=0. Request bodies are discarded, never stored or logged.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading

stats = {"origin_posts": 0, "sink_requests": 0}


class Probe(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path == "/stats" and self.server.server_port == 8772:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(stats).encode())
        else:
            self.respond()

    def do_POST(self):
        self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 16384))
        self.respond()

    def respond(self):
        if self.server.server_port == 8772:
            if self.command == "POST":
                stats["origin_posts"] += 1
            self.send_response(307)
            self.send_header("Location", "http://127.0.0.1:8773/sink")
            self.end_headers()
        else:
            stats["sink_requests"] += 1
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b"{}")


if __name__ == "__main__":
    sink = ThreadingHTTPServer(("127.0.0.1", 8773), Probe)
    threading.Thread(target=sink.serve_forever, daemon=True).start()
    print("Local redirect probe ready on 8772/8773; dummy credentials only", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8772), Probe).serve_forever()

#!/usr/bin/env python3
from __future__ import annotations

import http.server
import socketserver
import threading
import webbrowser
import socket
from contextlib import closing

HTML = (
    """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Happy Face</title>
  <style>
    html, body { height: 100%; margin: 0; }
    body { display: grid; place-items: center; background: #111; color: #ffe66d; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Helvetica, Arial, sans-serif; }
    .face { font-size: clamp(64px, 15vw, 200px); line-height: 1; }
    .note { position: fixed; bottom: 14px; left: 0; right: 0; text-align: center; color: #aaa; font-size: 14px; }
    a { color: #8ecae6; text-decoration: none; }
  </style>
</head>
<body>
  <div class="face">😊</div>
  <div class="note">Have a nice day!</div>
</body>
</html>
"""
).lstrip()


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 (tiny script)
        if self.path in {"/", "/index.html"}:
            body = HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404, "Not Found")

    def log_message(self, fmt: str, *args) -> None:  # quieter
        # Minimal logging; comment out next line to silence completely
        super().log_message(fmt, *args)


def get_free_port() -> int:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def serve_and_open() -> None:
    port = get_free_port()
    address = ("127.0.0.1", port)
    with socketserver.TCPServer(address, Handler) as httpd:
        url = f"http://{address[0]}:{address[1]}/"
        # Start server thread so we can open the browser without blocking
        t = threading.Thread(target=httpd.serve_forever, name="happy-http", daemon=True)
        t.start()
        print(f"Serving happy face at {url}")
        try:
            webbrowser.open(url, new=1, autoraise=True)
        except Exception as e:  # noqa: BLE001 - tiny script, best-effort open
            print(f"Browser open failed: {e}. Open manually: {url}")
        try:
            t.join()  # run until Ctrl+C
        except KeyboardInterrupt:
            pass
        finally:
            httpd.shutdown()
            httpd.server_close()


if __name__ == "__main__":
    serve_and_open()

#!/usr/bin/env python3
"""HTTP API: POST /resolve — konum düzəlişi (port 5001)."""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

from location_resolver import resolve_location

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "5001"))


class LocationHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        print(f"[location_api] {self.address_string()} - {fmt % args}")

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path in ("/", "/health"):
            self._send_json(200, {"status": "ok", "service": "location_resolver"})
            return
        self._send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path != "/resolve":
            self._send_json(404, {"error": "not_found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._send_json(400, {"error": "invalid_json"})
            return

        try:
            result = resolve_location(
                latitude=payload.get("latitude", 0),
                longitude=payload.get("longitude", 0),
                accuracy=payload.get("accuracy"),
                client_ip=payload.get("client_ip"),
                hint_region=payload.get("hint_region"),
            )
            self._send_json(200, result)
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})


def main() -> None:
    server = HTTPServer((HOST, PORT), LocationHandler)
    print(f"🐍 Python Location API: http://{HOST}:{PORT}/resolve")
    server.serve_forever()


if __name__ == "__main__":
    main()

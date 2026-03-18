#!/usr/bin/env python3
"""
Reverse proxy multi-worktree pour le dev Himalayan 450 Analyzer.

Lance sur localhost:3000 (configurable), forward tout vers le frontend Vite
du worktree actif. Dashboard a /_proxy/.
"""

import argparse
import http.client
import http.server
import json
import os
import socket
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

STATE_FILE = Path.home() / ".himalayan-proxy.json"


def _load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {"worktrees": {}, "active": None}


def _save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def _check_port(host: str, port: int, timeout: float = 0.5) -> bool:
    for family in (socket.AF_INET, socket.AF_INET6):
        try:
            addr = "::1" if family == socket.AF_INET6 else host
            with socket.socket(family, socket.SOCK_STREAM) as s:
                s.settimeout(timeout)
                s.connect((addr, port))
                return True
        except (OSError, socket.timeout):
            continue
    return False


DASHBOARD_HTML = """\
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dev Proxy — Himalayan 450</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #f8fafc; }
  h1 span { color: #64748b; font-weight: 400; font-size: 1rem; margin-left: 0.5rem; }
  .empty { color: #64748b; padding: 2rem; text-align: center; border: 1px dashed #334155; border-radius: 0.5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1rem; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 0.5rem; padding: 1.25rem; transition: border-color 0.2s; }
  .card.active { border-color: #22d3ee; box-shadow: 0 0 0 1px #22d3ee33; }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
  .card-name { font-size: 1.1rem; font-weight: 600; color: #f8fafc; }
  .badge { font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 9999px; font-weight: 600; text-transform: uppercase; }
  .badge-online { background: #064e3b; color: #34d399; }
  .badge-offline { background: #450a0a; color: #f87171; }
  .badge-active { background: #164e63; color: #22d3ee; margin-left: 0.4rem; }
  .meta { font-size: 0.82rem; color: #94a3b8; margin-bottom: 0.15rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta b { color: #cbd5e1; font-weight: 500; }
  .actions { margin-top: 0.75rem; display: flex; gap: 0.5rem; }
  button { cursor: pointer; border: none; padding: 0.4rem 0.9rem; border-radius: 0.375rem; font-size: 0.82rem; font-weight: 500; transition: background 0.15s; }
  .btn-switch { background: #0e7490; color: #fff; }
  .btn-switch:hover { background: #0891b2; }
  .btn-switch:disabled { opacity: 0.4; cursor: default; }
  .btn-remove { background: #991b1b; color: #fca5a5; }
  .btn-remove:hover { background: #b91c1c; }
  .refresh-note { margin-top: 1.5rem; font-size: 0.75rem; color: #475569; text-align: center; }
</style>
</head>
<body>
<h1>Dev Proxy <span>localhost:{{PORT}}</span></h1>
<div id="root"></div>
<div class="refresh-note">Auto-refresh 5s</div>
<script>
const ROOT = document.getElementById('root');
async function load() {
  try {
    const r = await fetch('/_proxy/api/worktrees');
    const d = await r.json();
    render(d);
  } catch(e) {
    ROOT.innerHTML = '<div class="empty">Erreur de chargement</div>';
  }
}
function render(data) {
  const wts = Object.values(data.worktrees || {});
  if (!wts.length) {
    ROOT.innerHTML = '<div class="empty">Aucun worktree enregistre.<br>Lance <code>make dev</code> dans un projet.</div>';
    return;
  }
  ROOT.innerHTML = '<div class="grid">' + wts.map(w => {
    const isActive = w.name === data.active;
    const onlineBadge = w.online
      ? '<span class="badge badge-online">online</span>'
      : '<span class="badge badge-offline">offline</span>';
    const activeBadge = isActive ? '<span class="badge badge-active">actif</span>' : '';
    return `<div class="card ${isActive ? 'active' : ''}">
      <div class="card-header">
        <span class="card-name">${esc(w.name)}</span>
        <div>${onlineBadge}${activeBadge}</div>
      </div>
      <div class="meta"><b>Frontend</b> :${w.frontend_port} &nbsp; <b>Backend</b> :${w.backend_port}</div>
      <div class="meta"><b>Path</b> ${esc(w.path)}</div>
      <div class="actions">
        <button class="btn-switch" ${isActive ? 'disabled' : ''} onclick="sw('${esc(w.name)}')">Switch</button>
        <button class="btn-remove" onclick="rm('${esc(w.name)}')">Retirer</button>
      </div>
    </div>`;
  }).join('') + '</div>';
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
async function sw(name) {
  await fetch('/_proxy/api/switch/' + encodeURIComponent(name), {method:'POST'});
  load();
}
async function rm(name) {
  await fetch('/_proxy/api/worktrees/' + encodeURIComponent(name), {method:'DELETE'});
  load();
}
load();
setInterval(load, 5000);
</script>
</body>
</html>
"""


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    state = _load_state()
    lock = threading.Lock()

    def log_message(self, format, *args):
        # Silencer les logs standards, sauf erreurs
        pass

    # ─── Control endpoints ──────────────────────────────────────────────

    def _is_control(self) -> bool:
        return self.path.startswith("/_proxy/")

    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, html: str):
        body = html.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length) if length else b""

    def _handle_control(self):
        path = self.path

        # Dashboard
        if path in ("/_proxy/", "/_proxy"):
            html = DASHBOARD_HTML.replace("{{PORT}}", str(self.server.server_address[1]))
            self._send_html(html)
            return

        # List worktrees (with health check)
        if path == "/_proxy/api/worktrees" and self.command == "GET":
            with self.lock:
                state = self.__class__.state
                for wt in state["worktrees"].values():
                    wt["online"] = _check_port("127.0.0.1", wt["frontend_port"])
                self._send_json(state)
            return

        # Register worktree
        if path == "/_proxy/api/worktrees" and self.command == "POST":
            body = json.loads(self._read_body())
            name = body["name"]
            with self.lock:
                state = self.__class__.state
                state["worktrees"][name] = {
                    "name": name,
                    "frontend_port": body["frontend_port"],
                    "backend_port": body["backend_port"],
                    "path": body["path"],
                    "online": True,
                }
                # Auto-switch si c'est le premier ou si pas d'actif
                if state["active"] is None or state["active"] not in state["worktrees"]:
                    state["active"] = name
                _save_state(state)
                self._send_json({"registered": name})
            return

        # Unregister worktree
        if path.startswith("/_proxy/api/worktrees/") and self.command == "DELETE":
            name = path.split("/_proxy/api/worktrees/", 1)[1]
            with self.lock:
                state = self.__class__.state
                state["worktrees"].pop(name, None)
                if state["active"] == name:
                    # Switcher vers le premier restant
                    remaining = list(state["worktrees"].keys())
                    state["active"] = remaining[0] if remaining else None
                _save_state(state)
                self._send_json({"unregistered": name})
            return

        # Switch active
        if path.startswith("/_proxy/api/switch/") and self.command == "POST":
            name = path.split("/_proxy/api/switch/", 1)[1]
            with self.lock:
                state = self.__class__.state
                if name in state["worktrees"]:
                    state["active"] = name
                    _save_state(state)
                    self._send_json({"active": name})
                else:
                    self._send_json({"error": f"worktree '{name}' non enregistre"}, 404)
            return

        self._send_json({"error": "not found"}, 404)

    # ─── Proxy logic ────────────────────────────────────────────────────

    def _get_target(self) -> tuple[str, int] | None:
        with self.lock:
            state = self.__class__.state
            active = state.get("active")
            if active and active in state["worktrees"]:
                wt = state["worktrees"][active]
                return ("127.0.0.1", wt["frontend_port"])
        return None

    def _proxy_request(self):
        target = self._get_target()
        if not target:
            self.send_response(502)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Aucun worktree actif. Ouvre /_proxy/ pour configurer.")
            return

        host, port = target

        # WebSocket upgrade detection
        if self.headers.get("Upgrade", "").lower() == "websocket":
            self._proxy_websocket(host, port)
            return

        # Regular HTTP proxy
        try:
            conn = http.client.HTTPConnection(host, port, timeout=30)
            # Read request body
            body = self._read_body()
            # Forward headers
            headers = {}
            for key in self.headers:
                if key.lower() not in ("host", "transfer-encoding"):
                    headers[key] = self.headers[key]
            headers["Host"] = f"{host}:{port}"

            conn.request(self.command, self.path, body=body if body else None, headers=headers)
            resp = conn.getresponse()

            self.send_response(resp.status)
            # Forward response headers
            for key, value in resp.getheaders():
                if key.lower() not in ("transfer-encoding",):
                    self.send_header(key, value)
            self.end_headers()

            # Stream response body
            while True:
                chunk = resp.read(8192)
                if not chunk:
                    break
                self.wfile.write(chunk)

            conn.close()
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(f"Proxy error: {e}".encode())

    def _proxy_websocket(self, host: str, port: int):
        """Relay WebSocket en mode raw socket bidirectionnel."""
        try:
            # Connexion au backend
            backend_sock = socket.create_connection((host, port), timeout=5)

            # Reconstruire la requete HTTP d'upgrade
            request_line = f"{self.command} {self.path} HTTP/1.1\r\n"
            headers = ""
            for key in self.headers:
                if key.lower() != "host":
                    headers += f"{key}: {self.headers[key]}\r\n"
                else:
                    headers += f"Host: {host}:{port}\r\n"
            raw_request = (request_line + headers + "\r\n").encode()
            backend_sock.sendall(raw_request)

            # Lire la reponse d'upgrade du backend et la renvoyer au client
            client_sock = self.request
            backend_response = b""
            while b"\r\n\r\n" not in backend_response:
                chunk = backend_sock.recv(4096)
                if not chunk:
                    break
                backend_response += chunk

            client_sock.sendall(backend_response)

            # Relay bidirectionnel
            def relay(src, dst, name):
                try:
                    while True:
                        data = src.recv(8192)
                        if not data:
                            break
                        dst.sendall(data)
                except (OSError, BrokenPipeError):
                    pass
                finally:
                    try:
                        dst.shutdown(socket.SHUT_WR)
                    except OSError:
                        pass

            t1 = threading.Thread(target=relay, args=(client_sock, backend_sock, "client->backend"), daemon=True)
            t2 = threading.Thread(target=relay, args=(backend_sock, client_sock, "backend->client"), daemon=True)
            t1.start()
            t2.start()
            t1.join()
            t2.join()

            backend_sock.close()

        except Exception:
            try:
                self.send_response(502)
                self.end_headers()
            except OSError:
                pass

    # ─── HTTP method handlers ───────────────────────────────────────────

    def do_GET(self):
        if self._is_control():
            self._handle_control()
        else:
            self._proxy_request()

    def do_POST(self):
        if self._is_control():
            self._handle_control()
        else:
            self._proxy_request()

    def do_PUT(self):
        self._proxy_request()

    def do_PATCH(self):
        self._proxy_request()

    def do_DELETE(self):
        if self._is_control():
            self._handle_control()
        else:
            self._proxy_request()

    def do_OPTIONS(self):
        self._proxy_request()

    def do_HEAD(self):
        self._proxy_request()


class ThreadedHTTPServer(http.server.HTTPServer):
    """HTTP server qui gere chaque requete dans un thread separe."""
    allow_reuse_address = True

    def process_request(self, request, client_address):
        t = threading.Thread(target=self._handle_request_thread, args=(request, client_address), daemon=True)
        t.start()

    def _handle_request_thread(self, request, client_address):
        try:
            self.finish_request(request, client_address)
        except Exception:
            self.handle_error(request, client_address)
        finally:
            self.shutdown_request(request)


def main():
    parser = argparse.ArgumentParser(description="Dev proxy multi-worktree")
    parser.add_argument("--port", type=int, default=3000, help="Port du proxy (defaut: 3000)")
    args = parser.parse_args()

    # Charger l'etat existant
    ProxyHandler.state = _load_state()

    server = ThreadedHTTPServer(("127.0.0.1", args.port), ProxyHandler)
    print(f"Dev proxy demarre sur http://localhost:{args.port}")
    print(f"Dashboard : http://localhost:{args.port}/_proxy/")
    print(f"Etat : {STATE_FILE}")
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nProxy arrete.")
        server.shutdown()


if __name__ == "__main__":
    main()

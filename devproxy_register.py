#!/usr/bin/env python3
"""Helper CLI pour le devproxy : find-ports, register, unregister."""

import json
import socket
import sys
import urllib.request
import urllib.error


def _port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def find_ports():
    """Trouve un port backend libre (base 8000) et un port frontend libre (base 5173)."""
    backend_port = 8000
    while not _port_is_free(backend_port):
        backend_port += 1
        if backend_port > 8100:
            print("ERREUR: aucun port backend libre entre 8000 et 8100", file=sys.stderr)
            sys.exit(1)

    frontend_port = 5173
    while not _port_is_free(frontend_port):
        frontend_port += 1
        if frontend_port > 5273:
            print("ERREUR: aucun port frontend libre entre 5173 et 5273", file=sys.stderr)
            sys.exit(1)

    # Affiche sur stdout pour capture par le Makefile
    print(f"{backend_port} {frontend_port}")


def register(proxy_port: int, name: str, frontend_port: int, backend_port: int, path: str):
    """Enregistre un worktree aupres du proxy."""
    data = json.dumps({
        "name": name,
        "frontend_port": frontend_port,
        "backend_port": backend_port,
        "path": path,
    }).encode()
    req = urllib.request.Request(
        f"http://localhost:{proxy_port}/_proxy/api/worktrees",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=2)
    except (urllib.error.URLError, OSError):
        pass  # proxy pas lance, on ignore


def unregister(proxy_port: int, name: str):
    """Desenregistre un worktree du proxy."""
    req = urllib.request.Request(
        f"http://localhost:{proxy_port}/_proxy/api/worktrees/{name}",
        method="DELETE",
    )
    try:
        urllib.request.urlopen(req, timeout=2)
    except (urllib.error.URLError, OSError):
        pass  # proxy pas lance, on ignore


def main():
    if len(sys.argv) < 2:
        print("Usage: devproxy_register.py <find-ports|register|unregister> [args...]", file=sys.stderr)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "find-ports":
        find_ports()
    elif cmd == "register":
        if len(sys.argv) != 7:
            print("Usage: devproxy_register.py register <proxy_port> <name> <frontend_port> <backend_port> <path>", file=sys.stderr)
            sys.exit(1)
        register(int(sys.argv[2]), sys.argv[3], int(sys.argv[4]), int(sys.argv[5]), sys.argv[6])
    elif cmd == "unregister":
        if len(sys.argv) != 4:
            print("Usage: devproxy_register.py unregister <proxy_port> <name>", file=sys.stderr)
            sys.exit(1)
        unregister(int(sys.argv[2]), sys.argv[3])
    else:
        print(f"Commande inconnue : {cmd}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

from __future__ import annotations

import shlex
import socket
import subprocess
import time
from dataclasses import dataclass
from typing import Any


class SessionTerminationError(RuntimeError):
    pass


@dataclass(frozen=True)
class OpenVPNControlSettings:
    terminate_command: str
    management_tcp_socket: str
    management_udp_socket: str
    management_timeout_seconds: float


class OpenVPNControlService:
    def __init__(self, settings: OpenVPNControlSettings) -> None:
        self._settings = settings

    def terminate_session(self, session: dict[str, Any]) -> dict[str, Any]:
        if self._settings.terminate_command:
            return self._terminate_with_command(session)
        return self._terminate_with_management_socket(session)

    def _terminate_with_command(self, session: dict[str, Any]) -> dict[str, Any]:
        template_values = {
            "username": str(session.get("username", "")),
            "common_name": str(session.get("common_name", "")),
            "real_address": str(session.get("real_address", "")),
            "virtual_address": str(session.get("virtual_address", "")),
            "protocol": str(session.get("protocol", "unknown")),
            "client_id": str(session.get("client_id", "")),
        }

        try:
            rendered = self._settings.terminate_command.format_map(template_values)
        except KeyError as exc:
            raise SessionTerminationError(f"Terminate command has unknown placeholder: {exc}") from exc

        argv = shlex.split(rendered)
        if not argv:
            raise SessionTerminationError("Terminate command is empty after rendering")

        started = time.perf_counter()
        try:
            completed = subprocess.run(
                argv,
                check=True,
                capture_output=True,
                text=True,
                timeout=max(1.0, self._settings.management_timeout_seconds),
            )
        except subprocess.CalledProcessError as exc:
            details = (exc.stderr or exc.stdout or "").strip()
            raise SessionTerminationError(f"Terminate command failed: {details or f'exit={exc.returncode}'}") from exc
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise SessionTerminationError(f"Terminate command failed to execute: {exc}") from exc

        output = (completed.stdout or "").strip()
        return {
            "method": "command",
            "result": output or "command-completed",
            "latency_ms": round((time.perf_counter() - started) * 1000.0, 3),
        }

    def _terminate_with_management_socket(self, session: dict[str, Any]) -> dict[str, Any]:
        protocol = str(session.get("protocol", "")).strip().lower()
        socket_path = self._resolve_socket_path(protocol)
        if not socket_path:
            raise SessionTerminationError(
                "No OpenVPN management socket configured. Set PORTAL_OPENVPN_MANAGEMENT_TCP_SOCKET/"
                "PORTAL_OPENVPN_MANAGEMENT_UDP_SOCKET or PORTAL_CONTROL_TERMINATE_COMMAND."
            )

        commands: list[str] = []
        client_id = session.get("client_id")
        if isinstance(client_id, int) and client_id > 0:
            commands.append(f"client-kill {client_id}")

        real_address = str(session.get("real_address", "")).strip()
        if real_address:
            commands.append(f"kill {real_address}")

        common_name = str(session.get("common_name", "")).strip()
        if common_name:
            commands.append(f"kill {common_name}")

        if not commands:
            raise SessionTerminationError("Session does not contain enough information to terminate")

        timeout = max(1.0, self._settings.management_timeout_seconds)
        success_line = ""
        started = time.perf_counter()

        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
                sock.settimeout(timeout)
                sock.connect(socket_path)

                _ = self._recv_available(sock)
                for command in commands:
                    self._send_line(sock, command)
                    response = self._recv_available(sock)
                    if self._is_success_response(response):
                        success_line = response.strip().splitlines()[-1] if response.strip() else "SUCCESS"
                        break

                self._send_line(sock, "quit")
        except (ConnectionError, OSError, TimeoutError) as exc:
            raise SessionTerminationError(f"Management socket operation failed: {exc}") from exc

        if not success_line:
            raise SessionTerminationError("OpenVPN management did not acknowledge session termination")

        return {
            "method": "management_socket",
            "result": success_line,
            "latency_ms": round((time.perf_counter() - started) * 1000.0, 3),
        }

    def _resolve_socket_path(self, protocol: str) -> str:
        if protocol == "tcp":
            return self._settings.management_tcp_socket
        if protocol == "udp":
            return self._settings.management_udp_socket
        return self._settings.management_tcp_socket or self._settings.management_udp_socket

    @staticmethod
    def _send_line(sock: socket.socket, line: str) -> None:
        payload = f"{line}\n".encode("utf-8", errors="ignore")
        sock.sendall(payload)

    @staticmethod
    def _recv_available(sock: socket.socket) -> str:
        chunks: list[bytes] = []
        while True:
            try:
                chunk = sock.recv(4096)
            except TimeoutError:
                break
            if not chunk:
                break
            chunks.append(chunk)
            if len(chunk) < 4096:
                break
        return b"".join(chunks).decode("utf-8", errors="ignore")

    @staticmethod
    def _is_success_response(response: str) -> bool:
        upper = response.upper()
        if "SUCCESS" in upper:
            return True
        if "ERROR" in upper:
            return False
        return "CLIENT INSTANCE" in upper and "TERMINATED" in upper

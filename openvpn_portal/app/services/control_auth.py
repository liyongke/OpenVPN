from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hmac import compare_digest


class ControlAuthError(RuntimeError):
    pass


@dataclass(frozen=True)
class ControlAuthSettings:
    username: str
    password: str
    session_ttl_seconds: int
    max_sessions: int


class ControlAuthService:
    def __init__(self, settings: ControlAuthSettings) -> None:
        self._settings = settings
        self._sessions: dict[str, datetime] = {}

    @property
    def enabled(self) -> bool:
        return bool(self._settings.username and self._settings.password)

    def authenticate(self, username: str, password: str) -> str:
        if not self.enabled:
            raise ControlAuthError("Control auth is not configured")

        provided_user = (username or "").strip()
        provided_pass = password or ""
        if not compare_digest(provided_user, self._settings.username):
            raise ControlAuthError("Invalid username or password")
        if not compare_digest(provided_pass, self._settings.password):
            raise ControlAuthError("Invalid username or password")

        self._prune_expired()
        if len(self._sessions) >= max(1, self._settings.max_sessions):
            # Drop oldest session first to keep service available.
            oldest = min(self._sessions.items(), key=lambda item: item[1])[0]
            self._sessions.pop(oldest, None)

        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=max(60, self._settings.session_ttl_seconds))
        self._sessions[token] = expires_at
        return token

    def validate_session(self, token: str) -> bool:
        token_value = (token or "").strip()
        if not token_value:
            return False
        self._prune_expired()
        expires_at = self._sessions.get(token_value)
        if not expires_at:
            return False
        if expires_at <= datetime.now(timezone.utc):
            self._sessions.pop(token_value, None)
            return False
        return True

    def logout(self, token: str) -> None:
        token_value = (token or "").strip()
        if token_value:
            self._sessions.pop(token_value, None)

    def _prune_expired(self) -> None:
        now_utc = datetime.now(timezone.utc)
        expired = [token for token, expires_at in self._sessions.items() if expires_at <= now_utc]
        for token in expired:
            self._sessions.pop(token, None)

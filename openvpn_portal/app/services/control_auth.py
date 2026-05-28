from __future__ import annotations

import base64
import binascii
import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hmac import compare_digest
from threading import Lock


class ControlAuthError(RuntimeError):
    pass


@dataclass(frozen=True)
class ControlAuthSettings:
    username: str
    password: str
    password_hash: str
    session_ttl_seconds: int
    max_sessions: int
    max_failed_attempts: int
    failed_attempt_window_seconds: int
    lockout_seconds: int


class ControlAuthService:
    def __init__(self, settings: ControlAuthSettings) -> None:
        self._settings = settings
        self._sessions: dict[str, datetime] = {}
        self._failed_attempts: dict[str, list[datetime]] = {}
        self._locked_until: dict[str, datetime] = {}
        self._lock = Lock()

    @property
    def enabled(self) -> bool:
        return bool(self._settings.username and (self._settings.password or self._settings.password_hash))

    def authenticate(self, username: str, password: str, client_id: str = "global") -> str:
        if not self.enabled:
            raise ControlAuthError("Control auth is not configured")

        provided_user = (username or "").strip()
        provided_pass = password or ""
        scope = (client_id or "global").strip() or "global"
        now_utc = datetime.now(timezone.utc)

        with self._lock:
            self._prune_expired(now_utc)
            self._prune_failures(now_utc)

            locked_until = self._locked_until.get(scope)
            if locked_until and locked_until > now_utc:
                raise ControlAuthError("Too many failed attempts. Try again later")

            user_ok = compare_digest(provided_user, self._settings.username)
            pass_ok = self._verify_password(provided_pass)
            if not user_ok or not pass_ok:
                self._record_failed_attempt(scope, now_utc)
                raise ControlAuthError("Invalid username or password")

            self._failed_attempts.pop(scope, None)
            self._locked_until.pop(scope, None)

            if len(self._sessions) >= max(1, self._settings.max_sessions):
                # Drop oldest session first to keep service available.
                oldest = min(self._sessions.items(), key=lambda item: item[1])[0]
                self._sessions.pop(oldest, None)

            token = secrets.token_urlsafe(32)
            expires_at = now_utc + timedelta(seconds=max(60, self._settings.session_ttl_seconds))
            self._sessions[token] = expires_at
            return token

    def validate_session(self, token: str) -> bool:
        token_value = (token or "").strip()
        if not token_value:
            return False
        now_utc = datetime.now(timezone.utc)
        with self._lock:
            self._prune_expired(now_utc)
            expires_at = self._sessions.get(token_value)
            if not expires_at:
                return False
            if expires_at <= now_utc:
                self._sessions.pop(token_value, None)
                return False
            return True

    def logout(self, token: str) -> None:
        token_value = (token or "").strip()
        if token_value:
            with self._lock:
                self._sessions.pop(token_value, None)

    def _prune_expired(self, now_utc: datetime) -> None:
        expired = [token for token, expires_at in self._sessions.items() if expires_at <= now_utc]
        for token in expired:
            self._sessions.pop(token, None)

    def _prune_failures(self, now_utc: datetime) -> None:
        window_seconds = max(30, self._settings.failed_attempt_window_seconds)
        cutoff = now_utc - timedelta(seconds=window_seconds)
        for key, timestamps in list(self._failed_attempts.items()):
            kept = [ts for ts in timestamps if ts > cutoff]
            if kept:
                self._failed_attempts[key] = kept
            else:
                self._failed_attempts.pop(key, None)

        for key, locked_until in list(self._locked_until.items()):
            if locked_until <= now_utc:
                self._locked_until.pop(key, None)

    def _record_failed_attempt(self, scope: str, now_utc: datetime) -> None:
        entries = self._failed_attempts.get(scope, [])
        entries.append(now_utc)
        self._failed_attempts[scope] = entries

        threshold = max(2, self._settings.max_failed_attempts)
        if len(entries) >= threshold:
            lockout_seconds = max(10, self._settings.lockout_seconds)
            self._locked_until[scope] = now_utc + timedelta(seconds=lockout_seconds)
            self._failed_attempts.pop(scope, None)

    def _verify_password(self, provided_password: str) -> bool:
        encoded = (self._settings.password_hash or "").strip()
        if encoded:
            if self._verify_pbkdf2_hash(provided_password, encoded):
                return True
            if self._settings.password:
                return compare_digest(provided_password, self._settings.password)
            return False
        return compare_digest(provided_password, self._settings.password)

    @staticmethod
    def _verify_pbkdf2_hash(password: str, encoded_hash: str) -> bool:
        # Format: pbkdf2_sha256$<iterations>$<salt_b64>$<digest_b64>
        try:
            algorithm, iterations_raw, salt_b64, digest_b64 = encoded_hash.split("$", 3)
            if algorithm != "pbkdf2_sha256":
                return False
            iterations = int(iterations_raw)
            if iterations < 100000:
                return False
            salt = base64.b64decode(salt_b64.encode("ascii"), validate=True)
            expected_digest = base64.b64decode(digest_b64.encode("ascii"), validate=True)
        except (ValueError, binascii.Error):
            return False

        computed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return compare_digest(computed, expected_digest)

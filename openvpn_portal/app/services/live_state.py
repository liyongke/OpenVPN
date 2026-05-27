from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

from app.services.history_store import HistoryStore
from app.services.openvpn_reader import load_openvpn_status_multi


class LiveStateCollector:
    def __init__(
        self,
        status_files: list[str],
        poll_interval_seconds: float = 2.0,
        history_store: HistoryStore | None = None,
        history_sample_seconds: int = 60,
        device_hints_file: str = "",
    ) -> None:
        self.status_files = status_files
        self.poll_interval_seconds = poll_interval_seconds
        self.history_store = history_store
        self.history_sample_seconds = max(10, history_sample_seconds)
        self.device_hints_file = device_hints_file
        self._latest_payload: dict[str, Any] = load_openvpn_status_multi(status_files, device_hints_file=device_hints_file)
        self._latest_payload["live_source"] = "status_file"
        self._subscribers: set[asyncio.Queue[str]] = set()
        self._task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()
        self._last_history_sample_at: datetime | None = None
        self._last_refresh_at: datetime = datetime.now(timezone.utc)
        self._last_broadcast_at: datetime = datetime.now(timezone.utc)
        self._last_successful_refresh_at: datetime = datetime.now(timezone.utc)
        self._refresh_attempts: int = 0
        self._refresh_failures: int = 0
        self._last_refresh_error: str = ""

    @property
    def latest_payload(self) -> dict[str, Any]:
        return self._latest_payload

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run(), name="vpn-live-state-collector")

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is not None:
            await self._task
            self._task = None

    async def subscribe(self) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=4)
        self._subscribers.add(queue)
        await queue.put(self._to_sse_event(self._latest_payload))
        return queue

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    @property
    def last_refresh_at(self) -> datetime:
        return self._last_refresh_at

    @property
    def last_broadcast_at(self) -> datetime:
        return self._last_broadcast_at

    @property
    def refresh_attempts(self) -> int:
        return self._refresh_attempts

    @property
    def refresh_failures(self) -> int:
        return self._refresh_failures

    @property
    def last_refresh_error(self) -> str:
        return self._last_refresh_error

    @property
    def last_successful_refresh_at(self) -> datetime:
        return self._last_successful_refresh_at

    def unsubscribe(self, queue: asyncio.Queue[str]) -> None:
        self._subscribers.discard(queue)

    async def _run(self) -> None:
        while not self._stop_event.is_set():
            now_utc = datetime.now(timezone.utc)
            self._refresh_attempts += 1
            next_payload: dict[str, Any] | None = None
            payload_changed = False

            try:
                next_payload = load_openvpn_status_multi(self.status_files, device_hints_file=self.device_hints_file)
                next_payload["live_source"] = "status_file"
                payload_changed = self._payload_hash(next_payload) != self._payload_hash(self._latest_payload)
                self._last_successful_refresh_at = now_utc
                self._last_refresh_error = ""
            except Exception as exc:
                self._refresh_failures += 1
                self._last_refresh_error = str(exc)

            self._last_refresh_at = now_utc

            if next_payload is not None and payload_changed:
                self._latest_payload = next_payload
                await self._broadcast(self._to_sse_event(next_payload))

            if self.history_store and self._should_sample_history(now_utc):
                self.history_store.insert_snapshot(self._latest_payload, sampled_at=now_utc)
                self.history_store.prune_old(now_utc)
                self._last_history_sample_at = now_utc

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self.poll_interval_seconds)
            except asyncio.TimeoutError:
                pass

    def _should_sample_history(self, now_utc: datetime) -> bool:
        if self._last_history_sample_at is None:
            return True

        elapsed = (now_utc - self._last_history_sample_at).total_seconds()
        return elapsed >= float(self.history_sample_seconds)

    @staticmethod
    def _payload_hash(payload: dict[str, Any]) -> str:
        return json.dumps(payload, sort_keys=True, separators=(",", ":"))

    async def _broadcast(self, event: str) -> None:
        stale_queues: list[asyncio.Queue[str]] = []
        for queue in self._subscribers:
            if queue.full():
                stale_queues.append(queue)
                continue
            await queue.put(event)

        for queue in stale_queues:
            self._subscribers.discard(queue)

        self._last_broadcast_at = datetime.now(timezone.utc)

    async def refresh_once(self, force_broadcast: bool = False) -> bool:
        now_utc = datetime.now(timezone.utc)
        self._refresh_attempts += 1

        try:
            next_payload = load_openvpn_status_multi(self.status_files, device_hints_file=self.device_hints_file)
            next_payload["live_source"] = "status_file"
        except Exception as exc:
            self._refresh_failures += 1
            self._last_refresh_at = now_utc
            self._last_refresh_error = str(exc)
            raise

        payload_changed = self._payload_hash(next_payload) != self._payload_hash(self._latest_payload)
        self._latest_payload = next_payload
        self._last_refresh_at = now_utc
        self._last_successful_refresh_at = now_utc
        self._last_refresh_error = ""

        if payload_changed or force_broadcast:
            await self._broadcast(self._to_sse_event(next_payload))

        return payload_changed

    @staticmethod
    def _to_sse_event(payload: dict[str, Any]) -> str:
        event_payload = {
            "type": "snapshot",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        return "event: snapshot\n" + f"data: {json.dumps(event_payload)}\n\n"

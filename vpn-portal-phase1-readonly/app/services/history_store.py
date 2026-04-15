from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


class HistoryStore:
    def __init__(self, db_path: str, retention_days: int = 7) -> None:
        self.db_path = Path(db_path)
        self.retention_days = max(1, retention_days)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS snapshots (
                    sampled_at TEXT PRIMARY KEY,
                    active_clients INTEGER NOT NULL,
                    total_bytes_received INTEGER NOT NULL,
                    total_bytes_sent INTEGER NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_sampled_at ON snapshots(sampled_at)")

    def insert_snapshot(self, payload: dict[str, Any], sampled_at: datetime) -> None:
        summary = payload.get("summary", {})
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO snapshots (
                    sampled_at,
                    active_clients,
                    total_bytes_received,
                    total_bytes_sent,
                    payload_json
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    sampled_at.astimezone(timezone.utc).isoformat(),
                    int(summary.get("active_clients", 0)),
                    int(summary.get("total_bytes_received", 0)),
                    int(summary.get("total_bytes_sent", 0)),
                    json.dumps(payload, separators=(",", ":"), ensure_ascii=True),
                ),
            )

    def prune_old(self, now_utc: datetime) -> int:
        threshold = now_utc - timedelta(days=self.retention_days)
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM snapshots WHERE sampled_at < ?",
                (threshold.astimezone(timezone.utc).isoformat(),),
            )
            return int(cur.rowcount)

    def get_daily_history(self, days: int = 7) -> list[dict[str, Any]]:
        window_days = max(1, days)
        start = datetime.now(timezone.utc) - timedelta(days=window_days)

        query = """
            SELECT
                substr(sampled_at, 1, 10) AS day,
                COUNT(*) AS sample_count,
                MAX(active_clients) AS peak_active_clients,
                AVG(active_clients) AS avg_active_clients,
                MAX(total_bytes_received) AS max_total_bytes_received,
                MAX(total_bytes_sent) AS max_total_bytes_sent,
                MAX(sampled_at) AS last_sampled_at
            FROM snapshots
            WHERE sampled_at >= ?
            GROUP BY substr(sampled_at, 1, 10)
            ORDER BY day DESC
        """

        with self._connect() as conn:
            rows = conn.execute(query, (start.astimezone(timezone.utc).isoformat(),)).fetchall()

        result: list[dict[str, Any]] = []
        for row in rows:
            max_rx = int(row["max_total_bytes_received"] or 0)
            max_tx = int(row["max_total_bytes_sent"] or 0)
            result.append(
                {
                    "day": row["day"],
                    "sample_count": int(row["sample_count"] or 0),
                    "peak_active_clients": int(row["peak_active_clients"] or 0),
                    "avg_active_clients": round(float(row["avg_active_clients"] or 0.0), 2),
                    "max_total_bytes_received": max_rx,
                    "max_total_bytes_sent": max_tx,
                    "max_total_mib_received": round(max_rx / 1024 / 1024, 2),
                    "max_total_mib_sent": round(max_tx / 1024 / 1024, 2),
                    "last_sampled_at": row["last_sampled_at"],
                }
            )

        return result

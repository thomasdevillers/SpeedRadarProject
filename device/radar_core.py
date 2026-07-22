#!/usr/bin/env python3
"""Pure radar state and durable local storage shared by the Pi services."""

from __future__ import annotations

import json
import re
import sqlite3
import threading
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RADAR_PATTERN = re.compile(r"^\*?(\d{1,3}),(A|R)$")
COUNT_PATTERN = re.compile(r"^\*?C,(A|R)$")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_radar_line(text: str) -> tuple[int, str] | None:
    match = RADAR_PATTERN.match(text.strip())
    if not match:
        return None
    return int(match.group(1)), match.group(2)


def parse_count_line(text: str) -> str | None:
    match = COUNT_PATTERN.match(text.strip())
    return match.group(1) if match else None


@dataclass(frozen=True)
class CompletedTarget:
    peak_speed: int
    direction: str
    last_detection_monotonic: float


class TargetTracker:
    """Tracks one approaching target and briefly preserves its peak for a late count pulse."""

    def __init__(self, detection_gap_seconds: float = 0.8, count_hold_seconds: float = 3.0):
        self.detection_gap_seconds = detection_gap_seconds
        self.count_hold_seconds = count_hold_seconds
        self.active = False
        self.direction: str | None = None
        self.peak_speed = 0
        self.last_detection = 0.0
        self.awaiting_count: CompletedTarget | None = None

    def ingest(self, speed: int, direction: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        if direction != "A":
            return False
        if self.active and now - self.last_detection > self.detection_gap_seconds:
            self._hold_current_for_count()
        if self.awaiting_count is not None:
            self.awaiting_count = None
        started = not self.active
        if started:
            self.active = True
            self.direction = direction
            self.peak_speed = speed
        else:
            self.peak_speed = max(self.peak_speed, speed)
        self.last_detection = now
        return started

    def tick(self, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        if self.active and now - self.last_detection > self.detection_gap_seconds:
            self._hold_current_for_count()
        if self.awaiting_count and now - self.awaiting_count.last_detection_monotonic > self.count_hold_seconds:
            self.awaiting_count = None

    def consume_count(self, direction: str, now: float | None = None) -> CompletedTarget | None:
        now = time.monotonic() if now is None else now
        if direction != "A":
            return None
        self.tick(now)
        if self.active:
            completed = CompletedTarget(self.peak_speed, self.direction or "A", self.last_detection)
            self._clear_active()
            self.awaiting_count = None
            return completed
        completed = self.awaiting_count
        self.awaiting_count = None
        return completed

    def _hold_current_for_count(self) -> None:
        if self.active:
            self.awaiting_count = CompletedTarget(self.peak_speed, self.direction or "A", self.last_detection)
        self._clear_active()

    def _clear_active(self) -> None:
        self.active = False
        self.direction = None
        self.peak_speed = 0
        self.last_detection = 0.0


@dataclass(frozen=True)
class LocalRadarEvent:
    device_event_id: str
    captured_at: str
    captured_at_local: str
    speed_kph: int
    speed_limit_kph: int
    direction_code: str
    image_path: str | None
    photo_status: str

    @classmethod
    def create(cls, speed_kph: int, speed_limit_kph: int, direction_code: str, image_path: Path | None, photo_status: str) -> "LocalRadarEvent":
        now = datetime.now().astimezone()
        return cls(
            device_event_id=str(uuid.uuid4()),
            captured_at=now.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            captured_at_local=now.replace(microsecond=0).isoformat(),
            speed_kph=speed_kph,
            speed_limit_kph=speed_limit_kph,
            direction_code=direction_code,
            image_path=str(image_path) if image_path else None,
            photo_status=photo_status,
        )


class DeviceStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(self.path, timeout=30, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("pragma journal_mode=WAL")
        self._connection.execute("pragma synchronous=FULL")
        self._migrate()

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def _migrate(self) -> None:
        with self._lock, self._connection:
            self._connection.executescript(
                """
                create table if not exists events (
                    device_event_id text primary key,
                    captured_at text not null,
                    captured_at_local text not null,
                    speed_kph integer not null,
                    speed_limit_kph integer not null,
                    direction_code text not null,
                    image_path text,
                    photo_status text not null,
                    upload_status text not null default 'queued',
                    cloud_event_id text,
                    attempts integer not null default 0,
                    next_attempt_at real not null default 0,
                    last_error text,
                    uploaded_at text,
                    created_at text not null
                );
                create index if not exists events_upload_queue on events(upload_status, next_attempt_at, captured_at);
                create table if not exists runtime_status (
                    singleton integer primary key check(singleton = 1),
                    payload text not null,
                    updated_at text not null
                );
                create table if not exists config (
                    key text primary key,
                    value text not null,
                    updated_at text not null
                );
                create table if not exists local_commands (
                    command_id text primary key,
                    command_type text not null,
                    payload text not null,
                    status text not null default 'pending',
                    result text,
                    error text,
                    created_at text not null,
                    completed_at text
                );
                create table if not exists processed_cloud_commands (
                    command_id text primary key,
                    status text not null,
                    result text,
                    processed_at text not null
                );
                """
            )

    def enqueue_event(self, event: LocalRadarEvent) -> None:
        values = asdict(event)
        with self._lock, self._connection:
            self._connection.execute(
                """insert into events(device_event_id,captured_at,captured_at_local,speed_kph,speed_limit_kph,direction_code,image_path,photo_status,created_at)
                values(:device_event_id,:captured_at,:captured_at_local,:speed_kph,:speed_limit_kph,:direction_code,:image_path,:photo_status,:created_at)""",
                {**values, "created_at": utc_now()},
            )

    def pending_events(self, limit: int = 20, now_epoch: float | None = None) -> list[dict[str, Any]]:
        now_epoch = time.time() if now_epoch is None else now_epoch
        with self._lock:
            rows = self._connection.execute(
                "select * from events where upload_status in ('queued','retry') and next_attempt_at <= ? order by captured_at limit ?",
                (now_epoch, limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def mark_event_uploaded(self, device_event_id: str, cloud_event_id: str) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "update events set upload_status='uploaded', cloud_event_id=?, uploaded_at=?, last_error=null where device_event_id=?",
                (cloud_event_id, utc_now(), device_event_id),
            )

    def mark_event_retry(self, device_event_id: str, error: str) -> None:
        with self._lock, self._connection:
            row = self._connection.execute("select attempts from events where device_event_id=?", (device_event_id,)).fetchone()
            attempts = int(row["attempts"] if row else 0) + 1
            delay = min(900, 5 * (2 ** min(attempts - 1, 8)))
            self._connection.execute(
                "update events set upload_status='retry', attempts=?, next_attempt_at=?, last_error=? where device_event_id=?",
                (attempts, time.time() + delay, error[:2000], device_event_id),
            )

    def queue_depth(self) -> int:
        with self._lock:
            row = self._connection.execute("select count(*) count from events where upload_status <> 'uploaded'").fetchone()
            return int(row["count"])

    def set_runtime_status(self, payload: dict[str, Any]) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "insert into runtime_status(singleton,payload,updated_at) values(1,?,?) on conflict(singleton) do update set payload=excluded.payload,updated_at=excluded.updated_at",
                (json.dumps(payload, separators=(",", ":")), utc_now()),
            )

    def get_runtime_status(self) -> dict[str, Any]:
        with self._lock:
            row = self._connection.execute("select payload,updated_at from runtime_status where singleton=1").fetchone()
        if not row:
            return {}
        return {**json.loads(row["payload"]), "statusUpdatedAt": row["updated_at"]}

    def set_config(self, key: str, value: Any) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "insert into config(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",
                (key, json.dumps(value, separators=(",", ":")), utc_now()),
            )

    def get_config(self, key: str, default: Any = None) -> Any:
        with self._lock:
            row = self._connection.execute("select value from config where key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def create_local_command(self, command_id: str, command_type: str, payload: dict[str, Any]) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "insert or ignore into local_commands(command_id,command_type,payload,created_at) values(?,?,?,?)",
                (command_id, command_type, json.dumps(payload), utc_now()),
            )

    def pending_local_commands(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._connection.execute("select * from local_commands where status='pending' order by created_at limit 10").fetchall()
        return [{**dict(row), "payload": json.loads(row["payload"])} for row in rows]

    def complete_local_command(self, command_id: str, result: dict[str, Any] | None = None, error: str | None = None) -> None:
        status = "failed" if error else "completed"
        with self._lock, self._connection:
            self._connection.execute(
                "update local_commands set status=?,result=?,error=?,completed_at=? where command_id=?",
                (status, json.dumps(result or {}), error, utc_now(), command_id),
            )

    def local_command(self, command_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._connection.execute("select * from local_commands where command_id=?", (command_id,)).fetchone()
        return dict(row) if row else None

    def cloud_command_processed(self, command_id: str) -> bool:
        with self._lock:
            return self._connection.execute("select 1 from processed_cloud_commands where command_id=?", (command_id,)).fetchone() is not None

    def mark_cloud_command_processed(self, command_id: str, status: str, result: dict[str, Any] | None = None) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "insert or replace into processed_cloud_commands(command_id,status,result,processed_at) values(?,?,?,?)",
                (command_id, status, json.dumps(result or {}), utc_now()),
            )

    def cleanup_uploaded_photos(self, older_than_epoch: float) -> int:
        removed = 0
        with self._lock:
            rows = self._connection.execute("select device_event_id,image_path from events where upload_status='uploaded' and image_path is not null and strftime('%s',uploaded_at) < ?", (int(older_than_epoch),)).fetchall()
        for row in rows:
            path = Path(row["image_path"])
            try:
                path.unlink(missing_ok=True)
                removed += 1
            except OSError:
                continue
            with self._lock, self._connection:
                self._connection.execute("update events set image_path=null where device_event_id=?", (row["device_event_id"],))
        return removed


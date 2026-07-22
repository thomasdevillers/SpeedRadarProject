#!/usr/bin/env python3
"""RoadSafe hardware process: serial radar tracking and Hikvision evidence capture.

This process deliberately performs no cloud, OCR, or email work. Events are committed
to SQLite and uploaded by cloud_agent.py so network failures cannot stall detection.
"""

from __future__ import annotations

import logging
import os
import shutil
import signal
import time
from datetime import datetime, timezone
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

import cv2
import serial

from radar_core import DeviceStore, LocalRadarEvent, TargetTracker, parse_count_line, parse_radar_line, utc_now

VERSION = os.getenv("ROADSAFE_VERSION") or ((Path(__file__).resolve().parent / "VERSION").read_text().strip() if (Path(__file__).resolve().parent / "VERSION").exists() else "0.1.0-shadow")
PORT = os.getenv("RADAR_PORT", "/dev/ttyUSB0")
BAUDRATE = int(os.getenv("RADAR_BAUDRATE", "115200"))
SERIAL_TIMEOUT = float(os.getenv("RADAR_SERIAL_TIMEOUT", "0.2"))
HIKVISION_RTSP_URL = os.environ["HIKVISION_RTSP_URL"]
DATABASE_PATH = Path(os.getenv("ROADSAFE_DATABASE_PATH", "/var/lib/roadsafe-radar/device.db"))
SPOOL_DIR = Path(os.getenv("ROADSAFE_SPOOL_DIR", "/var/lib/roadsafe-radar/spool"))
LOG_DIR = Path(os.getenv("ROADSAFE_LOG_DIR", "/var/log/roadsafe-radar"))
DEFAULT_SPEED_LIMIT = int(os.getenv("RADAR_DEFAULT_SPEED_LIMIT", "60"))
TARGET_GAP_SECONDS = float(os.getenv("RADAR_TARGET_GAP_SECONDS", "0.8"))
COUNT_HOLD_SECONDS = float(os.getenv("RADAR_COUNT_HOLD_SECONDS", "3.0"))

SPOOL_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger("roadsafe.radar")
logger.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
console = logging.StreamHandler()
console.setFormatter(formatter)
logger.addHandler(console)
file_handler = TimedRotatingFileHandler(LOG_DIR / "radar.log", when="midnight", backupCount=14)
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

running = True


def stop(_signum=None, _frame=None) -> None:
    global running
    running = False


def drain_serial(radar: serial.Serial, duration: float = 0.3) -> None:
    end = time.monotonic() + duration
    while time.monotonic() < end:
        radar.read_all()
        time.sleep(0.02)


def send_command(radar: serial.Serial, command: str, wait: float = 0.3) -> None:
    radar.reset_input_buffer()
    radar.write((command + "\r").encode("ascii"))
    radar.flush()
    time.sleep(wait)
    lines = []
    for raw in radar.read_all().decode("ascii", errors="ignore").replace("\x00", "").splitlines():
        raw = raw.strip()
        if raw.startswith("#"):
            lines.append(raw)
    logger.info("radar command %s -> %s", command, " | ".join(lines) if lines else "no clean reply")


def setup_radar(radar: serial.Serial) -> None:
    logger.info("configuring radar on %s", PORT)
    for command in (
        "*SU=K",
        "*TS=0",
        "*MS=12",
        "*MM=2",
        "*OUT3=detect,11,160,180,A",
        "*OUT2=count",
        "*COUNTDIR=A",
        "*ZEROSPEED=0",
    ):
        send_command(radar, command)
    drain_serial(radar, 0.5)


def setup_camera(max_attempts: int = 8) -> cv2.VideoCapture:
    delay = 1.0
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        capture = cv2.VideoCapture(HIKVISION_RTSP_URL, cv2.CAP_FFMPEG)
        try:
            if not capture.isOpened():
                raise RuntimeError("RTSP stream could not be opened")
            capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            time.sleep(1)
            ok, frame = capture.read()
            if not ok or frame is None:
                raise RuntimeError("RTSP opened but returned no frame")
            logger.info("Hikvision stream ready on attempt %d", attempt)
            return capture
        except Exception as error:
            last_error = error
            capture.release()
            logger.warning("camera connection attempt %d/%d failed: %s", attempt, max_attempts, error)
            if attempt < max_attempts:
                time.sleep(delay)
                delay = min(delay * 2, 20)
    raise RuntimeError(f"Hikvision unavailable after {max_attempts} attempts: {last_error}")


def reconnect_camera(capture: cv2.VideoCapture | None) -> cv2.VideoCapture:
    if capture is not None:
        capture.release()
    return setup_camera()


def capture_photo(capture: cv2.VideoCapture, speed: int, diagnostic: bool = False) -> tuple[cv2.VideoCapture, Path]:
    for attempt in range(2):
        try:
            ok, frame = capture.read()
            if not ok or frame is None:
                raise RuntimeError("camera returned no frame")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            prefix = "diagnostic" if diagnostic else f"{speed:03d}kph"
            path = SPOOL_DIR / f"{timestamp}_{prefix}.jpg"
            if not cv2.imwrite(str(path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 92]):
                raise RuntimeError(f"OpenCV could not write {path}")
            return capture, path
        except Exception:
            if attempt == 0:
                capture = reconnect_camera(capture)
            else:
                raise
    raise RuntimeError("unreachable capture failure")


def effective_speed_limit(store: DeviceStore) -> int:
    configuration = store.get_config("cloud", {})
    try:
        return int(configuration.get("speedLimitKph", DEFAULT_SPEED_LIMIT))
    except (TypeError, ValueError):
        return DEFAULT_SPEED_LIMIT


def handle_local_commands(store: DeviceStore, camera: cv2.VideoCapture) -> cv2.VideoCapture:
    for command in store.pending_local_commands():
        command_id = command["command_id"]
        try:
            if command["command_type"] == "capture_test":
                camera, path = capture_photo(camera, 0, diagnostic=True)
                store.complete_local_command(command_id, {"imagePath": str(path)})
            elif command["command_type"] == "sync_config":
                store.complete_local_command(command_id, {"speedLimitKph": effective_speed_limit(store)})
            else:
                store.complete_local_command(command_id, error=f"Unsupported radar command {command['command_type']}")
        except Exception as error:
            logger.exception("local command %s failed", command_id)
            store.complete_local_command(command_id, error=str(error))
    return camera


def main() -> None:
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    store = DeviceStore(DATABASE_PATH)
    radar: serial.Serial | None = None
    camera: cv2.VideoCapture | None = None
    last_radar_message_at: str | None = None
    last_camera_success_at: str | None = None
    last_error: str | None = None
    logger.info("RoadSafe radar %s starting", VERSION)

    try:
        radar = serial.Serial(PORT, BAUDRATE, timeout=SERIAL_TIMEOUT)
        camera = setup_camera()
        setup_radar(radar)
        tracker = TargetTracker(TARGET_GAP_SECONDS, COUNT_HOLD_SECONDS)
        serial_buffer = b""
        last_health = 0.0
        last_camera_grab = 0.0
        last_command_poll = 0.0

        while running:
            now = time.monotonic()
            tracker.tick(now)
            if now - last_camera_grab >= 0.05:
                try:
                    if not camera.grab():
                        raise RuntimeError("camera grab failed")
                    last_camera_success_at = utc_now()
                    last_camera_grab = now
                except Exception as error:
                    last_error = str(error)
                    logger.warning("camera unhealthy: %s", error)
                    camera = reconnect_camera(camera)

            data = radar.read_all()
            if data:
                serial_buffer += data.replace(b"\n", b"\r")
                while b"\r" in serial_buffer:
                    raw, serial_buffer = serial_buffer.split(b"\r", 1)
                    text = raw.replace(b"\x00", b"").decode("ascii", errors="ignore").strip()
                    if not text:
                        continue
                    last_radar_message_at = utc_now()
                    count_direction = parse_count_line(text)
                    if count_direction:
                        target = tracker.consume_count(count_direction, now)
                        if not target:
                            logger.warning("count ignored: no matching approaching target")
                            continue
                        limit = effective_speed_limit(store)
                        image_path: Path | None = None
                        photo_status = "not_required"
                        if target.peak_speed > limit:
                            disk_percent = shutil.disk_usage(SPOOL_DIR).used / shutil.disk_usage(SPOOL_DIR).total * 100
                            if disk_percent >= 95:
                                photo_status = "disk_full"
                                last_error = f"photo skipped: disk usage {disk_percent:.1f}%"
                                logger.error(last_error)
                            else:
                                try:
                                    camera, image_path = capture_photo(camera, target.peak_speed)
                                    photo_status = "pending"
                                    last_camera_success_at = utc_now()
                                except Exception as error:
                                    photo_status = "failed"
                                    last_error = str(error)
                                    logger.exception("overspeed photo capture failed")
                        event = LocalRadarEvent.create(target.peak_speed, limit, "A", image_path, photo_status)
                        store.enqueue_event(event)
                        logger.info("event queued id=%s speed=%03d limit=%03d photo=%s", event.device_event_id, event.speed_kph, event.speed_limit_kph, photo_status)
                        continue
                    parsed = parse_radar_line(text)
                    if parsed:
                        speed, direction = parsed
                        if direction == "A":
                            if tracker.ingest(speed, direction, now):
                                logger.info("new approaching target")
                            logger.info("detected %03d km/h approaching", speed)
                        continue
                    if not text.startswith("#"):
                        logger.debug("ignored radar message %s", text)

            if now - last_command_poll >= 0.5:
                camera = handle_local_commands(store, camera)
                last_command_poll = now
            if now - last_health >= 10:
                store.set_runtime_status({
                    "version": VERSION,
                    "radarConnected": radar.is_open,
                    "cameraConnected": camera.isOpened(),
                    "lastRadarMessageAt": last_radar_message_at,
                    "lastCameraSuccessAt": last_camera_success_at,
                    "lastError": last_error,
                    "speedLimitKph": effective_speed_limit(store),
                    "pid": os.getpid(),
                })
                last_health = now
                last_error = None
            time.sleep(0.01)
    except Exception as error:
        logger.exception("fatal radar process error")
        store.set_runtime_status({"version": VERSION, "radarConnected": False, "cameraConnected": False, "lastError": str(error), "stoppedAt": utc_now()})
        raise
    finally:
        if radar is not None and radar.is_open:
            radar.close()
        if camera is not None:
            camera.release()
        store.close()
        logger.info("RoadSafe radar stopped")


if __name__ == "__main__":
    main()

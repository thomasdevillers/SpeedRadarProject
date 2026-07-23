#!/usr/bin/env python3
"""Durable outbound cloud agent for a RoadSafe radar device."""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import shutil
import signal
import subprocess
import time
from datetime import datetime, timezone
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
from typing import Any

import psutil
import requests

from radar_core import DeviceStore, utc_now

VERSION = os.getenv("ROADSAFE_VERSION") or ((Path(__file__).resolve().parent / "VERSION").read_text().strip() if (Path(__file__).resolve().parent / "VERSION").exists() else "0.1.0-shadow")
DATABASE_PATH = Path(os.getenv("ROADSAFE_DATABASE_PATH", "/var/lib/roadsafe-radar/device.db"))
SPOOL_DIR = Path(os.getenv("ROADSAFE_SPOOL_DIR", "/var/lib/roadsafe-radar/spool"))
STATE_DIR = Path(os.getenv("ROADSAFE_STATE_DIR", "/var/lib/roadsafe-radar"))
LOG_DIR = Path(os.getenv("ROADSAFE_LOG_DIR", "/var/log/roadsafe-radar"))
SYSTEMCTL = os.getenv("ROADSAFE_SYSTEMCTL", "/usr/bin/systemctl")
RADAR_SERVICE = os.getenv("ROADSAFE_RADAR_SERVICE", "run_radar.service")
UPDATER_SERVICE = os.getenv("ROADSAFE_UPDATER_SERVICE", "roadsafe-updater.service")
HEARTBEAT_SECONDS = int(os.getenv("ROADSAFE_HEARTBEAT_SECONDS", "60"))
COMMAND_POLL_SECONDS = int(os.getenv("ROADSAFE_COMMAND_POLL_SECONDS", "15"))
CONFIG_REFRESH_SECONDS = int(os.getenv("ROADSAFE_CONFIG_REFRESH_SECONDS", "300"))

logger = logging.getLogger("roadsafe.agent")
logger.setLevel(logging.INFO)
logger.addHandler(logging.NullHandler())

running = True


def configure_runtime_logging() -> None:
    """Create runtime paths only when starting the long-running service.

    The activation command is intentionally side-effect free outside its
    credential output. It is normally run with sudo and must not leave
    root-owned runtime logs behind for the unprivileged service.
    """
    for directory in (SPOOL_DIR, STATE_DIR, LOG_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    if getattr(configure_runtime_logging, "configured", False):
        return
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    logger.addHandler(console)
    file_handler = TimedRotatingFileHandler(LOG_DIR / "cloud-agent.log", when="midnight", backupCount=14)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    configure_runtime_logging.configured = True


def stop(_signum=None, _frame=None) -> None:
    global running
    running = False


class CloudApi:
    def __init__(self, base_url: str, device_id: str, secret: str):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({"authorization": f"Device {device_id}.{secret}", "user-agent": f"RoadSafeRadar/{VERSION}"})

    def request(self, method: str, path: str, **kwargs) -> requests.Response:
        response = self.session.request(method, f"{self.base_url}{path}", timeout=kwargs.pop("timeout", (8, 30)), **kwargs)
        response.raise_for_status()
        return response


def service_active(name: str) -> bool:
    result = subprocess.run([SYSTEMCTL, "is-active", "--quiet", name], check=False, timeout=5)
    return result.returncode == 0


def cpu_temperature() -> float | None:
    path = Path("/sys/class/thermal/thermal_zone0/temp")
    try:
        return round(float(path.read_text().strip()) / 1000, 2)
    except (OSError, ValueError):
        return None


def tailscale_ip() -> str | None:
    try:
        result = subprocess.run(["/usr/bin/tailscale", "ip", "-4"], capture_output=True, text=True, check=True, timeout=5)
        return result.stdout.strip().splitlines()[0]
    except (OSError, subprocess.SubprocessError, IndexError):
        return None


class Agent:
    def __init__(self, api: CloudApi, store: DeviceStore):
        self.api = api
        self.store = store
        self.started_at = time.monotonic()

    def upload_pending_events(self) -> None:
        for event in self.store.pending_events(10):
            if not running:
                return
            try:
                image_path = Path(event["image_path"]) if event["image_path"] else None
                has_photo = bool(image_path and image_path.exists() and event["photo_status"] == "pending")
                payload = {
                    "deviceEventId": event["device_event_id"], "capturedAt": event["captured_at"], "speedKph": event["speed_kph"],
                    "directionCode": event["direction_code"], "hasPhoto": has_photo,
                    "photoStatus": "pending" if has_photo else event["photo_status"],
                }
                response = self.api.request("POST", "/api/device/v1/events", json=payload).json()
                if response.get("uploadUrl") and image_path:
                    with image_path.open("rb") as photo:
                        upload = requests.put(response["uploadUrl"], data=photo, headers={"content-type": "image/jpeg"}, timeout=(10, 90))
                    upload.raise_for_status()
                    self.api.request("POST", f"/api/device/v1/events/{response['eventId']}/complete", json={})
                self.store.mark_event_uploaded(event["device_event_id"], response["eventId"])
                logger.info("event uploaded id=%s cloud=%s", event["device_event_id"], response["eventId"])
            except Exception as error:
                self.store.mark_event_retry(event["device_event_id"], str(error))
                logger.warning("event upload deferred id=%s error=%s", event["device_event_id"], error)

    def send_heartbeat(self) -> None:
        runtime = self.store.get_runtime_status()
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage(str(STATE_DIR))
        payload = {
            "recordedAt": utc_now(),
            "radarConnected": bool(runtime.get("radarConnected", False)),
            "cameraConnected": bool(runtime.get("cameraConnected", False)),
            "radarServiceActive": service_active(RADAR_SERVICE),
            "cpuTemperatureC": cpu_temperature(),
            "memoryUsedPercent": round(memory.percent, 2),
            "diskUsedPercent": round(disk.percent, 2),
            "queueDepth": self.store.queue_depth(),
            "lastRadarMessageAt": runtime.get("lastRadarMessageAt"),
            "lastCameraSuccessAt": runtime.get("lastCameraSuccessAt"),
            "lastError": runtime.get("lastError"),
            "tailscaleIp": tailscale_ip(),
            "softwareVersion": VERSION,
            "uptimeSeconds": int(time.monotonic() - self.started_at),
        }
        self.api.request("POST", "/api/device/v1/heartbeat", json=payload)

    def refresh_config(self) -> dict[str, Any]:
        configuration = self.api.request("GET", "/api/device/v1/config").json()
        self.store.set_config("cloud", configuration)
        logger.info("configuration refreshed speed_limit=%s", configuration.get("speedLimitKph"))
        return configuration

    def report_command(self, command_id: str, status: str, result: dict[str, Any] | None = None, error: str | None = None) -> None:
        self.api.request("POST", f"/api/device/v1/commands/{command_id}/result", json={"status": status, "result": result or {}, "error": error})

    def poll_commands(self) -> None:
        commands = self.api.request("GET", "/api/device/v1/commands").json().get("commands", [])
        for command in commands:
            command_id = command["id"]
            if self.store.cloud_command_processed(command_id):
                continue
            try:
                self.report_command(command_id, "running")
                result = self.execute_command(command)
                if command["type"] == "deploy_release":
                    continue
                self.store.mark_cloud_command_processed(command_id, "completed", result)
                self.report_command(command_id, "completed", result)
            except Exception as error:
                logger.exception("command failed id=%s type=%s", command_id, command.get("type"))
                self.store.mark_cloud_command_processed(command_id, "failed", {"error": str(error)})
                self.report_command(command_id, "failed", error=str(error))

    def execute_command(self, command: dict[str, Any]) -> dict[str, Any]:
        command_id, command_type = command["id"], command["type"]
        if command_type == "sync_config":
            return self.refresh_config()
        if command_type == "capture_test":
            self.store.create_local_command(command_id, command_type, command.get("payload") or {})
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                local = self.store.local_command(command_id)
                if local and local["status"] == "completed":
                    local_result = json.loads(local["result"] or "{}")
                    image_path = Path(str(local_result.get("imagePath") or ""))
                    payload = command.get("payload") or {}
                    upload_url = str(payload.get("photoUploadUrl") or "")
                    photo_path = str(payload.get("photoPath") or "")
                    if not image_path.is_file():
                        raise RuntimeError("test capture did not produce an image")
                    if not upload_url or not photo_path:
                        raise RuntimeError("cloud did not provide a diagnostic photo upload")
                    with image_path.open("rb") as photo:
                        upload = requests.put(upload_url, data=photo, headers={"content-type": "image/jpeg"}, timeout=(15, 240))
                    upload.raise_for_status()
                    return {"photoPath": photo_path, "capturedAt": utc_now()}
                if local and local["status"] == "failed":
                    raise RuntimeError(local["error"] or "test capture failed")
                time.sleep(.5)
            raise TimeoutError("radar process did not complete test capture")
        if command_type == "restart_radar":
            subprocess.run(["/usr/bin/sudo", SYSTEMCTL, "restart", RADAR_SERVICE], check=True, timeout=20)
            time.sleep(2)
            return {"serviceActive": service_active(RADAR_SERVICE)}
        if command_type == "reboot_device":
            result = {"accepted": True, "rebooting": True}
            self.report_command(command_id, "completed", result)
            self.store.mark_cloud_command_processed(command_id, "completed", result)
            subprocess.Popen(["/usr/bin/sudo", SYSTEMCTL, "reboot"])
            raise SystemExit(0)
        if command_type == "upload_diagnostics":
            return {"runtime": self.store.get_runtime_status(), "queueDepth": self.store.queue_depth(), "disk": psutil.disk_usage(str(STATE_DIR))._asdict()}
        if command_type == "deploy_release":
            return self.stage_release(command_id, command.get("payload") or {})
        raise ValueError(f"unsupported command {command_type}")

    def stage_release(self, command_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        version = str(payload.get("version") or "")
        if not version:
            raise ValueError("deploy_release requires a version")
        release = self.api.request("GET", f"/api/device/v1/releases/{version}").json()
        staging = STATE_DIR / "updates"
        staging.mkdir(parents=True, exist_ok=True)
        bundle = staging / f"roadsafe-radar-{version}.tar.gz"
        with requests.get(release["downloadUrl"], stream=True, timeout=(10, 180)) as response:
            response.raise_for_status()
            with bundle.open("wb") as output:
                shutil.copyfileobj(response.raw, output)
        digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
        if digest != release["sha256"]:
            bundle.unlink(missing_ok=True)
            raise ValueError("release bundle digest does not match manifest")
        request_path = STATE_DIR / "update-request.json"
        temporary = request_path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"commandId": command_id, "version": version, "bundlePath": str(bundle), "sha256": digest, "signature": release["signature"], "manifest": release["manifest"], "deploymentId": release["deploymentId"]}, separators=(",", ":")))
        os.replace(temporary, request_path)
        subprocess.Popen(["/usr/bin/sudo", SYSTEMCTL, "start", UPDATER_SERVICE])
        return {"version": version, "staged": True, "updaterStarted": True}

    def report_update_result(self) -> None:
        path = STATE_DIR / "update-result.json"
        if not path.exists():
            return
        try:
            result = json.loads(path.read_text())
            command_id = result.get("commandId")
            if command_id and not self.store.cloud_command_processed(command_id):
                status = "completed" if result.get("success") else "failed"
                self.report_command(command_id, status, result=result, error=result.get("error"))
                self.store.mark_cloud_command_processed(command_id, status, result)
            path.unlink(missing_ok=True)
        except Exception as error:
            logger.warning("could not report update result: %s", error)


def activate(api_url: str, token: str, output: Path) -> None:
    model_path = Path("/proc/device-tree/model")
    hardware = model_path.read_text(errors="ignore").rstrip("\x00") if model_path.exists() else "Raspberry Pi"
    operating_system = Path("/etc/os-release").read_text(errors="ignore")[:200] if Path("/etc/os-release").exists() else "Linux"
    response = requests.post(f"{api_url.rstrip('/')}/api/device/v1/activate", json={"token": token, "hardwareModel": hardware, "operatingSystem": operating_system, "softwareVersion": VERSION}, timeout=(10, 30))
    response.raise_for_status()
    credentials = response.json()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    replacements = {
        "ROADSAFE_API_URL": credentials["apiBaseUrl"],
        "ROADSAFE_DEVICE_ID": credentials["deviceId"],
        "ROADSAFE_DEVICE_SECRET": credentials["deviceSecret"],
    }
    existing = output.read_text().splitlines() if output.exists() else []
    merged: list[str] = []
    replaced: set[str] = set()
    for line in existing:
        key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else ""
        if key in replacements:
            merged.append(f"{key}={replacements[key]}")
            replaced.add(key)
        else:
            merged.append(line)
    if merged and merged[-1] != "":
        merged.append("")
    merged.extend(f"{key}={value}" for key, value in replacements.items() if key not in replaced)
    temporary.write_text("\n".join(merged) + "\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, output)
    print(f"Activated {credentials['deviceId']}; credentials written to {output}")


def main() -> None:
    parser = argparse.ArgumentParser(description="RoadSafe radar cloud agent")
    subparsers = parser.add_subparsers(dest="command")
    activation = subparsers.add_parser("activate")
    activation.add_argument("--api-url", required=True)
    activation.add_argument("--token", required=True)
    activation.add_argument("--output", type=Path, default=Path("/etc/roadsafe-radar/device.env"))
    args = parser.parse_args()
    if args.command == "activate":
        activate(args.api_url, args.token, args.output)
        return

    configure_runtime_logging()
    api_url = os.environ.get("ROADSAFE_API_URL")
    device_id = os.environ.get("ROADSAFE_DEVICE_ID")
    device_secret = os.environ.get("ROADSAFE_DEVICE_SECRET")
    if not all((api_url, device_id, device_secret)):
        raise SystemExit("ROADSAFE_API_URL, ROADSAFE_DEVICE_ID and ROADSAFE_DEVICE_SECRET are required")
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    store = DeviceStore(DATABASE_PATH)
    agent = Agent(CloudApi(api_url, device_id, device_secret), store)
    last_heartbeat = last_commands = last_config = last_cleanup = 0.0
    logger.info("RoadSafe cloud agent %s starting device=%s", VERSION, device_id)

    while running:
        now = time.monotonic()
        try:
            agent.upload_pending_events()
            if now - last_heartbeat >= HEARTBEAT_SECONDS:
                agent.send_heartbeat(); last_heartbeat = now
            if now - last_commands >= COMMAND_POLL_SECONDS:
                agent.poll_commands(); agent.report_update_result(); last_commands = now
            if now - last_config >= CONFIG_REFRESH_SECONDS:
                agent.refresh_config(); last_config = now
            if now - last_cleanup >= 3600:
                removed = store.cleanup_uploaded_photos(time.time() - 7 * 86400)
                if removed: logger.info("removed %d uploaded local photos", removed)
                last_cleanup = now
        except requests.RequestException as error:
            logger.warning("cloud unavailable: %s", error)
        except Exception:
            logger.exception("cloud agent loop error")
        time.sleep(2)
    store.close()
    logger.info("RoadSafe cloud agent stopped")


if __name__ == "__main__":
    main()

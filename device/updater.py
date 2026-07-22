#!/usr/bin/env python3
"""Root-only, offline release installer with signature verification and rollback."""

from __future__ import annotations

import compileall
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import time
from pathlib import Path

from cryptography.hazmat.primitives.serialization import load_pem_public_key
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

STATE_DIR = Path(os.getenv("ROADSAFE_STATE_DIR", "/var/lib/roadsafe-radar"))
INSTALL_ROOT = Path(os.getenv("ROADSAFE_INSTALL_ROOT", "/opt/roadsafe-radar"))
PUBLIC_KEY_PATH = Path(os.getenv("ROADSAFE_RELEASE_PUBLIC_KEY", "/etc/roadsafe-radar/release-public-key.pem"))
SYSTEMCTL = os.getenv("ROADSAFE_SYSTEMCTL", "/usr/bin/systemctl")
RADAR_SERVICE = os.getenv("ROADSAFE_RADAR_SERVICE", "run_radar.service")
AGENT_SERVICE = os.getenv("ROADSAFE_AGENT_SERVICE", "roadsafe-cloud-agent.service")


def atomic_json(path: Path, payload: dict) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, separators=(",", ":")))
    os.replace(temporary, path)


def safe_extract(archive: tarfile.TarFile, destination: Path) -> None:
    root = destination.resolve()
    for member in archive.getmembers():
        member_path = (destination / member.name).resolve()
        if root not in member_path.parents and member_path != root:
            raise ValueError(f"unsafe archive member {member.name}")
        if member.issym() or member.islnk():
            raise ValueError(f"links are not permitted in release bundles: {member.name}")
    archive.extractall(destination, filter="data")


def verify_request(request: dict) -> None:
    bundle = Path(request["bundlePath"])
    digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    if digest != request["sha256"]:
        raise ValueError("release SHA-256 does not match")
    manifest = request["manifest"]
    if manifest.get("version") != request["version"] or manifest.get("sha256") != digest:
        raise ValueError("release manifest does not match bundle")
    public_key = load_pem_public_key(PUBLIC_KEY_PATH.read_bytes())
    if not isinstance(public_key, Ed25519PublicKey):
        raise ValueError("release verification key must be Ed25519")
    canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    public_key.verify(bytes.fromhex(request["signature"]), canonical)


def service_active(name: str) -> bool:
    return subprocess.run([SYSTEMCTL, "is-active", "--quiet", name], check=False, timeout=5).returncode == 0


def health_check(version: str, timeout: int = 120) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if service_active(RADAR_SERVICE) and service_active(AGENT_SERVICE):
            try:
                import sqlite3
                connection = sqlite3.connect(STATE_DIR / "device.db")
                row = connection.execute("select payload from runtime_status where singleton=1").fetchone()
                connection.close()
                if row and json.loads(row[0]).get("version") == version:
                    return True
            except Exception:
                pass
        time.sleep(3)
    return False


def set_current(target: Path) -> None:
    link = INSTALL_ROOT / "current"
    temporary = INSTALL_ROOT / ".current-next"
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    os.replace(temporary, link)


def main() -> None:
    request_path = STATE_DIR / "update-request.json"
    result_path = STATE_DIR / "update-result.json"
    request = json.loads(request_path.read_text())
    version = request["version"]
    command_id = request.get("commandId")
    previous = None
    current = INSTALL_ROOT / "current"
    try:
        verify_request(request)
        if current.is_symlink():
            previous = current.resolve()
        staging = STATE_DIR / "updates" / f"extract-{version}"
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True)
        with tarfile.open(request["bundlePath"], "r:gz") as archive:
            safe_extract(archive, staging)
        source = staging / "device"
        if not (source / "radar_real_ocr.py").exists() or not (source / "cloud_agent.py").exists():
            raise ValueError("release bundle is missing the device application")
        if not compileall.compile_dir(source, quiet=1, force=True):
            raise ValueError("release Python compilation failed")
        destination = INSTALL_ROOT / "releases" / version
        if destination.exists():
            shutil.rmtree(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, destination)
        set_current(destination)
        subprocess.run([SYSTEMCTL, "restart", RADAR_SERVICE], check=True, timeout=30)
        subprocess.run([SYSTEMCTL, "restart", AGENT_SERVICE], check=True, timeout=30)
        if not health_check(version):
            raise RuntimeError("new release did not become healthy within 120 seconds")
        atomic_json(result_path, {"commandId": command_id, "version": version, "success": True, "previousVersion": previous.name if previous else None})
        request_path.unlink(missing_ok=True)
        shutil.rmtree(staging, ignore_errors=True)
    except Exception as error:
        if previous and previous.exists():
            set_current(previous)
            subprocess.run([SYSTEMCTL, "restart", RADAR_SERVICE], check=False, timeout=30)
            subprocess.run([SYSTEMCTL, "restart", AGENT_SERVICE], check=False, timeout=30)
        atomic_json(result_path, {"commandId": command_id, "version": version, "success": False, "rolledBack": bool(previous), "error": str(error)})
        raise


if __name__ == "__main__":
    main()

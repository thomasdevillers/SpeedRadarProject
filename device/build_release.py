#!/usr/bin/env python3
"""Build and sign a device release bundle for upload to private Storage."""

from __future__ import annotations

import argparse
import hashlib
import json
import tarfile
import tempfile
from pathlib import Path

from cryptography.hazmat.primitives.serialization import load_pem_private_key
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("version")
    parser.add_argument("--private-key", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("dist"))
    args = parser.parse_args()
    source = Path(__file__).resolve().parent
    args.output.mkdir(parents=True, exist_ok=True)
    bundle = args.output / f"roadsafe-radar-{args.version}.tar.gz"
    included = ["VERSION", "radar_core.py", "radar_real_ocr.py", "cloud_agent.py", "updater.py", "requirements.txt", "systemd"]
    with tempfile.TemporaryDirectory() as temporary_directory:
        temporary = Path(temporary_directory) / "device"
        temporary.mkdir()
        for name in included:
            source_path = source / name
            destination = temporary / name
            if source_path.is_dir():
                import shutil
                shutil.copytree(source_path, destination)
            else:
                destination.write_bytes(source_path.read_bytes())
        (temporary / "VERSION").write_text(args.version + "\n")
        with tarfile.open(bundle, "w:gz") as archive:
            archive.add(temporary, arcname="device")
    digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    manifest = {"version": args.version, "sha256": digest, "createdBy": "RoadSafe release pipeline", "format": 1}
    canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    private_key = load_pem_private_key(args.private_key.read_bytes(), password=None)
    if not isinstance(private_key, Ed25519PrivateKey):
        raise ValueError("release signing key must be Ed25519")
    signature = private_key.sign(canonical).hex()
    manifest_path = args.output / f"roadsafe-radar-{args.version}.json"
    manifest_path.write_text(json.dumps({"manifest": manifest, "signature": signature, "bundle": bundle.name}, indent=2) + "\n")
    print(manifest_path)


if __name__ == "__main__":
    main()

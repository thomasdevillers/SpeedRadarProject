#!/usr/bin/env python3
"""Generate the offline Ed25519 keypair used to sign radar releases."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat, PublicFormat


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--private-key", type=Path, required=True)
    parser.add_argument("--public-key", type=Path, required=True)
    args = parser.parse_args()
    if args.private_key.exists() or args.public_key.exists():
        raise SystemExit("Refusing to overwrite an existing signing key")
    args.private_key.parent.mkdir(parents=True, exist_ok=True)
    args.public_key.parent.mkdir(parents=True, exist_ok=True)
    key = Ed25519PrivateKey.generate()
    args.private_key.write_bytes(key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()))
    args.public_key.write_bytes(key.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo))
    os.chmod(args.private_key, 0o600)
    os.chmod(args.public_key, 0o644)
    print(f"Private signing key: {args.private_key}")
    print(f"Public verification key: {args.public_key}")


if __name__ == "__main__":
    main()

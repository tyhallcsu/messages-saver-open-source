#!/usr/bin/env python3
"""
Build a GitHub release bundle for Open Chat Archiver.

The output is a ready-to-extract ZIP that preserves the extension's
top-level layout inside a versioned folder, plus a SHA256 checksum file
and release notes sourced from CHANGELOG.md when possible.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE_NAME = "open-chat-archiver"
PACKAGE_INPUTS = (
    "manifest.json",
    "background.js",
    "content.js",
    "content.css",
    "popup.html",
    "popup.css",
    "popup.js",
    "options.html",
    "options.css",
    "options.js",
    "icons",
    "assets",
    "docs",
    "sample-data",
    "README.md",
    "LICENSE",
    "PRIVACY.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "CODE_OF_CONDUCT.md",
)
ZIP_TIMESTAMP = (2026, 1, 1, 0, 0, 0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default="dist", help="output directory relative to repo root")
    return parser.parse_args()


def read_manifest() -> dict:
    return json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))


def iter_package_files() -> list[Path]:
    files: list[Path] = []
    for entry in PACKAGE_INPUTS:
        path = ROOT / entry
        if path.is_dir():
            files.extend(sorted(p for p in path.rglob("*") if p.is_file()))
        elif path.is_file():
            files.append(path)
        else:
            raise FileNotFoundError(f"Missing package input: {path}")
    return files


def read_changelog_section(version: str) -> str:
    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    marker = f"## [{version}]"
    start = changelog.find(marker)
    if start == -1:
        return (
            f"# Open Chat Archiver v{version}\n\n"
            "Release notes were not found in CHANGELOG.md.\n"
        )

    next_heading = changelog.find("\n## [", start + len(marker))
    section = changelog[start: next_heading if next_heading != -1 else None].strip()
    return section + "\n"


def stable_zip_write(zf: zipfile.ZipFile, src: Path, arcname: str) -> None:
    info = zipfile.ZipInfo(arcname, ZIP_TIMESTAMP)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    zf.writestr(info, src.read_bytes())


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    args = parse_args()
    manifest = read_manifest()
    version = manifest["version"]
    out_dir = (ROOT / args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    bundle_name = f"{PACKAGE_NAME}-v{version}"
    zip_path = out_dir / f"{bundle_name}.zip"
    checksum_path = out_dir / f"{bundle_name}-sha256.txt"
    notes_path = out_dir / f"{bundle_name}-notes.md"

    with zipfile.ZipFile(zip_path, "w") as zf:
        for src in iter_package_files():
            rel = src.relative_to(ROOT).as_posix()
            stable_zip_write(zf, src, f"{bundle_name}/{rel}")

    digest = sha256_file(zip_path)
    checksum_path.write_text(f"{digest}  {zip_path.name}\n", encoding="utf-8")
    notes_path.write_text(read_changelog_section(version), encoding="utf-8")

    print(f"wrote {zip_path}")
    print(f"wrote {checksum_path}")
    print(f"wrote {notes_path}")


if __name__ == "__main__":
    main()

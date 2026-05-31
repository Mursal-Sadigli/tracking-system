#!/usr/bin/env python3
"""Unsplash-dan 10 şəkil endir və frontend/public/gallery-payload/ qovluğuna yaz."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests

UNSPLASH_RANDOM_URL = "https://api.unsplash.com/photos/random"
UNSPLASH_DOWNLOAD_URL = "https://api.unsplash.com/photos/{photo_id}/download"

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT_DIR = REPO_ROOT / "frontend" / "public" / "gallery-payload"
DEFAULT_SUBJECT_IMAGE = REPO_ROOT / "frontend" / "public" / "subject-payload.jpg"


def fetch_random_photos(access_key: str, count: int, query: str | None) -> list[dict]:
    params: dict = {"count": count, "client_id": access_key}
    if query:
        params["query"] = query
    resp = requests.get(UNSPLASH_RANDOM_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return [data] if isinstance(data, dict) else data


def trigger_download(access_key: str, photo_id: str) -> None:
    """Unsplash API qaydalarına uyğun endirmə hadisəsini qeydə al."""
    url = UNSPLASH_DOWNLOAD_URL.format(photo_id=photo_id)
    requests.get(url, params={"client_id": access_key}, timeout=15)


def download_image(url: str, dest: Path) -> None:
    resp = requests.get(url, timeout=60, stream=True)
    resp.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)


def save_photo(
    photo: dict,
    dest: Path,
    access_key: str,
    index: int,
    total: int,
) -> None:
    photo_id = photo["id"]
    trigger_download(access_key, photo_id)
    download_image(photo["urls"]["regular"], dest)
    author = photo.get("user", {}).get("name", "?")
    username = photo.get("user", {}).get("username", "?")
    line = f"[{index}/{total}] {dest.name} - Unsplash/{username} ({author}, id={photo_id})"
    print(line.encode("ascii", errors="replace").decode("ascii"))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Unsplash-dan gallery-payload üçün şəkillər endir"
    )
    parser.add_argument(
        "--access-key",
        default=os.environ.get("UNSPLASH_ACCESS_KEY", ""),
        help="Unsplash Access Key (və ya UNSPLASH_ACCESS_KEY env dəyişəni)",
    )
    parser.add_argument("--count", type=int, default=10, help="Endiriləcək şəkil sayı")
    parser.add_argument(
        "--query",
        default=None,
        help="Axtarış sorğusu (məs: portrait, street, nature)",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help="Gallery şəkillərinin yazılacağı qovluq",
    )
    parser.add_argument(
        "--ext",
        choices=["jpg", "png"],
        default="jpg",
        help="Fayl uzantısı (default: jpg)",
    )
    parser.add_argument(
        "--subject-payload",
        action="store_true",
        help="İlk şəkli həm də frontend/public/subject-payload.jpg kimi saxla",
    )
    args = parser.parse_args()

    if not args.access_key:
        print(
            "Xəta: Unsplash Access Key lazımdır.\n"
            "  python fetch_unsplash_gallery.py --access-key YOUR_KEY\n"
            "  və ya: set UNSPLASH_ACCESS_KEY=YOUR_KEY",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.count < 1:
        print("Xəta: --count ən azı 1 olmalıdır", file=sys.stderr)
        sys.exit(1)

    photos = fetch_random_photos(args.access_key, args.count, args.query)
    if len(photos) < args.count:
        print(f"Xəbərdarlıq: {args.count} əvəzinə yalnız {len(photos)} şəkil alındı")

    for i, photo in enumerate(photos[: args.count], start=1):
        dest = args.out_dir / f"{i:02d}.{args.ext}"
        save_photo(photo, dest, args.access_key, i, args.count)

    if args.subject_payload and photos:
        save_photo(
            photos[0],
            DEFAULT_SUBJECT_IMAGE,
            args.access_key,
            1,
            1,
        )
        print(f"subject-payload: {DEFAULT_SUBJECT_IMAGE}")

    print(f"\nDone: {args.out_dir}")


if __name__ == "__main__":
    main()

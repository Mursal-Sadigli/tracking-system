#!/usr/bin/env python3
"""Offline ML retrain (Faza 1 — opsional)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="ML baseline batch update from exported GPS JSON")
    parser.add_argument("--input", required=True, help="JSON array of GPS history per device")
    args = parser.parse_args()

    path = Path(args.input)
    if not path.exists():
        print(json.dumps({"error": "file_not_found"}))
        return

    from ml.engine import score_tracking

    data = json.loads(path.read_text(encoding="utf-8"))
    results = []
    for entry in data:
        device_id = entry.get("device_id", "unknown")
        history = entry.get("history") or []
        out = score_tracking({"device_id": device_id, "history": history, "context": {}})
        results.append({"device_id": device_id, "baseline": out.get("baseline")})

    print(json.dumps({"processed": len(results), "results": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()

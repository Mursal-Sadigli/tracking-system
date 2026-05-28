#!/usr/bin/env python3
"""Background worker: retention reminder, optional batch jobs."""

from __future__ import annotations

import os
import time

INTERVAL = int(os.environ.get("WORKER_INTERVAL_SEC", "3600"))


def main() -> None:
    print(f"Worker started, interval={INTERVAL}s")
    while True:
        print("[worker] heartbeat — configure Render Cron for retention via Node API")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()

from __future__ import annotations

import asyncio
import json
import re
from collections import deque
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol


HISTORY_LIMIT = 60
LATENCY_PATTERN = re.compile(r"time[=<]([0-9.]+)\s*ms")


@dataclass(frozen=True)
class ProbeResult:
    reachable: bool
    latency_ms: float | None
    checked_at: str
    error: str | None = None


class Prober(Protocol):
    async def probe(self, address: str, timeout_seconds: int) -> ProbeResult: ...


class PingProber:
    async def probe(self, address: str, timeout_seconds: int) -> ProbeResult:
        checked_at = datetime.now(timezone.utc).isoformat()
        try:
            process = await asyncio.create_subprocess_exec(
                "ping", "-n", "-c", "1", "-W", str(timeout_seconds), address,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()
        except OSError as error:
            return ProbeResult(False, None, checked_at, str(error))

        output = (stdout + stderr).decode(errors="replace")
        if process.returncode != 0:
            return ProbeResult(False, None, checked_at, "No ICMP response")
        match = LATENCY_PATTERN.search(output)
        return ProbeResult(True, float(match.group(1)) if match else None, checked_at)


def load_devices(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


class NetworkMonitor:
    def __init__(self, devices: list[dict], prober: Prober, timeout_seconds: int = 1):
        self._devices = devices
        self._prober = prober
        self._timeout_seconds = timeout_seconds
        self._history: dict[tuple[str, str], deque[ProbeResult]] = {
            (device["id"], interface["address"]): deque(maxlen=HISTORY_LIMIT)
            for device in devices for interface in device["interfaces"]
        }
        self._lock = asyncio.Lock()

    async def poll_once(self) -> None:
        checks = [
            (device["id"], interface["address"])
            for device in self._devices for interface in device["interfaces"]
        ]
        results = await asyncio.gather(
            *(self._prober.probe(address, self._timeout_seconds) for _, address in checks)
        )
        async with self._lock:
            for key, result in zip(checks, results):
                self._history[key].append(result)

    async def snapshot(self) -> list[dict]:
        async with self._lock:
            devices = deepcopy(self._devices)
            for device in devices:
                interface_statuses = []
                for interface in device["interfaces"]:
                    samples = self._history[(device["id"], interface["address"])]
                    latest = samples[-1] if samples else None
                    interface_statuses.append({
                        **interface,
                        "status": "online" if latest and latest.reachable else "unknown" if not latest else "offline",
                        "latency_ms": latest.latency_ms if latest else None,
                        "checked_at": latest.checked_at if latest else None,
                        "error": latest.error if latest else None,
                        "history": [sample.__dict__ for sample in samples],
                    })
                device["interfaces"] = interface_statuses
                states = [entry["status"] for entry in interface_statuses]
                device["status"] = (
                    "unknown" if "unknown" in states else
                    "online" if all(state == "online" for state in states) else
                    "partial" if "online" in states else "offline"
                )
            return devices

    async def device(self, device_id: str) -> dict | None:
        return next((item for item in await self.snapshot() if item["id"] == device_id), None)

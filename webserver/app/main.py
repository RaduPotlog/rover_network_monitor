from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from .monitor import NetworkMonitor, PingProber, load_devices


def integer_setting(name: str, default: int) -> int:
    value = int(os.getenv(name, str(default)))
    if value < 1:
        raise ValueError(f"{name} must be at least 1")
    return value


POLL_INTERVAL_SECONDS = integer_setting("ROVER_WEB_POLL_INTERVAL_SECONDS", 5)
PING_TIMEOUT_SECONDS = integer_setting("ROVER_WEB_PING_TIMEOUT_SECONDS", 1)
APP_DIR = Path(__file__).parent
monitor = NetworkMonitor(load_devices(APP_DIR / "devices.json"), PingProber(), PING_TIMEOUT_SECONDS)


async def poll_forever() -> None:
    while True:
        await monitor.poll_once()
        await asyncio.sleep(POLL_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await monitor.poll_once()
    task = asyncio.create_task(poll_forever())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="Rover Network Monitor", lifespan=lifespan)


@app.get("/", include_in_schema=False)
async def dashboard() -> FileResponse:
    return FileResponse(APP_DIR / "static" / "index.html")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/devices")
async def devices() -> dict:
    entries = await monitor.snapshot()
    return {"devices": entries, "summary": {state: sum(item["status"] == state for item in entries) for state in ("online", "partial", "offline", "unknown")}}


@app.get("/api/devices/{device_id}")
async def device(device_id: str) -> dict:
    entry = await monitor.device(device_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return entry


@app.get("/devices/{device_id}", include_in_schema=False)
async def device_page(device_id: str) -> FileResponse:
    if await monitor.device(device_id) is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return FileResponse(APP_DIR / "static" / "index.html")

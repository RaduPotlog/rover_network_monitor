import asyncio

from app.monitor import NetworkMonitor, ProbeResult


class FakeProber:
    def __init__(self, results):
        self.results = results

    async def probe(self, address, timeout_seconds):
        return self.results[address]


def result(reachable):
    return ProbeResult(reachable, 1.2 if reachable else None, "2026-01-01T00:00:00+00:00")


def test_device_statuses_and_history_limit():
    devices = [{"id": "router", "name": "Router", "role": "router", "interfaces": [{"name": "A", "address": "10.0.0.1"}, {"name": "B", "address": "10.0.0.2"}]}]
    monitor = NetworkMonitor(devices, FakeProber({"10.0.0.1": result(True), "10.0.0.2": result(False)}))
    asyncio.run(monitor.poll_once())
    snapshot = asyncio.run(monitor.snapshot())
    assert snapshot[0]["status"] == "partial"
    assert snapshot[0]["interfaces"][0]["status"] == "online"
    assert snapshot[0]["interfaces"][1]["status"] == "offline"

    for _ in range(65):
        asyncio.run(monitor.poll_once())
    assert len(asyncio.run(monitor.snapshot())[0]["interfaces"][0]["history"]) == 60

# rover_network_monitor

Node.js dashboard that pings every interface of the Rover A1 network and
shows it as a Cisco-Packet-Tracer-style topology plus per-device cards.

## Run

```bash
./run_webserver.sh            # installs deps (npm ci) and serves on :8080
```

or, from `webserver/`: `npm ci && npm start`. Requires Node.js 20+ and the
`ping` binary (ICMP needs `CAP_NET_RAW` inside containers).

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `ROVER_WEB_PORT` | `8080` | HTTP port |
| `ROVER_WEB_POLL_INTERVAL_SECONDS` | `5` | Delay between ping sweeps |
| `ROVER_WEB_PING_TIMEOUT_SECONDS` | `1` | Per-probe timeout |
| `ROVER_WEB_DEVICES_JSON` / `ROVER_WEB_DEVICES_FILE` | `webserver/src/devices.json` | Monitored devices and interfaces |
| `ROVER_WEB_TOPOLOGY_JSON` / `ROVER_WEB_TOPOLOGY_FILE` | `webserver/src/topology.json` | Diagram nodes, positions and cables |

Topology link ends reference a device interface by `name`; ends without an
`interface` (switch ports, the upstream Wi-Fi) mirror the far end's state.
Ethernet links set `cable` (`straight` or `cross`) and a `port` per end; Wi-Fi
links set `"medium": "wireless"` and are drawn dotted with a Wi-Fi mark.

The topology is the real rover's. The `WLAN-EMULATION-SW` switch in `cisco/`
only stands in for Wi-Fi inside Packet Tracer, so the monitor doesn't show it.

## HTTP API

| Route | Returns |
|-------|---------|
| `GET /` | Dashboard |
| `GET /devices/:id` | Device detail page (probe history) |
| `GET /api/devices` | `{ devices, summary }` |
| `GET /api/devices/:id` | One device, 404 if unknown |
| `GET /api/topology` | Diagram definition |
| `GET /healthz` | `{ "status": "ok" }` |

## Test

```bash
cd webserver && npm test
```

# rover_network_monitor

Node.js dashboard that pings every interface of the Rover A1 network and
shows it as a Cisco-Packet-Tracer-style topology plus per-device cards.

A second page, `/led`, shows the bumper-light animations of `rover_led`:
the [Husarion LED animation table](https://husarion.com/manuals/panther/software/ros2/robot-management/#led-animations)
(IDs 0–17, with the ones the robot has not loaded marked "Not configured"),
the animation playing on each priority layer (ERROR, ALERT, INFO, STATE), and the
live colour of every LED. The server reads it from rosbridge, subscribing to
`/led/animations`, `/led/state` and `/led/channel_<n>_frame`, so the browser
only ever talks to the dashboard port.

## Run

```bash
./run_webserver.sh            # installs deps (npm ci) and serves on :8080
```

or, from `webserver/`: `npm ci && npm start`. Requires Node.js 22+ (for the built-in WebSocket) and the
`ping` binary (ICMP needs `CAP_NET_RAW` inside containers).

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `ROVER_WEB_PORT` | `8080` | HTTP port |
| `ROVER_WEB_POLL_INTERVAL_SECONDS` | `5` | Delay between ping sweeps |
| `ROVER_WEB_PING_TIMEOUT_SECONDS` | `1` | Per-probe timeout |
| `ROVER_WEB_DEVICES_JSON` / `ROVER_WEB_DEVICES_FILE` | `webserver/src/devices.json` | Monitored devices and interfaces |
| `ROVER_WEB_TOPOLOGY_JSON` / `ROVER_WEB_TOPOLOGY_FILE` | `webserver/src/topology.json` | Diagram nodes, positions and cables |
| `ROVER_WEB_ROSBRIDGE_URL` | `ws://127.0.0.1:9090` | rosbridge websocket used by the LED page |

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
| `GET /led` | LED animations page |
| `GET /api/led` | `{ connected, stale, top, layers, animations, segments, panels }` |
| `GET /healthz` | `{ "status": "ok" }` |

## Test

```bash
cd webserver && npm test
```

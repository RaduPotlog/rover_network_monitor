import { createApp } from './app.js';
import { integerSetting, resolveDevices, resolveLedReference, resolveTopology, stringSetting } from './config.js';
import { LedMonitor } from './led.js';
import { NetworkMonitor, PingProber } from './monitor.js';
import { RosBridgeClient } from './ros_bridge.js';

const PORT = integerSetting('ROVER_WEB_PORT', 8080);
const POLL_INTERVAL_SECONDS = integerSetting('ROVER_WEB_POLL_INTERVAL_SECONDS', 5);
const PING_TIMEOUT_SECONDS = integerSetting('ROVER_WEB_PING_TIMEOUT_SECONDS', 1);
const ROSBRIDGE_URL = stringSetting('ROVER_WEB_ROSBRIDGE_URL', 'ws://127.0.0.1:9090');

const monitor = new NetworkMonitor(resolveDevices(), new PingProber(), PING_TIMEOUT_SECONDS);
const bridge = new RosBridgeClient(ROSBRIDGE_URL);
const led = new LedMonitor(bridge, resolveLedReference());
const app = createApp({ monitor, topology: resolveTopology(), led });

bridge.start();

// Complete one sweep before accepting traffic so the first page load has data.
await monitor.pollOnce();

let timer = null;
let stopping = false;

// Chained timeouts rather than setInterval: a slow sweep never overlaps the next one.
function scheduleNextPoll() {
  timer = setTimeout(async () => {
    try {
      await monitor.pollOnce();
    } catch (error) {
      console.error('Poll failed:', error);
    }
    if (!stopping) scheduleNextPoll();
  }, POLL_INTERVAL_SECONDS * 1000);
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Rover Network Monitor listening on http://0.0.0.0:${PORT}`);
  scheduleNextPoll();
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  stopping = true;
  clearTimeout(timer);
  bridge.close();
  server.close(() => process.exit(0));
  server.closeAllConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

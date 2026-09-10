import { createApp } from './app.js';
import { integerSetting, resolveDevices, resolveTopology } from './config.js';
import { NetworkMonitor, PingProber } from './monitor.js';

const PORT = integerSetting('ROVER_WEB_PORT', 8080);
const POLL_INTERVAL_SECONDS = integerSetting('ROVER_WEB_POLL_INTERVAL_SECONDS', 5);
const PING_TIMEOUT_SECONDS = integerSetting('ROVER_WEB_PING_TIMEOUT_SECONDS', 1);

const monitor = new NetworkMonitor(resolveDevices(), new PingProber(), PING_TIMEOUT_SECONDS);
const app = createApp({ monitor, topology: resolveTopology() });

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
  server.close(() => process.exit(0));
  server.closeAllConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

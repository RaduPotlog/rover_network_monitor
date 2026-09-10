import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { createApp } from '../src/app.js';
import { resolveDevices, resolveTopology } from '../src/config.js';
import { NetworkMonitor } from '../src/monitor.js';

const prober = {
  async probe() {
    return { reachable: true, latency_ms: 0.5, checked_at: new Date().toISOString(), error: null };
  },
};

let server;
let baseUrl;

before(async () => {
  const monitor = new NetworkMonitor(resolveDevices({}), prober);
  await monitor.pollOnce();
  server = createApp({ monitor, topology: resolveTopology({}) }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const get = (path) => fetch(`${baseUrl}${path}`);

test('health and device endpoints', async () => {
  assert.deepEqual(await (await get('/healthz')).json(), { status: 'ok' });

  const response = await get('/api/devices');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.devices.length, 4);
  assert.deepEqual(body.summary, { online: 4, partial: 0, offline: 0, unknown: 0 });

  const rosController = body.devices.find((device) => device.id === 'ros-controller');
  assert.deepEqual(rosController.interfaces.map((iface) => iface.name), ['ETH1', 'ETH0']);
  assert.ok(!JSON.stringify(body).includes('192.168.77.203'));

  assert.equal((await get('/api/devices/safety-plc')).status, 200);
  assert.equal((await get('/api/devices/not-real')).status, 404);
});

test('pages, static assets and topology', async () => {
  assert.match(await (await get('/')).text(), /Rover A1/);
  assert.equal((await get('/devices/rutx11')).status, 200);
  assert.equal((await get('/devices/not-real')).status, 404);
  assert.equal((await get('/static/app.js')).status, 200);
  assert.equal((await get('/logos/Logo-Arm-WhiteOrange-372x372-1.png')).headers.get('content-type'), 'image/png');

  const topology = await (await get('/api/topology')).json();
  assert.equal(topology.links.length, 4);
  // The Wi-Fi switch only exists in the Packet Tracer emulation, not on the rover.
  assert.ok(!topology.nodes.some((node) => node.id === 'wlan-emulation-sw'));
  const between = (x, y) => topology.links.filter((link) =>
    [link.a.node, link.b.node].sort().join() === [x, y].sort().join());
  for (const [x, y] of [['rutx11', 'rear-led-bms-ble-reader'], ['tekwill-wifi', 'rutx11']]) {
    const links = between(x, y);
    assert.equal(links.length, 1, `${x} ↔ ${y}`);
    assert.equal(links[0].medium, 'wireless', `${x} ↔ ${y}`);
  }
});

test('every topology link interface exists on its device', () => {
  const devices = resolveDevices({});
  const topology = resolveTopology({});
  const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
  for (const link of topology.links) {
    for (const end of [link.a, link.b]) {
      const node = nodes.get(end.node);
      assert.ok(node, `unknown node ${end.node}`);
      if (!end.interface) continue;
      const device = devices.find((item) => item.id === node.device);
      assert.ok(device?.interfaces.some((iface) => iface.name === end.interface),
        `${end.node} has no interface ${end.interface}`);
    }
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NetworkMonitor } from '../src/monitor.js';

class FakeProber {
  constructor(results) {
    this.results = results;
  }

  async probe(address) {
    return this.results[address];
  }
}

const result = (reachable) => ({
  reachable,
  latency_ms: reachable ? 1.2 : null,
  checked_at: '2026-01-01T00:00:00.000Z',
  error: reachable ? null : 'No ICMP response',
});

test('device statuses and history limit', async () => {
  const devices = [{
    id: 'router',
    name: 'Router',
    role: 'router',
    interfaces: [{ name: 'A', address: '10.0.0.1' }, { name: 'B', address: '10.0.0.2' }],
  }];
  const monitor = new NetworkMonitor(devices, new FakeProber({ '10.0.0.1': result(true), '10.0.0.2': result(false) }));

  assert.equal(monitor.snapshot()[0].status, 'unknown');

  await monitor.pollOnce();
  const [snapshot] = monitor.snapshot();
  assert.equal(snapshot.status, 'partial');
  assert.equal(snapshot.interfaces[0].status, 'online');
  assert.equal(snapshot.interfaces[0].latency_ms, 1.2);
  assert.equal(snapshot.interfaces[1].status, 'offline');

  for (let i = 0; i < 65; i += 1) await monitor.pollOnce();
  assert.equal(monitor.snapshot()[0].interfaces[0].history.length, 60);
});

test('device rollup covers online and offline', async () => {
  const devices = [
    { id: 'up', name: 'Up', role: '', interfaces: [{ name: 'A', address: '10.0.0.1' }] },
    { id: 'down', name: 'Down', role: '', interfaces: [{ name: 'A', address: '10.0.0.2' }] },
  ];
  const monitor = new NetworkMonitor(devices, new FakeProber({ '10.0.0.1': result(true), '10.0.0.2': result(false) }));
  await monitor.pollOnce();
  assert.equal(monitor.device('up').status, 'online');
  assert.equal(monitor.device('down').status, 'offline');
  assert.equal(monitor.device('missing'), null);
});

test('snapshot does not expose internal state', async () => {
  const devices = [{ id: 'd', name: 'D', role: '', interfaces: [{ name: 'A', address: '10.0.0.1' }] }];
  const monitor = new NetworkMonitor(devices, new FakeProber({ '10.0.0.1': result(true) }));
  await monitor.pollOnce();
  monitor.snapshot()[0].interfaces[0].history.push('junk');
  assert.equal(monitor.snapshot()[0].interfaces[0].history.length, 1);
  assert.equal(devices[0].status, undefined);
});

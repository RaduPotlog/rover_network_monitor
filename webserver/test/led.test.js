import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveLedReference } from '../src/config.js';
import { LedMonitor, decodeRgba } from '../src/led.js';

class FakeBridge {
  connected = true;
  handlers = new Map();
  subscribe(topic, _type, handler) { this.handlers.set(topic, handler); }
  publish(topic, msg) { this.handlers.get(topic)(msg); }
}

const idle = (priority) => ({ priority, active: false, id: 0, name: '', param: '', repeating: false, progress: 0, queued: 0 });

function segment(name, channel, playing = {}) {
  return {
    name,
    channel,
    layers: [0, 1, 2, 3].map((priority) => (playing[priority] ? { ...idle(priority), active: true, ...playing[priority] } : idle(priority))),
  };
}

function setup() {
  let now = 1_000_000;
  const bridge = new FakeBridge();
  const led = new LedMonitor(bridge, resolveLedReference(), { now: () => now });
  return { bridge, led, advance: (ms) => { now += ms; } };
}

const catalog = { animations: [...Array(11).keys()].map((id) => ({ id, name: `LOADED_${id}`, priority: 3 })) };

test('subscribes to the rover_led topics', () => {
  const { bridge } = setup();
  assert.deepEqual([...bridge.handlers.keys()].sort(),
    ['/led/animations', '/led/channel_1_frame', '/led/channel_2_frame', '/led/state']);
});

test('lists the full reference table and marks what the robot has not loaded', () => {
  const { bridge, led } = setup();
  assert.ok(led.snapshot().animations.every((row) => row.configured === null));

  bridge.publish('/led/animations', catalog);
  const rows = led.snapshot().animations;

  assert.equal(rows.length, 18);
  assert.deepEqual(rows.filter((row) => !row.configured).map((row) => row.id), [11, 12, 13, 14, 15, 16, 17]);
  // The loaded catalog wins over the reference for name and priority.
  assert.equal(rows[1].name, 'LOADED_1');
  assert.equal(rows[17].name, 'FLOOD_LIGHT');
  assert.equal(rows[17].layer, 'STATE');
});

test('reports the highest-priority playing layer on top', () => {
  const { bridge, led } = setup();
  bridge.publish('/led/state', {
    segments: [
      segment('front_1', 1, { 1: { id: 9, name: 'CHARGER_INSERTED', progress: 0.4, queued: 2 }, 3: { id: 1, name: 'READY', repeating: true } }),
      segment('rear_1', 2, { 3: { id: 1, name: 'READY', repeating: true } }),
    ],
  });

  const snapshot = led.snapshot();

  assert.equal(snapshot.stale, false);
  assert.equal(snapshot.top.name, 'CHARGER_INSERTED');
  assert.equal(snapshot.top.layer, 'ALERT');
  assert.equal(snapshot.top.queued, 2);
  assert.deepEqual(snapshot.layers[3].animations[0].segments, ['front_1', 'rear_1']);
  assert.equal(snapshot.layers[0].animations.length, 0);
  assert.deepEqual(snapshot.animations.filter((row) => row.active).map((row) => row.id), [1, 9]);
  assert.deepEqual(snapshot.segments, [{ name: 'front_1', channel: 1 }, { name: 'rear_1', channel: 2 }]);
});

test('drops state and frames that stopped arriving', () => {
  const { bridge, led, advance } = setup();
  bridge.publish('/led/state', { segments: [segment('front_1', 1, { 3: { id: 0, name: 'E_STOP' } })] });
  bridge.publish('/led/channel_1_frame', { data: Buffer.from([255, 0, 0, 255]).toString('base64') });

  advance(2500);
  const snapshot = led.snapshot();

  assert.equal(snapshot.stale, true);
  assert.equal(snapshot.top, null);
  assert.ok(snapshot.animations.every((row) => !row.active));
  assert.equal(snapshot.panels[0].leds, null);
  assert.notEqual(snapshot.updated_at, null);
});

test('decodes rgba8 frames sent as base64 or as arrays', () => {
  const bytes = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(decodeRgba({ data: Buffer.from(bytes).toString('base64') }), [[1, 2, 3, 4], [5, 6, 7, 8]]);
  assert.deepEqual(decodeRgba({ data: bytes }), [[1, 2, 3, 4], [5, 6, 7, 8]]);
});

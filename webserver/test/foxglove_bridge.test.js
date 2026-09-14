import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { parse } from '@foxglove/rosmsg';
import { MessageWriter } from '@foxglove/rosmsg2-serialization';

import { FoxgloveBridgeClient } from '../src/foxglove_bridge.js';

const SCHEMA = 'string name\nuint8[] data\n';
const writer = new MessageWriter(parse(SCHEMA, { ros2: true }));
const cdr = (msg) => new DataView(writer.writeMessage(msg).buffer);

const channel = (id, topic) => ({ id, topic, encoding: 'cdr', schemaName: 'test_msgs/msg/Blob', schemaEncoding: 'ros2msg', schema: SCHEMA });

class FakeClient extends EventEmitter {
  subscribed = [];
  nextId = 0;
  subscribe(channelId) { this.subscribed.push(channelId); return this.nextId++; }
  close() { this.emit('close'); }
}

function setup() {
  let now = 0;
  const clients = [];
  const bridge = new FoxgloveBridgeClient('ws://fake', {
    createClient: () => { const client = new FakeClient(); clients.push(client); return client; },
    minBackoffMs: 1,
    now: () => now,
  });
  const received = [];
  bridge.subscribe('/blob', 'test_msgs/msg/Blob', (msg) => received.push(msg), { throttle_rate: 200 });
  bridge.start();
  return { bridge, clients, received, advance: (ms) => { now += ms; } };
}

test('subscribes once the topic is advertised and decodes CDR', (t) => {
  const { bridge, clients, received } = setup();
  t.after(() => bridge.close());
  const client = clients[0];
  client.emit('open');
  assert.equal(bridge.connected, true);

  client.emit('advertise', [channel(7, '/other'), channel(3, '/blob')]);
  assert.deepEqual(client.subscribed, [3]);

  client.emit('message', { subscriptionId: 0, data: cdr({ name: 'hi', data: Uint8Array.from([1, 2]) }) });
  assert.equal(received.length, 1);
  assert.equal(received[0].name, 'hi');
  assert.deepEqual([...received[0].data], [1, 2]);
});

test('throttles messages to throttle_rate', (t) => {
  const { bridge, clients, received, advance } = setup();
  t.after(() => bridge.close());
  const client = clients[0];
  client.emit('open');
  client.emit('advertise', [channel(3, '/blob')]);

  const message = { subscriptionId: 0, data: cdr({ name: 'x', data: new Uint8Array() }) };
  client.emit('message', message);
  advance(100);
  client.emit('message', message);
  advance(150);
  client.emit('message', message);
  assert.equal(received.length, 2);
});

test('resubscribes after re-advertise and after reconnect', async (t) => {
  const { bridge, clients } = setup();
  t.after(() => bridge.close());
  const first = clients[0];
  first.emit('open');
  first.emit('advertise', [channel(3, '/blob')]);
  first.emit('unadvertise', [3]);
  first.emit('advertise', [channel(4, '/blob')]);
  assert.deepEqual(first.subscribed, [3, 4]);

  first.emit('close');
  assert.equal(bridge.connected, false);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = clients[1];
  assert.ok(second, 'reconnected');
  second.emit('open');
  second.emit('advertise', [channel(9, '/blob')]);
  assert.deepEqual(second.subscribed, [9]);
});

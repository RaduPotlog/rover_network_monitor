import { parse } from '@foxglove/rosmsg';
import { MessageReader } from '@foxglove/rosmsg2-serialization';
import { FoxgloveClient } from '@foxglove/ws-protocol';

/**
 * Minimal foxglove_bridge client (subscribe only) on Node's built-in WebSocket.
 *
 * foxglove_bridge runs in the rovera1-app container; both containers use host
 * networking, so the default URL reaches it over loopback. Subscriptions are
 * remembered and re-sent whenever their topic is (re-)advertised, including
 * after every reconnect. Messages arrive as CDR and are decoded with the
 * message definition the bridge sends in each channel advertisement.
 */

// Newer SDK-based bridges speak "foxglove.sdk.v1"; @foxglove/ws-protocol only
// knows the older name, but the subscribe/message path is the same.
const SUBPROTOCOLS = ['foxglove.sdk.v1', FoxgloveClient.SUPPORTED_SUBPROTOCOL];

function defaultCreateClient(url) {
  return new FoxgloveClient({ ws: new WebSocket(url, SUBPROTOCOLS) });
}

export class FoxgloveBridgeClient {
  constructor(url, { createClient = defaultCreateClient, minBackoffMs = 1000, maxBackoffMs = 10000, now = () => Date.now() } = {}) {
    this.url = url;
    this.createClient = createClient;
    this.minBackoffMs = minBackoffMs;
    this.maxBackoffMs = maxBackoffMs;
    this.now = now;
    this.backoffMs = minBackoffMs;
    this.subscriptions = new Map();
    this.active = new Map();
    this.client = null;
    this.connected = false;
    this.closed = false;
    this.timer = null;
  }

  /** Register a subscription; `options.throttle_rate` (ms) drops messages arriving faster than that. */
  subscribe(topic, type, handler, options = {}) {
    this.subscriptions.set(topic, { type, handler, options });
  }

  start() {
    this.closed = false;
    this.connect();
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.client?.close();
    this.connected = false;
  }

  connect() {
    let client;
    try {
      client = this.createClient(this.url);
    } catch (error) {
      console.error(`foxglove_bridge ${this.url}: ${error.message}`);
      this.scheduleReconnect();
      return;
    }
    this.client = client;
    this.active.clear();

    client.on('open', () => {
      this.connected = true;
      this.backoffMs = this.minBackoffMs;
      console.log(`Connected to foxglove_bridge at ${this.url}`);
    });

    client.on('advertise', (channels) => this.handleAdvertise(client, channels));

    client.on('unadvertise', (channelIds) => {
      const gone = new Set(channelIds);
      for (const [subscriptionId, entry] of this.active) {
        if (gone.has(entry.channelId)) this.active.delete(subscriptionId);
      }
    });

    client.on('message', (event) => this.handleMessage(event));

    // 'error' is always followed by 'close', which does the reconnecting.
    client.on('error', () => {});

    client.on('close', () => {
      if (this.client !== client) return;
      if (this.connected) console.warn(`Lost connection to foxglove_bridge at ${this.url}`);
      this.connected = false;
      this.client = null;
      this.active.clear();
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
  }

  handleAdvertise(client, channels) {
    for (const channel of channels) {
      const wanted = this.subscriptions.get(channel.topic);
      if (!wanted) continue;
      if ([...this.active.values()].some((entry) => entry.topic === channel.topic)) continue;
      if (channel.encoding !== 'cdr' || channel.schemaEncoding === 'ros2idl') {
        console.error(`${channel.topic}: unsupported encoding ${channel.encoding}/${channel.schemaEncoding}`);
        continue;
      }
      if (channel.schemaName !== wanted.type) {
        console.warn(`${channel.topic}: expected ${wanted.type}, bridge advertises ${channel.schemaName}`);
      }
      let reader;
      try {
        reader = new MessageReader(parse(channel.schema, { ros2: true }));
      } catch (error) {
        console.error(`${channel.topic}: cannot parse schema: ${error.message}`);
        continue;
      }
      const subscriptionId = client.subscribe(channel.id);
      this.active.set(subscriptionId, { topic: channel.topic, channelId: channel.id, reader, lastAt: null });
    }
  }

  handleMessage({ subscriptionId, data }) {
    const entry = this.active.get(subscriptionId);
    if (!entry) return;
    const subscription = this.subscriptions.get(entry.topic);
    const throttleMs = subscription.options.throttle_rate ?? 0;
    const at = this.now();
    if (throttleMs > 0 && entry.lastAt != null && at - entry.lastAt < throttleMs) return;
    entry.lastAt = at;
    try {
      subscription.handler(entry.reader.readMessage(data));
    } catch (error) {
      console.error(`Handling ${entry.topic} failed:`, error);
    }
  }
}

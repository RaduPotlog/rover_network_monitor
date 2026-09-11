/**
 * Minimal rosbridge v2 client (subscribe only) on Node's built-in WebSocket.
 *
 * rosbridge runs in the rovera1-app container; both containers use host
 * networking, so the default URL reaches it over loopback. Subscriptions are
 * remembered and re-sent after every reconnect.
 */
export class RosBridgeClient {
  constructor(url, { WebSocketImpl = globalThis.WebSocket, minBackoffMs = 1000, maxBackoffMs = 10000 } = {}) {
    this.url = url;
    this.WebSocketImpl = WebSocketImpl;
    this.minBackoffMs = minBackoffMs;
    this.maxBackoffMs = maxBackoffMs;
    this.backoffMs = minBackoffMs;
    this.subscriptions = new Map();
    this.socket = null;
    this.connected = false;
    this.closed = false;
    this.timer = null;
  }

  /** Register a subscription; `options` are extra rosbridge fields (throttle_rate, queue_length). */
  subscribe(topic, type, handler, options = {}) {
    this.subscriptions.set(topic, { type, handler, options });
    if (this.connected) this.sendSubscribe(topic);
  }

  start() {
    this.closed = false;
    this.connect();
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.socket?.close();
    this.connected = false;
  }

  connect() {
    let socket;
    try {
      socket = new this.WebSocketImpl(this.url);
    } catch (error) {
      console.error(`rosbridge ${this.url}: ${error.message}`);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.connected = true;
      this.backoffMs = this.minBackoffMs;
      console.log(`Connected to rosbridge at ${this.url}`);
      for (const topic of this.subscriptions.keys()) this.sendSubscribe(topic);
    });

    socket.addEventListener('message', (event) => this.handleMessage(event.data));

    // 'error' is always followed by 'close', which does the reconnecting.
    socket.addEventListener('error', () => {});

    socket.addEventListener('close', () => {
      if (this.connected) console.warn(`Lost connection to rosbridge at ${this.url}`);
      this.connected = false;
      if (this.socket === socket) this.socket = null;
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
  }

  sendSubscribe(topic) {
    const { type, options } = this.subscriptions.get(topic);
    this.socket.send(JSON.stringify({ op: 'subscribe', id: `subscribe:${topic}`, topic, type, ...options }));
  }

  handleMessage(data) {
    let message;
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    if (message.op !== 'publish') return;
    const subscription = this.subscriptions.get(message.topic);
    if (!subscription) return;
    try {
      subscription.handler(message.msg);
    } catch (error) {
      console.error(`Handling ${message.topic} failed:`, error);
    }
  }
}

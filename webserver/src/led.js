/**
 * LED animation status, fed by rover_led over rosbridge.
 *
 * led_controller publishes the loaded animations once on /led/animations
 * (latched), what every priority layer plays on /led/state (5 Hz) and one
 * RGBA frame per panel on /led/channel_<n>_frame (50 Hz, throttled here).
 * The snapshot merges that with the Husarion reference table so animations
 * the robot has not loaded still show up, marked as not configured.
 */
const FRAME_OPTIONS = { throttle_rate: 200, queue_length: 1 };

export class LedMonitor {
  constructor(bridge, reference, { channels = [1, 2], staleMs = 2000, now = () => Date.now() } = {}) {
    this.bridge = bridge;
    this.reference = reference;
    this.layerNames = reference.layers;
    this.staleMs = staleMs;
    this.now = now;
    this.catalog = null;
    this.state = null;
    this.stateAt = null;
    this.frames = new Map(channels.map((channel) => [channel, null]));

    bridge.subscribe('/led/animations', 'rover_msgs/msg/LedAnimationCatalog', (msg) => {
      this.catalog = msg.animations;
    });
    bridge.subscribe('/led/state', 'rover_msgs/msg/LedState', (msg) => {
      this.state = msg;
      this.stateAt = this.now();
    });
    for (const channel of channels) {
      bridge.subscribe(`/led/channel_${channel}_frame`, 'sensor_msgs/msg/Image', (msg) => {
        this.frames.set(channel, { leds: decodeRgba(msg), at: this.now() });
      }, FRAME_OPTIONS);
    }
  }

  fresh(at) {
    return at != null && this.now() - at <= this.staleMs;
  }

  snapshot() {
    // Never report old data as current: a stale state means "unknown".
    const segments = this.fresh(this.stateAt) ? this.state.segments : null;
    const layers = this.layerNames.map((layer, priority) => ({
      priority, layer, animations: segments ? activeOnLayer(segments, priority) : [],
    }));
    const top = layers.find((layer) => layer.animations.length > 0);

    return {
      connected: this.bridge.connected,
      stale: segments == null,
      updated_at: this.stateAt == null ? null : new Date(this.stateAt).toISOString(),
      top: top ? { ...top.animations[0], priority: top.priority, layer: top.layer } : null,
      layers,
      segments: segments?.map(({ name, channel }) => ({ name, channel })) ?? [],
      animations: this.animationRows(layers),
      panels: [...this.frames].map(([channel, frame]) => ({
        channel, leds: frame && this.fresh(frame.at) ? frame.leds : null,
      })),
    };
  }

  animationRows(layers) {
    const loaded = this.catalog ? new Map(this.catalog.map((item) => [item.id, item])) : null;
    const reference = new Map(this.reference.animations.map((item) => [item.id, item]));
    const ids = [...new Set([...reference.keys(), ...(loaded?.keys() ?? [])])].sort((a, b) => a - b);
    const playing = new Map(layers.flatMap((layer) => layer.animations.map((item) => [item.id, item])));

    return ids.map((id) => {
      const known = reference.get(id);
      const item = loaded?.get(id) ?? known;
      return {
        id,
        name: item.name,
        priority: item.priority,
        layer: this.layerNames[item.priority] ?? null,
        description: known?.description ?? '',
        // null until the catalog arrives: "unknown", not "missing".
        configured: loaded ? loaded.has(id) : null,
        active: playing.has(id),
        segments: playing.get(id)?.segments ?? [],
      };
    });
  }
}

// Animations playing on one layer, merged across the segments they cover.
function activeOnLayer(segments, priority) {
  const byId = new Map();
  for (const segment of segments) {
    const layer = segment.layers.find((item) => item.priority === priority);
    if (!layer?.active) continue;
    const entry = byId.get(layer.id) ?? {
      id: layer.id,
      name: layer.name,
      param: layer.param,
      repeating: layer.repeating,
      progress: layer.progress,
      queued: layer.queued,
      segments: [],
    };
    entry.segments.push(segment.name);
    entry.queued = Math.max(entry.queued, layer.queued);
    byId.set(layer.id, entry);
  }
  return [...byId.values()];
}

/** sensor_msgs/Image (rgba8) → [[r, g, b, a], …]; rosbridge sends uint8[] as base64. */
export function decodeRgba(msg) {
  const bytes = typeof msg.data === 'string' ? Buffer.from(msg.data, 'base64') : Uint8Array.from(msg.data ?? []);
  const leds = [];
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    leds.push([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]);
  }
  return leds;
}

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadJson } from './monitor.js';

export const SRC_DIR = dirname(fileURLToPath(import.meta.url));

export function integerSetting(name, defaultValue, env = process.env) {
  const value = Number.parseInt(env[name] ?? String(defaultValue), 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be an integer of at least 1`);
  }
  return value;
}

export const stringSetting = (name, defaultValue, env = process.env) => env[name] || defaultValue;

/**
 * Load a JSON config, overridable without rebuilding the image.
 *
 * balenaOS cannot bind-mount a host file into a container, so the inline
 * `<PREFIX>_JSON` variable is the practical way to retarget a fleet or a
 * single device from balenaCloud. `<PREFIX>_FILE` covers the case where the
 * list arrives on a mounted volume instead. With neither set the committed
 * file is used, so behaviour is unchanged by default.
 */
function resolveJson(prefix, bundledFile, env) {
  const inline = env[`${prefix}_JSON`];
  if (inline) return JSON.parse(inline);
  return loadJson(env[`${prefix}_FILE`] || join(SRC_DIR, bundledFile));
}

export const resolveDevices = (env = process.env) => resolveJson('ROVER_WEB_DEVICES', 'devices.json', env);
export const resolveTopology = (env = process.env) => resolveJson('ROVER_WEB_TOPOLOGY', 'topology.json', env);
export const resolveLedReference = () => loadJson(join(SRC_DIR, 'led_reference.json'));

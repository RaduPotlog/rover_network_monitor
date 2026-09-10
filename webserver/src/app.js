import { join } from 'node:path';

import express from 'express';

import { SRC_DIR } from './config.js';

const WEB_DIR = join(SRC_DIR, '..');
const PUBLIC_DIR = join(WEB_DIR, 'public');
const LOGOS_DIR = join(WEB_DIR, 'resources', 'logos');
const INDEX_HTML = join(PUBLIC_DIR, 'index.html');
const STATES = ['online', 'partial', 'offline', 'unknown'];

export function createApp({ monitor, topology }) {
  const app = express();
  app.disable('x-powered-by');

  app.use('/static', express.static(PUBLIC_DIR));
  app.use('/logos', express.static(LOGOS_DIR, { maxAge: '1d' }));

  app.get('/', (_req, res) => res.sendFile(INDEX_HTML));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  app.get('/api/devices', (_req, res) => {
    const devices = monitor.snapshot();
    const summary = Object.fromEntries(
      STATES.map((state) => [state, devices.filter((device) => device.status === state).length]));
    res.json({ devices, summary });
  });

  app.get('/api/devices/:deviceId', (req, res) => {
    const device = monitor.device(req.params.deviceId);
    if (!device) return res.status(404).json({ detail: 'Device not found' });
    return res.json(device);
  });

  app.get('/api/topology', (_req, res) => res.json(topology));

  app.get('/devices/:deviceId', (req, res) => {
    if (!monitor.device(req.params.deviceId)) {
      return res.status(404).json({ detail: 'Device not found' });
    }
    return res.sendFile(INDEX_HTML);
  });

  return app;
}

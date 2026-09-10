import { DEFS, LABEL_OFFSET, deviceIcon } from './icons.js';

const STATES = ['online', 'partial', 'offline', 'unknown'];
const REFRESH_MS = 5000;
const HISTORY_SLOTS = 60;
const LIGHT_DISTANCE = 48;        // how far from a device centre the link light sits
const LIGHT_DISTANCE_BELOW = 76;  // cables leaving downwards must clear the label first
const ICON_ANCHOR_Y = -4;         // cables meet the icon slightly above its origin

// `dy` is the vertical component of the unit vector pointing away from the device.
const lightDistance = (dy) => (dy > 0.5 ? LIGHT_DISTANCE_BELOW : LIGHT_DISTANCE);

const detailId = decodeURIComponent(location.pathname.match(/^\/devices\/([^/]+)$/)?.[1] ?? '') || null;
const $ = (selector) => document.querySelector(selector);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const show = (value, suffix = '') => (value == null ? '—' : `${value}${suffix}`);
const formatTime = (iso) => (iso ? new Date(iso).toLocaleTimeString() : '—');

let topology = null;

// ---------------------------------------------------------------- topology

function interfaceOf(devicesById, node, end) {
  if (!end.interface || !node?.device) return null;
  return devicesById.get(node.device)?.interfaces.find((iface) => iface.name === end.interface) ?? null;
}

// A port with no probed address (switch, upstream Wi-Fi) mirrors the far end:
// if the host behind it answers, the cable between them must be up.
function lightState(own, far) {
  if (own) return own.status;
  if (far) return far.status;
  return 'unmonitored';
}

function lightShape(x, y, state) {
  if (state === 'online') return `<path class="light-online" d="M${x} ${y - 6.5}L${x + 6.5} ${y + 5}H${x - 6.5}Z"/>`;
  if (state === 'offline') return `<path class="light-offline" d="M${x - 6.5} ${y - 5}H${x + 6.5}L${x} ${y + 6.5}Z"/>`;
  return `<circle class="light-unknown" cx="${x}" cy="${y}" r="4.5"/>`;
}

function describeEnd(node, end, iface) {
  const where = `<b>${escapeHtml(node.name)}</b> ${escapeHtml(end.port)}`;
  if (!iface) return `${where}<br>not monitored`;
  return `${where}<br>${escapeHtml(iface.name)} ${escapeHtml(iface.address)} · ${escapeHtml(iface.status)}`
    + `${iface.latency_ms == null ? '' : ` · ${iface.latency_ms} ms`}`;
}

function describeNode(node, device) {
  const head = `<b>${escapeHtml(node.name)}</b> · ${escapeHtml(node.model)}`;
  if (!device) return `${head}<br>Not monitored (no IP address)`;
  const rows = device.interfaces.map((iface) =>
    `${escapeHtml(iface.name)} ${escapeHtml(iface.address)} — ${escapeHtml(iface.status)}`
    + `${iface.latency_ms == null ? '' : ` (${iface.latency_ms} ms)`}`);
  return `${head}<br>${escapeHtml(device.role)}<br>${rows.join('<br>')}`;
}

function renderTopology(devices) {
  const svg = $('#topology');
  const [minX, minY, width, height] = topology.viewBox ?? [0, 0, 1000, 470];
  svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);

  const devicesById = new Map(devices.map((device) => [device.id, device]));
  const nodesById = new Map(topology.nodes.map((node) => [node.id, node]));

  const links = topology.links.map((link) => {
    const nodeA = nodesById.get(link.a.node);
    const nodeB = nodesById.get(link.b.node);
    if (!nodeA || !nodeB) return '';
    const ax = nodeA.x; const ay = nodeA.y + ICON_ANCHOR_Y;
    const bx = nodeB.x; const by = nodeB.y + ICON_ANCHOR_Y;
    const length = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / length; const uy = (by - ay) / length;
    const ifaceA = interfaceOf(devicesById, nodeA, link.a);
    const ifaceB = interfaceOf(devicesById, nodeB, link.b);
    const cable = link.cable === 'cross' ? 'cable cable-cross' : 'cable';
    const tip = `${link.cable === 'cross' ? 'Crossover' : 'Straight-through'} cable<br>`
      + `${describeEnd(nodeA, link.a, ifaceA)}<br>↕<br>${describeEnd(nodeB, link.b, ifaceB)}`;
    const d = `M${ax} ${ay}L${bx} ${by}`;
    return `<g class="link" data-tip="${escapeHtml(tip)}">
      <path class="${cable}" d="${d}"/>
      <path class="link-hit" d="${d}"/>
      ${lightShape(ax + ux * lightDistance(uy), ay + uy * lightDistance(uy), lightState(ifaceA, ifaceB))}
      ${lightShape(bx - ux * lightDistance(-uy), by - uy * lightDistance(-uy), lightState(ifaceB, ifaceA))}
    </g>`;
  }).join('');

  const nodes = topology.nodes.map((node) => {
    const device = node.device ? devicesById.get(node.device) : null;
    const classes = ['node', device ? 'monitored' : '', device ? `status-${device.status}` : '',
      device && device.id === detailId ? 'selected' : ''].filter(Boolean).join(' ');
    // Rough text metrics are enough for a backing plate that hides cables under the label.
    const labelWidth = Math.max(node.name.length * 8.6, node.model.length * 7.2) + 12;
    return `<g class="${classes}" transform="translate(${node.x} ${node.y})"
        data-tip="${escapeHtml(describeNode(node, device))}" ${device ? `data-device="${escapeHtml(device.id)}"` : ''}>
      <ellipse class="node-halo" cx="0" cy="-6" rx="42" ry="32"/>
      ${deviceIcon(node.kind)}
      <rect class="label-plate" x="${-labelWidth / 2}" y="${LABEL_OFFSET - 13}" width="${labelWidth}" height="35" rx="4"/>
      <text class="node-label" y="${LABEL_OFFSET}">
        <tspan class="node-model" x="0">${escapeHtml(node.model)}</tspan>
        <tspan class="node-name" x="0" dy="16">${escapeHtml(node.name)}</tspan>
      </text>
    </g>`;
  }).join('');

  svg.innerHTML = `${DEFS}<g>${links}</g><g>${nodes}</g>`;
  $('#topology-name').textContent = topology.name ?? '';
}

function wireTopologyInteractions() {
  const svg = $('#topology');
  const wrap = svg.parentElement;
  const tooltip = $('#tooltip');

  svg.addEventListener('pointermove', (event) => {
    const target = event.target.closest('[data-tip]');
    if (!target) { tooltip.hidden = true; return; }
    tooltip.innerHTML = target.dataset.tip;
    tooltip.hidden = false;
    const box = wrap.getBoundingClientRect();
    let left = event.clientX - box.left + wrap.scrollLeft + 14;
    const top = event.clientY - box.top + 14;
    left = Math.min(left, wrap.scrollLeft + wrap.clientWidth - tooltip.offsetWidth - 8);
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${top}px`;
  });
  svg.addEventListener('pointerleave', () => { tooltip.hidden = true; });
  svg.addEventListener('click', (event) => {
    const node = event.target.closest('[data-device]');
    if (node) location.href = `/devices/${encodeURIComponent(node.dataset.device)}`;
  });
}

// ------------------------------------------------------------------- cards

function sparkline(history) {
  const w = 300; const h = 44; const pad = 4;
  const step = (w - pad * 2) / (HISTORY_SLOTS - 1);
  const offset = HISTORY_SLOTS - history.length;
  const latencies = history.filter((s) => s.reachable && s.latency_ms != null).map((s) => s.latency_ms);
  const max = Math.max(1, ...latencies);
  const points = [];
  const failures = [];
  history.forEach((sample, i) => {
    const x = pad + (offset + i) * step;
    if (sample.reachable && sample.latency_ms != null) {
      points.push(`${x.toFixed(1)},${(h - pad - (sample.latency_ms / max) * (h - pad * 2)).toFixed(1)}`);
    } else if (!sample.reachable) {
      failures.push(`<rect class="spark-fail" x="${(x - 1.5).toFixed(1)}" y="${h - 8}" width="3" height="6"/>`);
    }
  });
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    ${points.length > 1 ? `<polyline class="spark-line" points="${points.join(' ')}"/>` : ''}${failures.join('')}
  </svg>`;
}

function historyBlock(iface) {
  const total = iface.history.length;
  const lost = iface.history.filter((s) => !s.reachable).length;
  const latencies = iface.history.filter((s) => s.latency_ms != null).map((s) => s.latency_ms);
  const avg = latencies.length ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2) : null;
  return `<h4>${escapeHtml(iface.name)} · <span class="mono">${escapeHtml(iface.address)}</span></h4>
    ${sparkline(iface.history)}
    <p class="history-meta">${total} probes · ${total ? Math.round((lost / total) * 100) : 0}% loss · avg ${show(avg, ' ms')}
      ${iface.error ? ` · <span class="error-text">${escapeHtml(iface.error)}</span>` : ''}</p>`;
}

function deviceCard(device) {
  const lastCheck = device.interfaces.map((iface) => iface.checked_at).filter(Boolean).sort().at(-1);
  const rows = device.interfaces.map((iface) => `<tr>
      <td>${escapeHtml(iface.name)}</td>
      <td class="mono">${escapeHtml(iface.address)}</td>
      <td><span class="dot ${escapeHtml(iface.status)}"></span>${escapeHtml(iface.status)}</td>
      <td class="num">${show(iface.latency_ms, ' ms')}</td>
    </tr>`).join('');
  return `<article class="device ${escapeHtml(device.status)}">
    <div class="device-head">
      <h3>${escapeHtml(device.name)}</h3>
      <span class="badge ${escapeHtml(device.status)}">${escapeHtml(device.status)}</span>
    </div>
    <p class="role">${escapeHtml(device.role)}</p>
    <table class="ifaces">
      <thead><tr><th>Iface</th><th>Address</th><th>Status</th><th class="num">Latency</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${detailId ? `<div class="history">${device.interfaces.map(historyBlock).join('')}</div>` : ''}
    <div class="device-foot">
      <span>Last check ${formatTime(lastCheck)}</span>
      ${detailId ? '' : `<a href="/devices/${encodeURIComponent(device.id)}">Details →</a>`}
    </div>
  </article>`;
}

function renderSummary(summary) {
  $('#summary').innerHTML = STATES.map((state) =>
    `<div class="count ${state}"><strong>${summary[state]}</strong><span>${state}</span></div>`).join('');
}

// ------------------------------------------------------------------ refresh

function setLive(ok) {
  $('#live').className = `live ${ok ? 'ok' : 'error'}`;
  $('#live-text').textContent = ok ? `Live · ${new Date().toLocaleTimeString()}` : 'Disconnected';
  $('#error-banner').hidden = ok;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function refresh() {
  try {
    if (!topology) topology = await fetchJson('/api/topology');
    const data = await fetchJson('/api/devices');
    let { devices, summary } = data;

    if (detailId) {
      const device = devices.find((item) => item.id === detailId);
      if (!device) throw new Error('Device not found');
      $('#page-title').textContent = device.name;
      $('#lede').textContent = `${device.role} — interface status and recent probe history.`;
      document.title = `${device.name} · Rover A1 Network Monitor`;
      $('#devices-heading').textContent = 'Device';
      summary = Object.fromEntries(STATES.map((state) => [state, device.status === state ? 1 : 0]));
      renderTopology(data.devices);
      devices = [device];
    } else {
      renderTopology(devices);
    }

    renderSummary(summary);
    $('#devices').innerHTML = devices.map(deviceCard).join('');
    setLive(true);
  } catch (error) {
    console.error(error);
    setLive(false);
  }
}

$('#back-link').hidden = !detailId;
wireTopologyInteractions();
refresh();
setInterval(refresh, REFRESH_MS);

const REFRESH_MS = 500;

const $ = (selector) => document.querySelector(selector);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const layerChip = (layer) => `<span class="layer-chip layer-${escapeHtml(layer?.toLowerCase())}">${escapeHtml(layer ?? '—')}</span>`;

const progressBar = (progress) => {
  const percent = Math.round(Math.min(Math.max(progress ?? 0, 0), 1) * 100);
  return `<span class="progress" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
    <span style="width:${percent}%"></span></span><span class="progress-text">${percent}%</span>`;
};

// The alpha channel is the LED's brightness (see rover_led's SK9822 encoder).
function ledColor([r, g, b, a]) {
  const scale = a / 255;
  return `rgb(${Math.round(r * scale)} ${Math.round(g * scale)} ${Math.round(b * scale)})`;
}

// ------------------------------------------------------------------ render

function renderNow(data) {
  const top = data.top;
  if (!top) {
    $('#now').innerHTML = `<div class="now-card idle">
      <span class="now-kicker">On top</span>
      <strong>${data.stale ? 'Unknown' : 'No animation'}</strong>
      <span class="now-meta">${data.stale ? 'No LED state received from led_controller' : 'Every layer is idle'}</span>
    </div>`;
    return;
  }
  $('#now').innerHTML = `<div class="now-card">
    <span class="now-kicker">On top</span>
    <strong>${escapeHtml(top.name)} <span class="now-id">#${top.id}</span></strong>
    <span class="now-meta">${layerChip(top.layer)} priority ${top.priority}
      · ${top.repeating ? 'repeating' : 'one-shot'}${top.param ? ` · param ${escapeHtml(top.param)}` : ''}</span>
    ${progressBar(top.progress)}
  </div>`;
}

function renderStrips(data) {
  $('#strips').innerHTML = data.panels.map((panel) => {
    const names = data.segments.filter((segment) => segment.channel === panel.channel).map((segment) => segment.name);
    const leds = panel.leds
      ? panel.leds.map((led, i) => `<span class="led" style="--c:${ledColor(led)}" title="LED ${i}: rgba(${led.join(', ')})"></span>`).join('')
      : '<span class="strip-empty">No frame received</span>';
    return `<div class="strip">
      <div class="strip-label">Channel ${panel.channel}${names.length ? ` · ${names.map(escapeHtml).join(', ')}` : ''}</div>
      <div class="strip-leds" role="img" aria-label="Channel ${panel.channel} LED colours">${leds}</div>
    </div>`;
  }).join('');
}

function renderLayers(data) {
  $('#layers').innerHTML = data.layers.map((layer) => {
    if (layer.animations.length === 0) {
      return `<tr class="muted"><td>${layerChip(layer.layer)}</td><td colspan="5">${data.stale ? 'Unknown' : 'Idle'}</td></tr>`;
    }
    return layer.animations.map((item) => `<tr>
      <td>${layerChip(layer.layer)}</td>
      <td><strong>${escapeHtml(item.name)}</strong> <span class="mono">#${item.id}</span></td>
      <td class="mono">${escapeHtml(item.param) || '—'}</td>
      <td>${item.repeating ? 'Repeating' : 'One-shot'}${item.queued ? ` · ${item.queued} queued` : ''}</td>
      <td class="progress-cell">${progressBar(item.progress)}</td>
      <td>${item.segments.map(escapeHtml).join(', ')}</td>
    </tr>`).join('');
  }).join('');
}

function stateBadge(row) {
  if (row.active) return '<span class="badge playing">Playing</span>';
  if (row.configured === false) return '<span class="badge">Not configured</span>';
  if (row.configured === null) return '<span class="badge">Unknown</span>';
  return '<span class="badge idle">Idle</span>';
}

function renderAnimations(data) {
  $('#animations').innerHTML = data.animations.map((row) => {
    const classes = [row.active ? 'active' : '', row.configured === false ? 'muted' : ''].filter(Boolean).join(' ');
    return `<tr class="${classes}">
      <td class="num mono">${row.id}</td>
      <td><strong>${escapeHtml(row.name)}</strong></td>
      <td>${row.priority} ${layerChip(row.layer)}</td>
      <td>${escapeHtml(row.description)}</td>
      <td>${stateBadge(row)}${row.active ? ` <span class="panel-sub">${row.segments.map(escapeHtml).join(', ')}</span>` : ''}</td>
    </tr>`;
  }).join('');
  const loaded = data.animations.filter((row) => row.configured).length;
  $('#table-sub').textContent = data.animations.some((row) => row.configured === null)
    ? 'Waiting for the animation list from led_controller'
    : `${loaded} of ${data.animations.length} loaded on this robot`;
}

// ------------------------------------------------------------------ refresh

function setStatus(data, error) {
  const ok = !error && data.connected && !data.stale;
  $('#live').className = `live ${ok ? 'ok' : 'error'}`;
  $('#live-text').textContent = ok ? `Live · ${new Date().toLocaleTimeString()}` : 'Disconnected';

  let problem = null;
  if (error) problem = 'Unable to reach the dashboard server. Retrying…';
  else if (!data.connected) problem = 'Not connected to rosbridge. Retrying…';
  else if (data.stale) problem = 'No LED state from led_controller (/led/state). Is rover_led running?';
  $('#error-banner').hidden = !problem;
  $('#error-banner').textContent = problem ?? '';
}

async function refresh() {
  try {
    const response = await fetch('/api/led', { cache: 'no-store' });
    if (!response.ok) throw new Error(`/api/led: HTTP ${response.status}`);
    const data = await response.json();
    renderNow(data);
    renderStrips(data);
    renderLayers(data);
    renderAnimations(data);
    setStatus(data, null);
  } catch (error) {
    console.error(error);
    setStatus(null, error);
  }
}

refresh();
setInterval(refresh, REFRESH_MS);

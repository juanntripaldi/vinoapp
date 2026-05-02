/* ─── Estado global ──────────────────────────────────────────────────────────── */
let sortCol = 'nombre';
let sortDir = 'asc';
let chatHistory = [];
let charts = {};
let map = null;
let mapMarkers = [];
let debounceTimer = null;
let isUpdating = false;

const SOURCE_LABELS = {
  cepas_argentinas: 'Cepas Argentinas',
  mp_drinks: 'MP Drinks',
  rustico: 'Rústico',
};

const WINE_REGIONS_COORDS = {
  'Mendoza':            [-32.89, -68.83],
  'Luján de Cuyo':      [-33.05, -68.87],
  'Valle de Uco':       [-33.67, -69.19],
  'Maipú':              [-32.98, -68.78],
  'San Rafael':         [-34.62, -68.33],
  'San Juan':           [-31.54, -68.54],
  'Salta':              [-24.78, -65.42],
  'La Rioja':           [-29.42, -66.86],
  'Neuquén':            [-38.95, -68.06],
  'Río Negro':          [-39.03, -67.59],
  'Patagonia':          [-40.00, -70.00],
  'Chubut':             [-43.30, -65.10],
  'Buenos Aires':       [-34.60, -58.38],
  'Córdoba':            [-31.42, -64.19],
  'Jujuy':              [-23.21, -65.29],
  'Tucumán':            [-26.82, -65.22],
  'Catamarca':          [-28.47, -65.78],
};

/* ─── Navegación entre vistas ────────────────────────────────────────────────── */
document.querySelectorAll('[data-view]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    const view = el.dataset.view;
    showView(view);
  });
});

function showView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');

  document.querySelectorAll('[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  if (view === 'dashboard') loadDashboard();
  if (view === 'consultor') checkApiStatus();
}

/* ─── Toast notifications ────────────────────────────────────────────────────── */
function showToast(msg, type = 'info', duration = 4000) {
  const icons = { success: 'bi-check-circle', error: 'bi-x-circle', info: 'bi-info-circle' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  const container = document.getElementById('toast-container');
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.4s'; setTimeout(() => el.remove(), 400); }, duration);
}

/* ─── Formateo ───────────────────────────────────────────────────────────────── */
function formatPrice(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Math.round(n).toLocaleString('es-AR');
}

function formatDate(iso) {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' +
         d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/* ─── Lista de vinos ─────────────────────────────────────────────────────────── */
function debouncedLoad() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadWines, 350);
}

async function loadWines() {
  const params = new URLSearchParams();
  const nombre   = document.getElementById('f-nombre').value.trim();
  const source   = document.getElementById('f-source').value;
  const cepa     = document.getElementById('f-cepa').value;
  const pais     = document.getElementById('f-pais').value;
  const provincia = document.getElementById('f-provincia').value;
  const zona     = document.getElementById('f-zona').value;
  const minP     = document.getElementById('f-min').value;
  const maxP     = document.getElementById('f-max').value;

  if (nombre)    params.set('nombre', nombre);
  if (source)    params.set('source', source);
  if (cepa)      params.set('cepa', cepa);
  if (pais)      params.set('pais', pais);
  if (provincia) params.set('provincia', provincia);
  if (zona)      params.set('zona', zona);
  if (minP)      params.set('min_price', minP);
  if (maxP)      params.set('max_price', maxP);
  params.set('sort', sortCol);
  params.set('dir', sortDir);

  try {
    const resp = await fetch(`/api/wines?${params}`);
    const wines = await resp.json();
    renderWines(wines);
    document.getElementById('results-count').textContent = `${wines.length} vino${wines.length !== 1 ? 's' : ''}`;
  } catch (err) {
    console.error('Error cargando vinos:', err);
  }
}

function renderWines(wines) {
  const tbody = document.getElementById('wines-tbody');
  if (!wines.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:60px 20px;text-align:center;color:var(--text-muted)">
      <div><i class="bi bi-search" style="font-size:2rem;display:block;margin-bottom:10px;color:var(--gold)"></i>
      No hay vinos que coincidan con los filtros</div></td></tr>`;
    return;
  }

  tbody.innerHTML = wines.map(w => `
    <tr>
      <td class="nombre">${escHtml(w.nombre || '—')}</td>
      <td>${escHtml(w.bodega || '—')}</td>
      <td>${w.cepa ? `<span style="background:#F3E8FF;color:#6B21A8;padding:2px 8px;border-radius:12px;font-size:0.78rem">${escHtml(w.cepa)}</span>` : '—'}</td>
      <td style="font-size:0.82rem;color:var(--text-muted)">${escHtml(w.subzona || '—')}</td>
      <td style="font-size:0.82rem">${escHtml(w.zona || '—')}</td>
      <td style="font-size:0.82rem">${escHtml(w.provincia || '—')}</td>
      <td style="font-size:0.82rem">${escHtml(w.pais || '—')}</td>
      <td class="precio">${formatPrice(w.precio)}</td>
      <td style="text-align:center;font-size:0.85rem">${w.min_unidades || 1}</td>
      <td><span class="badge-source badge-${w.source}">${SOURCE_LABELS[w.source] || w.source}</span></td>
    </tr>
  `).join('');
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setSort(col) {
  if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortCol = col; sortDir = 'asc'; }

  document.querySelectorAll('.wine-table th.sortable').forEach(th => {
    th.classList.remove('sorted');
    th.querySelector('.sort-icon').textContent = '↕';
  });
  const th = document.getElementById(`th-${col}`);
  if (th) {
    th.classList.add('sorted');
    th.querySelector('.sort-icon').textContent = sortDir === 'asc' ? '↑' : '↓';
  }

  loadWines();
}

function clearFilters() {
  document.getElementById('f-nombre').value = '';
  document.getElementById('f-source').value = '';
  document.getElementById('f-cepa').value = '';
  document.getElementById('f-pais').value = '';
  document.getElementById('f-provincia').value = '';
  document.getElementById('f-zona').value = '';
  document.getElementById('f-min').value = '';
  document.getElementById('f-max').value = '';
  loadWines();
}

/* ─── Opciones de filtros dinámicos ──────────────────────────────────────────── */
async function loadFilterOptions() {
  try {
    const resp = await fetch('/api/options');
    const opts = await resp.json();

    document.getElementById('f-cepa').innerHTML = '<option value="">Todas las cepas</option>' +
      opts.cepas.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');

    document.getElementById('f-pais').innerHTML = '<option value="">Todos los países</option>' +
      opts.paises.map(p => `<option value="${escHtml(p)}">${escHtml(p)}</option>`).join('');

    document.getElementById('f-provincia').innerHTML = '<option value="">Todas las provincias</option>' +
      opts.provincias.map(p => `<option value="${escHtml(p)}">${escHtml(p)}</option>`).join('');

    document.getElementById('f-zona').innerHTML = '<option value="">Todas las zonas</option>' +
      opts.zonas.map(z => `<option value="${escHtml(z)}">${escHtml(z)}</option>`).join('');
  } catch {}
}

/* ─── Actualizar datos ───────────────────────────────────────────────────────── */
async function updateAll() {
  if (isUpdating) return;
  isUpdating = true;
  const btn = document.getElementById('btn-update-all');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Actualizando...';

  try {
    const resp = await fetch('/api/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'all' }) });
    const data = await resp.json();

    for (const [src, result] of Object.entries(data.results)) {
      if (result.success) showToast(`${SOURCE_LABELS[src]}: ${result.count} vinos importados`, 'success');
      else showToast(`${SOURCE_LABELS[src]}: ${result.error}`, 'error', 8000);
    }

    await loadWines();
    await loadFilterOptions();
    await loadStatus();
  } catch (err) {
    showToast('Error actualizando: ' + err.message, 'error');
  } finally {
    isUpdating = false;
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Actualizar Todo';
  }
}

async function updateSource(source) {
  if (isUpdating) return;
  showToast(`Actualizando ${SOURCE_LABELS[source]}...`, 'info', 2000);
  try {
    const resp = await fetch('/api/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) });
    const data = await resp.json();
    const result = data.results[source];
    if (result.success) showToast(`${SOURCE_LABELS[source]}: ${result.count} vinos importados`, 'success');
    else showToast(`Error: ${result.error}`, 'error', 8000);
    await loadWines();
    await loadFilterOptions();
    await loadStatus();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/* ─── Estado de fuentes ──────────────────────────────────────────────────────── */
async function loadStatus() {
  try {
    const resp = await fetch('/api/status');
    const status = await resp.json();
    const pill = document.getElementById('source-pills');
    const dots = { cepas_argentinas: 'dot-cepas', mp_drinks: 'dot-mp', rustico: 'dot-rustico' };

    const statusMap = {};
    status.forEach(s => statusMap[s.source] = s);

    const sources = ['cepas_argentinas', 'mp_drinks', 'rustico'];
    pill.innerHTML = sources.map(src => {
      const s = statusMap[src] || {};
      const count = s.total ? `${s.total} vinos` : 'Sin datos';
      const upd = s.last_updated ? formatDate(s.last_updated) : 'nunca';
      return `<span class="source-pill" title="Actualizado: ${upd}">
        <span class="dot ${dots[src]}"></span>
        <span>${SOURCE_LABELS[src]} · ${count}</span>
        <button class="btn-refresh-source" onclick="updateSource('${src}')"><i class="bi bi-arrow-clockwise"></i></button>
      </span>`;
    }).join('');

    document.getElementById('status-text').textContent = status.length ? `Última actualización: ${formatDate(status.map(s => s.last_updated).sort().reverse()[0])}` : '';
  } catch {}
}

/* ─── Dashboard ──────────────────────────────────────────────────────────────── */
async function loadDashboard() {
  try {
    const resp = await fetch('/api/stats');
    const stats = await resp.json();
    renderDashboard(stats);
  } catch (err) {
    showToast('Error cargando dashboard', 'error');
  }
}

function renderDashboard(s) {
  document.getElementById('d-total').textContent = s.total_vinos || 0;
  document.getElementById('d-bodegas').textContent = s.total_bodegas || 0;
  document.getElementById('d-cepas').textContent = s.total_cepas || 0;
  document.getElementById('d-proveedores').textContent = s.total_proveedores || 0;

  const colors = ['#7B1C2E', '#C9A870', '#2563EB', '#16A34A', '#DC2626', '#9333EA', '#F97316', '#0891B2', '#65A30D', '#E11D48'];
  const provLabels = { cepas_argentinas: 'Cepas Argentinas', mp_drinks: 'MP Drinks', rustico: 'Rústico' };

  // Vinos por proveedor (pie)
  renderChart('chart-proveedores', 'doughnut', {
    labels: (s.por_proveedor || []).map(r => provLabels[r.source] || r.source),
    datasets: [{ data: (s.por_proveedor || []).map(r => r.cantidad), backgroundColor: colors }],
  }, { plugins: { legend: { position: 'bottom' } } });

  // Precio promedio por proveedor (bar)
  renderChart('chart-precios-prov', 'bar', {
    labels: (s.por_proveedor || []).map(r => provLabels[r.source] || r.source),
    datasets: [{
      label: 'Precio promedio ($)',
      data: (s.por_proveedor || []).map(r => r.avg_precio),
      backgroundColor: colors,
    }],
  }, { plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => '$' + v.toLocaleString('es-AR') } } } });

  // Vinos por cepa (horizontal bar)
  const cepasData = s.por_cepa || [];
  renderChart('chart-cepas', 'bar', {
    labels: cepasData.map(r => r.cepa),
    datasets: [{ label: 'Cantidad', data: cepasData.map(r => r.cantidad), backgroundColor: '#7B1C2E' }],
  }, {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true } },
  });

  // Precio promedio por cepa
  const preciosCepa = s.precio_por_cepa || [];
  renderChart('chart-precio-cepa', 'bar', {
    labels: preciosCepa.map(r => r.cepa),
    datasets: [{
      label: 'Precio promedio',
      data: preciosCepa.map(r => r.avg_precio),
      backgroundColor: colors.map((c, i) => colors[i % colors.length]),
    }],
  }, {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { ticks: { callback: v => '$' + (v / 1000).toFixed(0) + 'k' } } },
  });

  // Vinos por bodega (horizontal bar)
  const bodegasData = s.por_bodega || [];
  renderChart('chart-bodegas', 'bar', {
    labels: bodegasData.map(r => r.bodega),
    datasets: [{ label: 'Vinos', data: bodegasData.map(r => r.cantidad), backgroundColor: '#C9A870' }],
  }, {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true } },
  });

  // Vinos por provincia (doughnut)
  const provinciasData = (s.por_provincia || []).filter(r => r.provincia);
  renderChart('chart-provincias', 'doughnut', {
    labels: provinciasData.map(r => r.provincia),
    datasets: [{ data: provinciasData.map(r => r.cantidad), backgroundColor: colors }],
  }, { plugins: { legend: { position: 'bottom' } } });

  // Mapa por provincia
  renderMap(s.por_provincia || []);
}

function renderChart(canvasId, type, data, options = {}) {
  if (charts[canvasId]) { charts[canvasId].destroy(); }
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  charts[canvasId] = new Chart(ctx, {
    type,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'top' } },
      ...options,
    },
  });
}

/* ─── Mapa ───────────────────────────────────────────────────────────────────── */
function renderMap(provinciaData) {
  if (!map) {
    map = L.map('wine-map').setView([-34, -66], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
  }

  mapMarkers.forEach(m => m.remove());
  mapMarkers = [];

  const dataMap = {};
  provinciaData.forEach(r => { if (r.provincia) dataMap[r.provincia] = r.cantidad; });

  const maxCount = Math.max(...Object.values(dataMap), 1);

  Object.entries(WINE_REGIONS_COORDS).forEach(([region, coords]) => {
    const count = dataMap[region] || 0;
    const radius = count ? 8 + (count / maxCount) * 30 : 6;
    const color = count ? '#7B1C2E' : '#ccc';
    const marker = L.circleMarker(coords, {
      radius,
      fillColor: color,
      fillOpacity: 0.75,
      color: 'white',
      weight: 2,
    });
    marker.bindPopup(`<strong>${region}</strong><br>${count} vino${count !== 1 ? 's' : ''}`);
    marker.addTo(map);
    mapMarkers.push(marker);
  });
}

/* ─── Chat IA ────────────────────────────────────────────────────────────────── */
async function checkApiStatus() {
  const warning = document.getElementById('api-warning');
  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '...', history: [] }),
    });
    const data = await resp.json();
    warning.style.display = data.error && data.error.includes('ANTHROPIC_API_KEY') ? 'block' : 'none';
  } catch { warning.style.display = 'none'; }
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
}

function addMessage(content, role) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `msg msg-${role}`;
  if (role === 'assistant') {
    div.innerHTML = content.replace(/\n/g, '<br>');
  } else {
    div.textContent = content;
  }
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  const btn = document.getElementById('btn-send');
  input.value = '';
  input.style.height = 'auto';
  btn.disabled = true;

  addMessage(message, 'user');
  chatHistory.push({ role: 'user', content: message });

  const typingDiv = addMessage('Pensando...', 'typing');

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: chatHistory.slice(-10) }),
    });
    const data = await resp.json();
    typingDiv.remove();

    if (data.error) {
      addMessage(data.error, 'error');
    } else {
      addMessage(data.response, 'assistant');
      chatHistory.push({ role: 'assistant', content: data.response });
    }
  } catch (err) {
    typingDiv.remove();
    addMessage('Error de conexión: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    input.focus();
  }
}

// Auto-resize textarea
document.getElementById('chat-input').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

/* ─── Init ───────────────────────────────────────────────────────────────────── */
async function init() {
  await Promise.all([loadWines(), loadStatus(), loadFilterOptions()]);
}

init();

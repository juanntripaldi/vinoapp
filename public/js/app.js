/* ─── Estado global ──────────────────────────────────────────────────────────── */
let sortCol = 'nombre';
let sortDir = 'asc';
let chatHistory = [];
let charts = {};
let map = null;
let mapMarkers = [];
let debounceTimer = null;
let isUpdating = false;
let currentWines = [];
let historialFilter = 'all';
let allHistory = [];

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

/* ─── MultiSelect ────────────────────────────────────────────────────────────── */
class MultiSelect {
  constructor(containerId, placeholder, onChange, labelMap = null) {
    this.container = document.getElementById(containerId);
    this.placeholder = placeholder;
    this.onChange = onChange;
    this.labelMap = labelMap;
    this.options = [];
    this.selected = new Set();
    this._render();
  }

  _render() {
    this.container.innerHTML = `
      <div class="ms-trigger">
        <span class="ms-label">${escHtml(this.placeholder)}</span>
        <i class="bi bi-chevron-down ms-arrow"></i>
      </div>
      <div class="ms-dropdown">
        <div class="ms-search-wrap"><input class="ms-search" type="text" placeholder="Buscar..."></div>
        <div class="ms-options-list"></div>
        <div class="ms-clear-row"><button class="ms-clear-btn">Limpiar selección</button></div>
      </div>`;

    this.trigger = this.container.querySelector('.ms-trigger');
    this.dropdown = this.container.querySelector('.ms-dropdown');
    this.searchInput = this.container.querySelector('.ms-search');
    this.optionsList = this.container.querySelector('.ms-options-list');

    this.trigger.addEventListener('click', e => { e.stopPropagation(); this._toggle(); });
    this.searchInput.addEventListener('input', () => this._filterOptions());
    this.container.querySelector('.ms-clear-btn').addEventListener('click', () => { this.clear(); this.onChange(); });

    document.addEventListener('click', e => {
      if (!this.container.contains(e.target)) this._close();
    });
  }

  setOptions(opts) {
    this.options = opts;
    this._renderOptions();
  }

  getValues() { return [...this.selected]; }

  clear() {
    this.selected.clear();
    this._renderOptions();
    this._updateLabel();
  }

  _toggle() {
    if (this.dropdown.classList.contains('open')) { this._close(); return; }
    document.querySelectorAll('.ms-dropdown.open').forEach(d => d.classList.remove('open'));
    this.dropdown.classList.add('open');
    this.searchInput.focus();
  }

  _close() {
    this.dropdown.classList.remove('open');
    this.searchInput.value = '';
    this._filterOptions();
  }

  _filterOptions() {
    const q = this.searchInput.value.toLowerCase();
    this.optionsList.querySelectorAll('.ms-option').forEach(el => {
      el.style.display = el.dataset.value.toLowerCase().includes(q) ? '' : 'none';
    });
  }

  _renderOptions() {
    this.optionsList.innerHTML = this.options.map(opt => {
      const label = (this.labelMap && this.labelMap[opt]) ? this.labelMap[opt] : opt;
      return `<label class="ms-option" data-value="${escHtml(opt)}">
        <input type="checkbox" value="${escHtml(opt)}" ${this.selected.has(opt) ? 'checked' : ''}>
        <span>${escHtml(label)}</span>
      </label>`;
    }).join('');

    this.optionsList.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) this.selected.add(cb.value);
        else this.selected.delete(cb.value);
        this._updateLabel();
        this.onChange();
      });
    });
  }

  _updateLabel() {
    const label = this.container.querySelector('.ms-label');
    if (this.selected.size === 0) {
      label.textContent = this.placeholder;
      this.trigger.classList.remove('has-selection');
    } else {
      label.textContent = `${this.selected.size} seleccionada${this.selected.size !== 1 ? 's' : ''}`;
      this.trigger.classList.add('has-selection');
    }
  }

  setValues(vals) {
    this.selected = new Set(vals);
    this._renderOptions();
    this._updateLabel();
  }
}

/* ─── Instancias de multiselect ──────────────────────────────────────────────── */
let msSource, msCepa, msPais, msProvincia, msZona;

/* ─── Navegación entre vistas ────────────────────────────────────────────────── */
document.querySelectorAll('[data-view]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    showView(el.dataset.view);
  });
});

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.querySelector('.sidebar-overlay').classList.toggle('open');
}
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-overlay').classList.remove('open');
}

function showView(view) {
  closeSidebar();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll('[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  if (view === 'dashboard') loadDashboard();
  if (view === 'consultor') checkApiStatus();
  if (view === 'historial') loadHistory();
  if (view === 'vistas') loadViews().then(() => renderSavedViews());
  if (view === 'favoritos') loadFavorites().then(() => renderFavorites());
  if (view === 'cotizador') { loadQuotes().then(() => renderSavedQuotes()); renderCotizador(); document.getElementById('q-cliente').value = activeQuote.cliente; document.getElementById('q-notas').value = activeQuote.notas; }
}

/* ─── Toast notifications ────────────────────────────────────────────────────── */
function showToast(msg, type = 'info', duration = 4000) {
  const icons = { success: 'bi-check-circle', error: 'bi-x-circle', info: 'bi-info-circle' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
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

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ─── Lista de vinos ─────────────────────────────────────────────────────────── */
function debouncedLoad() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadWines, 350);
}

async function loadWines() {
  const params = new URLSearchParams();
  const nombre = document.getElementById('f-nombre').value.trim();
  const minP   = document.getElementById('f-min').value;
  const maxP   = document.getElementById('f-max').value;

  if (nombre) params.set('nombre', nombre);
  if (minP)   params.set('min_price', minP);
  if (maxP)   params.set('max_price', maxP);

  const src  = msSource   ? msSource.getValues()   : [];
  const cepa = msCepa     ? msCepa.getValues()     : [];
  const pais = msPais     ? msPais.getValues()     : [];
  const prov = msProvincia? msProvincia.getValues(): [];
  const zona = msZona     ? msZona.getValues()     : [];

  if (src.length)  params.set('source',   src.join(','));
  if (cepa.length) params.set('cepa',     cepa.join(','));
  if (pais.length) params.set('pais',     pais.join(','));
  if (prov.length) params.set('provincia',prov.join(','));
  if (zona.length) params.set('zona',     zona.join(','));

  const minBot = document.getElementById('f-min-bot').value;
  if (minBot) params.set('min_unidades', minBot);

  params.set('sort', sortCol);
  params.set('dir', sortDir);

  try {
    const resp = await fetch(`/api/wines?${params}`);
    const wines = await resp.json();
    currentWines = wines;
    renderWines(wines);
    document.getElementById('results-count').textContent = `${wines.length} vino${wines.length !== 1 ? 's' : ''}`;
  } catch (err) {
    console.error('Error cargando vinos:', err);
  }
}

function marketIndicator(diff) {
  if (diff == null) return '—';
  let cls, label;
  if (diff < 0)        { cls = 'ind-red';    label = `▼ ${Math.abs(diff)}%`; }
  else if (diff < 10)  { cls = 'ind-yellow'; label = `▲ ${diff}%`; }
  else if (diff < 25)  { cls = 'ind-green';  label = `▲ ${diff}%`; }
  else                 { cls = 'ind-blue';   label = `▲ ${diff}%`; }
  return `<span class="market-ind ${cls}">${label}</span>`;
}

function mpFormat(n) {
  return (n != null && !isNaN(n)) ? '$ ' + Math.round(n).toLocaleString('es-AR') : '';
}

const _mpTimers = {};
const _mpDirty  = new Set();

async function saveMarketPrice(input) {
  const key = input.dataset.key;
  if (!key) return;
  clearTimeout(_mpTimers[key]);
  delete _mpTimers[key];
  const raw   = input.dataset.raw;
  const price = raw === '' || raw == null ? null : parseFloat(raw);
  try {
    await fetch('/api/market-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, price }),
    });
    _mpDirty.delete(key);
    input.classList.add('mp-saved');
    setTimeout(() => input.classList.remove('mp-saved'), 1200);
    const row = input.closest('tr');
    const w = currentWines.find(w => wineId(w) === key);
    if (w) {
      w.market_price = price;
      w.market_diff  = (price != null && w.precio != null && price > 0)
        ? Math.round((price - w.precio) / price * 100)
        : null;
      if (row) row.querySelector('.td-market-ind').innerHTML = marketIndicator(w.market_diff);
    }
  } catch {}
}

window.addEventListener('beforeunload', () => {
  document.querySelectorAll('.market-price-input').forEach(input => {
    const key = input.dataset.key;
    if (!key) return;
    clearTimeout(_mpTimers[key]);
    if (!_mpDirty.has(key)) return;
    const raw   = input.dataset.raw;
    const price = raw === '' || raw == null ? null : parseFloat(raw);
    navigator.sendBeacon('/api/market-price',
      new Blob([JSON.stringify({ key, price })], { type: 'application/json' }));
  });
});

function renderWines(wines) {
  const tbody = document.getElementById('wines-tbody');
  if (!wines.length) {
    tbody.innerHTML = `<tr><td colspan="13" style="padding:60px 20px;text-align:center;color:var(--text-muted)">
      <div><i class="bi bi-search" style="font-size:2rem;display:block;margin-bottom:10px;color:var(--gold)"></i>
      No hay vinos que coincidan con los filtros</div></td></tr>`;
    return;
  }
  tbody.innerHTML = wines.map((w, i) => {
    const starred = isFavorite(w);
    const key = wineId(w);
    return `<tr data-wine-key="${escHtml(key)}">
      <td class="nombre col-nombre">${escHtml(w.nombre || '—')}</td>
      <td class="col-bodega">${escHtml(w.bodega || '—')}</td>
      <td class="col-cepa">${w.cepa ? `<span style="background:#F3E8FF;color:#6B21A8;padding:2px 8px;border-radius:12px;font-size:0.78rem">${escHtml(w.cepa)}</span>` : '—'}</td>
      <td class="col-subzona" style="font-size:0.82rem;color:var(--text-muted)">${escHtml(w.subzona || '—')}</td>
      <td class="col-zona" style="font-size:0.82rem">${escHtml(w.zona || '—')}</td>
      <td class="col-provincia" style="font-size:0.82rem">${escHtml(w.provincia || '—')}</td>
      <td class="col-pais" style="font-size:0.82rem">${escHtml(w.pais || '—')}</td>
      <td class="precio col-precio">${formatPrice(w.precio)}</td>
      <td class="col-min_unidades" style="text-align:center;font-size:0.85rem">${w.min_unidades || 1}</td>
      <td class="col-source"><span class="badge-source badge-${w.source}">${SOURCE_LABELS[w.source] || w.source}</span></td>
      <td class="td-market col-market_price">
        <input class="market-price-input" type="text" inputmode="numeric" placeholder="—"
          data-key="${escHtml(key)}"
          data-raw="${w.market_price != null ? w.market_price : ''}"
          value="${w.market_price != null ? mpFormat(w.market_price) : ''}"
          title="Precio de mercado">
      </td>
      <td class="td-market-ind col-market_diff">${marketIndicator(w.market_diff)}</td>
      <td class="td-actions col-actions">
        <button class="btn-row-action btn-star${starred ? ' active' : ''}" data-idx="${i}" onclick="handleStarClick(this)" title="${starred ? 'Quitar de favoritos' : 'Agregar a favoritos'}">${starred ? '★' : '☆'}</button>
        <button class="btn-row-action btn-cart" data-idx="${i}" onclick="handleCartClick(this)" title="Agregar a cotización"><i class="bi bi-cart-plus"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function setSort(col) {
  if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortCol = col; sortDir = 'asc'; }
  document.querySelectorAll('.wine-table th.sortable').forEach(th => {
    th.classList.remove('sorted');
    th.querySelector('.sort-icon').textContent = '↕';
  });
  const th = document.getElementById(`th-${col}`);
  if (th) { th.classList.add('sorted'); th.querySelector('.sort-icon').textContent = sortDir === 'asc' ? '↑' : '↓'; }
  loadWines();
}

function clearFilters() {
  document.getElementById('f-nombre').value = '';
  document.getElementById('f-min').value = '';
  document.getElementById('f-max').value = '';
  document.getElementById('f-min-bot').value = '';
  [msSource, msCepa, msPais, msProvincia, msZona].forEach(ms => ms && ms.clear());
  loadWines();
}

/* ─── Opciones de filtros dinámicos ──────────────────────────────────────────── */
async function loadFilterOptions() {
  try {
    const resp = await fetch('/api/options');
    const opts = await resp.json();
    msCepa.setOptions(opts.cepas);
    msPais.setOptions(opts.paises);
    msProvincia.setOptions(opts.provincias);
    msZona.setOptions(opts.zonas);
    const sel = document.getElementById('f-min-bot');
    const current = sel.value;
    sel.innerHTML = '<option value="">Todas las cantidades</option>' +
      (opts.min_unidades || []).map(v => `<option value="${v}"${v == current ? ' selected' : ''}>${v} ${v === 1 ? 'botella' : 'botellas'}</option>`).join('');
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

/* ─── Vistas Guardadas ───────────────────────────────────────────────────────── */
let _views = [];

async function loadViews() {
  try {
    const resp = await fetch('/api/views');
    _views = await resp.json();
  } catch { _views = []; }
}

function getCurrentFilters() {
  return {
    nombre:   document.getElementById('f-nombre').value.trim(),
    min:      document.getElementById('f-min').value,
    max:      document.getElementById('f-max').value,
    source:   msSource    ? msSource.getValues()    : [],
    cepa:     msCepa      ? msCepa.getValues()      : [],
    pais:     msPais      ? msPais.getValues()       : [],
    provincia:msProvincia ? msProvincia.getValues()  : [],
    zona:     msZona      ? msZona.getValues()       : [],
  };
}

function applyFilters(f) {
  document.getElementById('f-nombre').value = f.nombre || '';
  document.getElementById('f-min').value    = f.min    || '';
  document.getElementById('f-max').value    = f.max    || '';
  if (msSource)    msSource.setValues(f.source    || []);
  if (msCepa)      msCepa.setValues(f.cepa        || []);
  if (msPais)      msPais.setValues(f.pais         || []);
  if (msProvincia) msProvincia.setValues(f.provincia || []);
  if (msZona)      msZona.setValues(f.zona         || []);
  loadWines();
}

async function promptSaveView() {
  const filters = getCurrentFilters();
  const hasFilters = filters.nombre || filters.min || filters.max ||
    filters.source.length || filters.cepa.length || filters.pais.length ||
    filters.provincia.length || filters.zona.length;
  if (!hasFilters) { showToast('No hay filtros activos para guardar', 'info'); return; }

  const name = prompt('Nombre para esta vista:');
  if (!name || !name.trim()) return;

  const view = { name: name.trim(), filters, createdAt: new Date().toISOString() };
  try {
    const resp = await fetch('/api/views', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(view) });
    const saved = await resp.json();
    _views.unshift(saved);
  } catch { _views.unshift({ id: Date.now(), ...view }); }
  showToast(`Vista "${name.trim()}" guardada`, 'success');
}

function applyView(id) {
  const view = _views.find(v => v.id === id);
  if (!view) return;
  applyFilters(view.filters);
  showView('lista');
  showToast(`Vista "${view.name}" aplicada`, 'success');
}

function deleteView(id) {
  _views = _views.filter(v => v.id !== id);
  renderSavedViews();
  showToast('Vista eliminada', 'info');
  fetch(`/api/views/${id}`, { method: 'DELETE' });
}

function renderSavedViews() {
  const views = _views;
  const list = document.getElementById('vistas-list');
  const empty = document.getElementById('vistas-empty');

  if (!views.length) {
    list.innerHTML = `<div class="vistas-empty" id="vistas-empty">
      <i class="bi bi-bookmark" style="font-size:2rem;color:var(--gold);display:block;margin-bottom:10px"></i>
      <p>No tenés vistas guardadas todavía.</p>
      <p style="font-size:0.83rem;color:var(--text-muted)">Configurá los filtros en "Lista de Vinos" y hacé clic en <strong>Guardar vista</strong>.</p>
    </div>`;
    return;
  }

  list.innerHTML = views.map(v => {
    const f = v.filters;
    const tags = [];
    if (f.source && f.source.length)    f.source.forEach(s => tags.push(`<span class="vista-tag tag-source">${escHtml(SOURCE_LABELS[s] || s)}</span>`));
    if (f.cepa && f.cepa.length)        f.cepa.forEach(c => tags.push(`<span class="vista-tag">${escHtml(c)}</span>`));
    if (f.pais && f.pais.length)        f.pais.forEach(p => tags.push(`<span class="vista-tag">${escHtml(p)}</span>`));
    if (f.provincia && f.provincia.length) f.provincia.forEach(p => tags.push(`<span class="vista-tag">${escHtml(p)}</span>`));
    if (f.zona && f.zona.length)        f.zona.forEach(z => tags.push(`<span class="vista-tag">${escHtml(z)}</span>`));
    if (f.nombre)  tags.push(`<span class="vista-tag">🔍 ${escHtml(f.nombre)}</span>`);
    if (f.min || f.max) {
      const rng = [f.min ? `$${f.min}` : '', f.max ? `$${f.max}` : ''].filter(Boolean).join(' – ');
      tags.push(`<span class="vista-tag tag-price">${escHtml(rng)}</span>`);
    }
    return `<div class="vista-card">
      <div class="vista-card-name"><i class="bi bi-bookmark-fill" style="color:var(--gold);margin-right:6px"></i>${escHtml(v.name)}</div>
      <div class="vista-card-tags">${tags.join('') || '<span style="color:var(--text-muted);font-size:0.8rem">Sin filtros</span>'}</div>
      <div class="vista-card-actions">
        <button class="btn-apply-vista" onclick="applyView(${v.id})"><i class="bi bi-play-fill"></i> Aplicar</button>
        <button class="btn-delete-vista" onclick="deleteView(${v.id})" title="Eliminar"><i class="bi bi-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

/* ─── Historial de cambios ───────────────────────────────────────────────────── */
async function loadHistory() {
  try {
    const resp = await fetch('/api/history');
    allHistory = await resp.json();
    renderHistory();
  } catch (err) {
    document.getElementById('historial-list').innerHTML = `<div class="historial-empty">Error cargando historial</div>`;
  }
}

function setHistorialFilter(type, btn) {
  historialFilter = type;
  document.querySelectorAll('.hf-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('historial-list');
  const items = historialFilter === 'all' ? allHistory : allHistory.filter(h => h.type === historialFilter);

  if (!items.length) {
    list.innerHTML = `<div class="historial-empty">
      ${allHistory.length === 0
        ? 'No hay historial todavía. Los cambios se registran al actualizar los datos de los proveedores.'
        : 'No hay eventos de este tipo.'}
    </div>`;
    return;
  }

  const typeIcon = { added: 'bi-plus-lg', removed: 'bi-dash-lg', price_change: 'bi-arrow-left-right' };
  const typeLabel = { added: 'Agregado', removed: 'Quitado', price_change: 'Precio' };

  // Agrupar por fecha
  const groups = {};
  items.forEach(h => {
    const d = new Date(h.date);
    const key = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(h);
  });

  list.innerHTML = Object.entries(groups).map(([date, group]) => {
    const rows = group.map(h => {
      const precioChange = h.type === 'price_change'
        ? `<div class="h-precio-change">
            <span class="h-precio-old">${formatPrice(h.precio_old)}</span>
            <i class="bi bi-arrow-right" style="font-size:0.75rem;color:var(--text-muted)"></i>
            <span class="h-precio-new"> ${formatPrice(h.precio_new)}</span>
            ${h.precio_old && h.precio_new ? `<span style="font-size:0.75rem;color:var(--text-muted);margin-left:6px">(${h.precio_new > h.precio_old ? '+' : ''}${Math.round((h.precio_new - h.precio_old) / h.precio_old * 100)}%)</span>` : ''}
           </div>`
        : h.precio != null ? `<div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px">${formatPrice(h.precio)}</div>` : '';

      return `<div class="historial-item">
        <div class="h-icon ${h.type}"><i class="bi ${typeIcon[h.type]}"></i></div>
        <div class="h-info">
          <div class="h-nombre">${escHtml(h.nombre || '—')}</div>
          <div class="h-sub">${[h.bodega, h.cepa].filter(Boolean).map(escHtml).join(' · ')}</div>
          ${precioChange}
        </div>
        <div class="h-badge">
          <div style="text-align:right"><span class="badge-source badge-${h.source}" style="font-size:0.7rem">${SOURCE_LABELS[h.source] || h.source}</span></div>
          <div class="h-time">${formatDate(h.date)}</div>
        </div>
      </div>`;
    }).join('');

    return `<div class="historial-group-date">${date}</div>${rows}`;
  }).join('');
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

  renderChart('chart-proveedores', 'doughnut', {
    labels: (s.por_proveedor || []).map(r => provLabels[r.source] || r.source),
    datasets: [{ data: (s.por_proveedor || []).map(r => r.cantidad), backgroundColor: colors }],
  }, { plugins: { legend: { position: 'bottom' } } });

  renderChart('chart-precios-prov', 'bar', {
    labels: (s.por_proveedor || []).map(r => provLabels[r.source] || r.source),
    datasets: [{ label: 'Precio promedio ($)', data: (s.por_proveedor || []).map(r => r.avg_precio), backgroundColor: colors }],
  }, { plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => '$' + v.toLocaleString('es-AR') } } } });

  const cepasData = s.por_cepa || [];
  renderChart('chart-cepas', 'bar', {
    labels: cepasData.map(r => r.cepa),
    datasets: [{ label: 'Cantidad', data: cepasData.map(r => r.cantidad), backgroundColor: '#7B1C2E' }],
  }, { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } });

  const preciosCepa = s.precio_por_cepa || [];
  renderChart('chart-precio-cepa', 'bar', {
    labels: preciosCepa.map(r => r.cepa),
    datasets: [{ label: 'Precio promedio', data: preciosCepa.map(r => r.avg_precio), backgroundColor: colors.map((c, i) => colors[i % colors.length]) }],
  }, { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: v => '$' + (v / 1000).toFixed(0) + 'k' } } } });

  const bodegasData = s.por_bodega || [];
  renderChart('chart-bodegas', 'bar', {
    labels: bodegasData.map(r => r.bodega),
    datasets: [{ label: 'Vinos', data: bodegasData.map(r => r.cantidad), backgroundColor: '#C9A870' }],
  }, { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } });

  const provinciasData = (s.por_provincia || []).filter(r => r.provincia);
  renderChart('chart-provincias', 'doughnut', {
    labels: provinciasData.map(r => r.provincia),
    datasets: [{ data: provinciasData.map(r => r.cantidad), backgroundColor: colors }],
  }, { plugins: { legend: { position: 'bottom' } } });

  renderMap(s.por_provincia || []);
}

function renderChart(canvasId, type, data, options = {}) {
  if (charts[canvasId]) { charts[canvasId].destroy(); }
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  charts[canvasId] = new Chart(ctx, {
    type,
    data,
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } }, ...options },
  });
}

/* ─── Mapa ───────────────────────────────────────────────────────────────────── */
function renderMap(provinciaData) {
  if (!map) {
    map = L.map('wine-map').setView([-34, -66], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
  }
  mapMarkers.forEach(m => m.remove());
  mapMarkers = [];
  const dataMap = {};
  provinciaData.forEach(r => { if (r.provincia) dataMap[r.provincia] = r.cantidad; });
  const maxCount = Math.max(...Object.values(dataMap), 1);
  Object.entries(WINE_REGIONS_COORDS).forEach(([region, coords]) => {
    const count = dataMap[region] || 0;
    const marker = L.circleMarker(coords, { radius: count ? 8 + (count / maxCount) * 30 : 6, fillColor: count ? '#7B1C2E' : '#ccc', fillOpacity: 0.75, color: 'white', weight: 2 });
    marker.bindPopup(`<strong>${region}</strong><br>${count} vino${count !== 1 ? 's' : ''}`);
    marker.addTo(map);
    mapMarkers.push(marker);
  });
}

/* ─── Chat IA ────────────────────────────────────────────────────────────────── */
async function checkApiStatus() {
  const warning = document.getElementById('api-warning');
  try {
    const resp = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '...', history: [] }) });
    const data = await resp.json();
    warning.style.display = data.error && data.error.includes('ANTHROPIC_API_KEY') ? 'block' : 'none';
  } catch { warning.style.display = 'none'; }
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
}

function addMessage(content, role) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `msg msg-${role}`;
  if (role === 'assistant') div.innerHTML = content.replace(/\n/g, '<br>');
  else div.textContent = content;
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
    const resp = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, history: chatHistory.slice(-10) }) });
    const data = await resp.json();
    typingDiv.remove();
    if (data.error) addMessage(data.error, 'error');
    else { addMessage(data.response, 'assistant'); chatHistory.push({ role: 'assistant', content: data.response }); }
  } catch (err) {
    typingDiv.remove();
    addMessage('Error de conexión: ' + err.message, 'error');
  } finally { btn.disabled = false; input.focus(); }
}

document.getElementById('chat-input').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

/* ─── Exportar ───────────────────────────────────────────────────────────────── */
function exportFilename(ext) {
  return `vinoapp_${new Date().toLocaleDateString('es-AR').replace(/\//g, '-')}.${ext}`;
}

function exportExcel() {
  if (!currentWines.length) { showToast('No hay vinos para exportar', 'info'); return; }
  const rows = currentWines.map(w => ({
    'Nombre': w.nombre || '', 'Bodega': w.bodega || '', 'Cepa': w.cepa || '',
    'Subzona': w.subzona || '', 'Zona': w.zona || '', 'Provincia': w.provincia || '',
    'País': w.pais || '', 'Precio ($)': w.precio ?? '', 'Mín. Unidades': w.min_unidades || 1,
    'Proveedor': SOURCE_LABELS[w.source] || w.source,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.min(40, Math.max(k.length + 2, ...rows.map(r => String(r[k]).length + 1))) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vinos');
  XLSX.writeFile(wb, exportFilename('xlsx'));
  showToast(`Excel exportado · ${currentWines.length} vinos`, 'success');
}

function exportPDF() {
  if (!currentWines.length) { showToast('No hay vinos para exportar', 'info'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const date = new Date().toLocaleDateString('es-AR');
  doc.setFontSize(16); doc.setTextColor(123, 28, 46);
  doc.text('Vinoapp — Lista de Precios', 14, 14);
  doc.setFontSize(9); doc.setTextColor(120, 106, 90);
  doc.text(`Exportado: ${date}   ·   ${currentWines.length} vinos`, 14, 21);
  doc.autoTable({
    startY: 26,
    head: [['Nombre', 'Bodega', 'Cepa', 'Zona', 'Provincia', 'Precio', 'Mín.', 'Proveedor']],
    body: currentWines.map(w => [w.nombre || '—', w.bodega || '—', w.cepa || '—', w.zona || '—', w.provincia || '—', w.precio != null ? '$' + Math.round(w.precio).toLocaleString('es-AR') : '—', w.min_unidades || 1, SOURCE_LABELS[w.source] || w.source]),
    headStyles: { fillColor: [123, 28, 46], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    alternateRowStyles: { fillColor: [253, 248, 243] },
    columnStyles: { 5: { halign: 'right' }, 6: { halign: 'center' } },
    margin: { left: 14, right: 14 },
  });
  doc.save(exportFilename('pdf'));
  showToast(`PDF exportado · ${currentWines.length} vinos`, 'success');
}

/* ─── Favoritos ──────────────────────────────────────────────────────────────── */
let _favorites = [];
let favFilters = { tag: 'all', sources: [], search: '', cepa: '' };
let favSort = null;
let favSortDir = 'asc';

async function loadFavorites() {
  try {
    const resp = await fetch('/api/favorites');
    _favorites = await resp.json();
  } catch { _favorites = []; }
}

function wineId(w) { return `${w.source}::${(w.nombre || '').toLowerCase()}`; }
function isFavorite(w) { return _favorites.some(f => f.wineId === wineId(w)); }

async function handleStarClick(btn) {
  const w = currentWines[parseInt(btn.dataset.idx)];
  if (!w) return;
  const added = await toggleFavorite(w);
  btn.classList.toggle('active', added);
  btn.textContent = added ? '★' : '☆';
  btn.title = added ? 'Quitar de favoritos' : 'Agregar a favoritos';
  showToast(added ? `★ ${w.nombre} guardado en favoritos` : `${w.nombre} quitado de favoritos`, added ? 'success' : 'info', 2000);
}

function handleCartClick(btn) {
  const w = currentWines[parseInt(btn.dataset.idx)];
  if (w) addToQuote(w);
}

async function toggleFavorite(w) {
  const id = wineId(w);
  const existing = _favorites.find(f => f.wineId === id);
  if (existing) {
    _favorites = _favorites.filter(f => f.wineId !== id);
    fetch(`/api/favorites/${existing.id}`, { method: 'DELETE' });
    return false;
  }
  const fav = {
    wineId: id,
    wine: { nombre: w.nombre, bodega: w.bodega, cepa: w.cepa, zona: w.zona, provincia: w.provincia, precio: w.precio, min_unidades: w.min_unidades, source: w.source },
    comment: '',
    tag: null,
    savedAt: new Date().toISOString(),
  };
  try {
    const resp = await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fav) });
    const saved = await resp.json();
    _favorites.unshift(saved);
  } catch { _favorites.unshift({ id: Date.now(), ...fav }); }
  return true;
}

function deleteFavorite(id) {
  _favorites = _favorites.filter(f => f.id !== id);
  renderFavorites();
  showToast('Quitado de favoritos', 'info', 2000);
  fetch(`/api/favorites/${id}`, { method: 'DELETE' });
}

function cycleFavTag(id) {
  const fav = _favorites.find(f => f.id === id);
  if (!fav) return;
  const cycle = [null, 'comprar', 'probar'];
  fav.tag = cycle[(cycle.indexOf(fav.tag) + 1) % cycle.length];
  renderFavorites();
  fetch(`/api/favorites/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag: fav.tag }) });
}

function saveFavComment(id, el) {
  const comment = el.textContent.trim();
  const fav = _favorites.find(f => f.id === id);
  if (fav) fav.comment = comment;
  fetch(`/api/favorites/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) });
}

function applyFavFilters(favs) {
  let r = favs;
  if (favFilters.tag !== 'all') r = r.filter(f => f.tag === favFilters.tag);
  if (favFilters.sources.length) r = r.filter(f => favFilters.sources.includes(f.wine.source));
  if (favFilters.cepa) r = r.filter(f => f.wine.cepa === favFilters.cepa);
  if (favFilters.search) {
    const q = favFilters.search.toLowerCase();
    r = r.filter(f => (f.wine.nombre || '').toLowerCase().includes(q) || (f.wine.bodega || '').toLowerCase().includes(q));
  }
  return r;
}

function setFavTagFilter(tag, btn) {
  favFilters.tag = tag;
  document.querySelectorAll('.fav-tag-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderFavorites();
}

function toggleFavSource(source, btn) {
  const idx = favFilters.sources.indexOf(source);
  if (idx >= 0) favFilters.sources.splice(idx, 1);
  else favFilters.sources.push(source);
  btn.classList.toggle('active', favFilters.sources.includes(source));
  renderFavorites();
}

function setFavSearch() {
  favFilters.search = document.getElementById('fav-f-search')?.value || '';
  renderFavorites();
}

function setFavCepa() {
  favFilters.cepa = document.getElementById('fav-f-cepa')?.value || '';
  renderFavorites();
}

function clearFavFilters() {
  favFilters = { tag: 'all', sources: [], search: '', cepa: '' };
  const s = document.getElementById('fav-f-search'); if (s) s.value = '';
  const c = document.getElementById('fav-f-cepa');  if (c) c.value = '';
  document.querySelectorAll('.fav-tag-filter-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.querySelectorAll('.fav-source-btn').forEach(b => b.classList.remove('active'));
  renderFavorites();
}

function populateFavCepaSelect() {
  const sel = document.getElementById('fav-f-cepa');
  if (!sel) return;
  const cepas = [...new Set(_favorites.map(f => f.wine.cepa).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todas las cepas</option>' +
    cepas.map(c => `<option value="${escHtml(c)}"${favFilters.cepa === c ? ' selected' : ''}>${escHtml(c)}</option>`).join('');
}

function setFavSort(col) {
  if (favSort === col) {
    favSortDir = favSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    favSort = col;
    favSortDir = 'asc';
  }
  renderFavorites();
}

function favSortIcon(col) {
  if (favSort !== col) return '<span class="fav-sort-icon">↕</span>';
  return `<span class="fav-sort-icon active">${favSortDir === 'asc' ? '↑' : '↓'}</span>`;
}

function addToQuoteFromFav(favId) {
  const fav = _favorites.find(f => f.id === favId);
  if (fav) { addToQuote(fav.wine); showView('cotizador'); }
}

function renderFavorites() {
  const favs = _favorites;
  populateFavCepaSelect();
  let filtered = applyFavFilters(favs);
  const isFiltered = filtered.length !== favs.length;
  const countEl = document.getElementById('fav-count');
  if (countEl) countEl.textContent = isFiltered
    ? `${filtered.length} de ${favs.length} vino${favs.length !== 1 ? 's' : ''}`
    : `${favs.length} vino${favs.length !== 1 ? 's' : ''}`;

  const dashboard = document.getElementById('fav-dashboard');
  if (dashboard) dashboard.style.display = favs.length ? '' : 'none';
  renderFavDashboard(filtered, favs);

  const list = document.getElementById('favoritos-list');
  if (!list) return;

  if (!filtered.length) {
    list.innerHTML = `<div class="favs-empty"><i class="bi bi-star"></i><p>${
      favs.length === 0
        ? 'No tenés favoritos todavía.<br><small style="opacity:0.7">Hacé clic en ☆ en la lista de vinos para agregar.</small>'
        : 'No hay favoritos con este filtro.'
    }</p></div>`;
    return;
  }

  if (favSort) {
    const dir = favSortDir === 'asc' ? 1 : -1;
    const getDiff = f => (f.wine.market_price != null && f.wine.precio != null && f.wine.market_price > 0)
      ? Math.round((f.wine.market_price - f.wine.precio) / f.wine.market_price * 100)
      : null;
    filtered = [...filtered].sort((a, b) => {
      const va = favSort === 'market_diff' ? getDiff(a) : a.wine[favSort];
      const vb = favSort === 'market_diff' ? getDiff(b) : b.wine[favSort];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb);
      return dir * String(va).localeCompare(String(vb), 'es');
    });
  }

  const s = col => `class="fav-th-sortable" onclick="setFavSort('${col}')"`;

  list.innerHTML = `<div class="fav-table-wrap"><table class="fav-table">
    <thead><tr>
      <th ${s('nombre')}>Nombre ${favSortIcon('nombre')}</th>
      <th ${s('bodega')}>Bodega ${favSortIcon('bodega')}</th>
      <th ${s('cepa')}>Cepa ${favSortIcon('cepa')}</th>
      <th>Proveedor</th>
      <th ${s('precio')} style="text-align:center">Precio ${favSortIcon('precio')}</th>
      <th ${s('market_price')} style="text-align:center">P. Mercado ${favSortIcon('market_price')}</th>
      <th ${s('market_diff')} style="text-align:center">Vs. Mercado ${favSortIcon('market_diff')}</th>
      <th ${s('min_unidades')} style="text-align:center">Mín. ${favSortIcon('min_unidades')}</th>
      <th>Nota</th>
      <th></th>
    </tr></thead>
    <tbody>${filtered.map(f => {
      const w = f.wine;
      const mDiff = (w.market_price != null && w.precio != null && w.market_price > 0)
        ? Math.round((w.market_price - w.precio) / w.market_price * 100)
        : null;
      return `<tr>
        <td class="fav-col-nombre">${escHtml(w.nombre || '—')}</td>
        <td class="fav-col-bodega">${escHtml(w.bodega || '—')}</td>
        <td>${escHtml(w.cepa || '—')}</td>
        <td><span class="badge-source badge-${w.source}">${SOURCE_LABELS[w.source] || w.source}</span></td>
        <td class="fav-col-precio">${formatPrice(w.precio)}</td>
        <td class="fav-col-precio">${w.market_price ? formatPrice(w.market_price) : '—'}</td>
        <td class="td-market-ind">${marketIndicator(mDiff)}</td>
        <td class="fav-col-min">${(w.min_unidades || 1) > 1 ? w.min_unidades : '—'}</td>
        <td><div class="fav-comment-inline" contenteditable="true" onblur="saveFavComment(${f.id}, this)">${escHtml(f.comment || '')}</div></td>
        <td class="fav-col-actions">
          <button class="btn-fav-action btn-fav-add-quote" onclick="addToQuoteFromFav(${f.id})" title="Agregar al cotizador"><i class="bi bi-cart-plus"></i></button>
          <button class="btn-fav-action btn-fav-delete" onclick="deleteFavorite(${f.id})" title="Quitar de favoritos"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function renderFavDashboard(favs, allFavs) {
  const wines = favs.map(f => f.wine);
  const withPrice = wines.filter(w => w.precio > 0);
  const avgPrice = withPrice.length ? withPrice.reduce((s, w) => s + w.precio, 0) / withPrice.length : 0;
  const bodegas = new Set(wines.map(w => w.bodega).filter(Boolean));
  const cepas = new Set(wines.map(w => w.cepa).filter(Boolean));

  const totalGasto    = favs.reduce((s, f) => s + (f.wine.precio || 0) * (f.wine.min_unidades || 1), 0);
  const totalUnidades = favs.reduce((s, f) => s + (f.wine.min_unidades || 1), 0);
  const isFiltered    = allFavs && favs.length !== allFavs.length;

  const elTotal   = document.getElementById('fd-total');
  const elAvg     = document.getElementById('fd-avg');
  const elBodegas = document.getElementById('fd-bodegas');
  const elCepas   = document.getElementById('fd-cepas');
  const elGasto   = document.getElementById('fd-total-gasto');
  const elUnits   = document.getElementById('fd-total-units');
  if (elTotal)   elTotal.textContent   = isFiltered ? `${favs.length}/${allFavs.length}` : favs.length;
  if (elAvg)     elAvg.textContent     = avgPrice ? '$' + Math.round(avgPrice).toLocaleString('es-AR') : '—';
  if (elBodegas) elBodegas.textContent = bodegas.size;
  if (elCepas)   elCepas.textContent   = cepas.size;
  if (elGasto)   elGasto.textContent   = totalGasto ? '$' + Math.round(totalGasto).toLocaleString('es-AR') : '—';
  if (elUnits)   elUnits.textContent   = `${totalUnidades} unidad${totalUnidades !== 1 ? 'es' : ''} en total`;

  if (!wines.length) return;

  const colors = ['#7B1C2E', '#C9A870', '#2563EB', '#16A34A', '#DC2626', '#9333EA'];
  const provLabels = { cepas_argentinas: 'Cepas Argentinas', mp_drinks: 'MP Drinks', rustico: 'Rústico' };

  const bySource = {};
  wines.forEach(w => { bySource[w.source] = (bySource[w.source] || []).concat(w); });
  const provKeys     = Object.keys(bySource);
  const provCounts   = provKeys.map(k => bySource[k].length);
  const provAvgPrice = provKeys.map(k => {
    const ww = bySource[k].filter(w => w.precio > 0);
    return ww.length ? Math.round(ww.reduce((s, w) => s + w.precio, 0) / ww.length) : 0;
  });

  renderChart('fav-chart-prov-pie', 'doughnut', {
    labels: provKeys.map(k => provLabels[k] || k),
    datasets: [{ data: provCounts, backgroundColor: colors }],
  }, { plugins: { legend: { position: 'bottom' } } });

  renderChart('fav-chart-prov-price', 'bar', {
    labels: provKeys.map(k => provLabels[k] || k),
    datasets: [{ label: 'Precio promedio ($)', data: provAvgPrice, backgroundColor: colors }],
  }, { plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => '$' + v.toLocaleString('es-AR') } } } });

  const bycepa = {};
  wines.forEach(w => { if (w.cepa) bycepa[w.cepa] = (bycepa[w.cepa] || 0) + 1; });
  const topCepas = Object.entries(bycepa).sort((a, b) => b[1] - a[1]).slice(0, 8);
  renderChart('fav-chart-cepas', 'bar', {
    labels: topCepas.map(([c]) => c),
    datasets: [{ label: 'Cantidad', data: topCepas.map(([, n]) => n), backgroundColor: '#7B1C2E' }],
  }, { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } });

  const bybodega = {};
  wines.forEach(w => { if (w.bodega) bybodega[w.bodega] = (bybodega[w.bodega] || 0) + 1; });
  const topBodegas = Object.entries(bybodega).sort((a, b) => b[1] - a[1]).slice(0, 8);
  renderChart('fav-chart-bodegas', 'bar', {
    labels: topBodegas.map(([b]) => b),
    datasets: [{ label: 'Vinos', data: topBodegas.map(([, n]) => n), backgroundColor: '#C9A870' }],
  }, { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } });
}

/* ─── Cotizador ──────────────────────────────────────────────────────────────── */
let _quotes = [];
let activeQuote = { cliente: '', notas: '', items: [] };

async function loadQuotes() {
  try {
    const resp = await fetch('/api/quotes');
    _quotes = await resp.json();
  } catch { _quotes = []; }
}

function addToQuote(w) {
  const id = wineId(w);
  if (activeQuote.items.find(i => i.wineId === id)) { showToast('Ya está en la cotización', 'info', 2000); return; }
  activeQuote.items.push({
    wineId: id,
    wine: { nombre: w.nombre, bodega: w.bodega, cepa: w.cepa, precio: w.precio, min_unidades: w.min_unidades, source: w.source },
    cantidad: w.min_unidades || 1,
    ttv: '',
    notas: '',
  });
  updateQuoteBadge();
  showToast(`${w.nombre} agregado a la cotización`, 'success', 2000);
}

function removeFromQuote(idx) {
  activeQuote.items.splice(idx, 1);
  updateQuoteBadge();
  renderCotizador();
}

function updateQuoteItemField(idx, field, val) {
  if (activeQuote.items[idx]) activeQuote.items[idx][field] = val;
  renderQuoteSummary();
}

function updateQuoteBadge() {
  const badge = document.getElementById('quote-badge');
  if (badge) badge.textContent = activeQuote.items.length || '';
}

function clearQuote() {
  if (activeQuote.items.length && !confirm('¿Limpiar la cotización actual?')) return;
  activeQuote = { cliente: '', notas: '', items: [] };
  const cl = document.getElementById('q-cliente'); if (cl) cl.value = '';
  const nt = document.getElementById('q-notas'); if (nt) nt.value = '';
  updateQuoteBadge();
  renderCotizador();
}

async function saveQuote() {
  if (!activeQuote.items.length) { showToast('La cotización está vacía', 'info'); return; }
  const cliente = (document.getElementById('q-cliente').value.trim()) || 'Sin nombre';
  const notas = document.getElementById('q-notas').value.trim();
  activeQuote.cliente = cliente;
  activeQuote.notas = notas;
  const quoteData = { ...activeQuote, items: activeQuote.items.map(i => ({ ...i })), savedAt: new Date().toISOString() };
  try {
    const resp = await fetch('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quoteData) });
    const saved = await resp.json();
    _quotes.unshift(saved);
    if (_quotes.length > 50) _quotes = _quotes.slice(0, 50);
  } catch { _quotes.unshift({ id: Date.now(), ...quoteData }); }
  showToast(`Cotización "${cliente}" guardada`, 'success');
  renderSavedQuotes();
}

function loadQuote(id) {
  const q = _quotes.find(q => q.id === id);
  if (!q) return;
  activeQuote = { cliente: q.cliente || '', notas: q.notas || '', items: q.items.map(i => ({ ...i })) };
  const cl = document.getElementById('q-cliente'); if (cl) cl.value = activeQuote.cliente;
  const nt = document.getElementById('q-notas'); if (nt) nt.value = activeQuote.notas;
  updateQuoteBadge();
  renderCotizador();
  showToast(`Cotización "${q.cliente}" cargada`, 'success');
}

function deleteQuote(id) {
  _quotes = _quotes.filter(q => q.id !== id);
  renderSavedQuotes();
  fetch(`/api/quotes/${id}`, { method: 'DELETE' });
}

function calcQuoteSummary() {
  let totalCosto = 0, totalVenta = 0, hasVenta = false;
  activeQuote.items.forEach(item => {
    const qty = parseInt(item.cantidad) || 0;
    const precio = item.wine.precio || 0;
    const ttv = parseFloat(item.ttv) || 0;
    totalCosto += precio * qty;
    if (ttv) { totalVenta += ttv * qty; hasVenta = true; }
  });
  return { totalCosto, totalVenta: hasVenta ? totalVenta : null };
}

function renderQuoteSummary() {
  const el = document.getElementById('quote-summary');
  if (!el) return;
  const { totalCosto, totalVenta } = calcQuoteSummary();
  const margen = totalVenta && totalCosto ? ((totalVenta - totalCosto) / totalCosto * 100).toFixed(1) : null;
  el.innerHTML = `
    <div class="qs-item"><span class="qs-label">Items</span><span class="qs-value">${activeQuote.items.length}</span></div>
    <div class="qs-sep"></div>
    <div class="qs-item"><span class="qs-label">Total costo</span><span class="qs-value">${formatPrice(totalCosto)}</span></div>
    ${totalVenta != null ? `
    <div class="qs-sep"></div>
    <div class="qs-item"><span class="qs-label">Total venta</span><span class="qs-value">${formatPrice(totalVenta)}</span></div>
    <div class="qs-sep"></div>
    <div class="qs-item"><span class="qs-label">Margen</span><span class="qs-value ${parseFloat(margen) > 0 ? 'green' : ''}">${margen}%</span></div>
    ` : ''}
  `;
}

function exportQuote() {
  if (!activeQuote.items.length) { showToast('La cotización está vacía', 'info'); return; }
  const cliente = document.getElementById('q-cliente').value.trim() || 'Sin nombre';
  const notas = document.getElementById('q-notas').value.trim();
  const date = new Date().toLocaleDateString('es-AR');
  let text = `COTIZACIÓN – ${cliente}\n${date}${notas ? '\n' + notas : ''}\n${'─'.repeat(40)}\n\n`;
  activeQuote.items.forEach((item, i) => {
    const w = item.wine;
    const qty = parseInt(item.cantidad) || 0;
    const ttv = parseFloat(item.ttv) || null;
    text += `${i + 1}. ${w.nombre || '—'}`;
    if (w.bodega) text += ` – ${w.bodega}`;
    text += `\n   Cantidad: ${qty} bot. | P. compra: ${formatPrice(w.precio)}`;
    if (ttv) text += ` | TTV: ${formatPrice(ttv)} | Total: ${formatPrice(ttv * qty)}`;
    if (item.notas) text += `\n   Notas: ${item.notas}`;
    text += '\n\n';
  });
  const { totalCosto, totalVenta } = calcQuoteSummary();
  text += `${'─'.repeat(40)}\nTotal costo: ${formatPrice(totalCosto)}`;
  if (totalVenta) text += ` | Total venta: ${formatPrice(totalVenta)}`;
  navigator.clipboard.writeText(text)
    .then(() => showToast('Cotización copiada al portapapeles', 'success'))
    .catch(() => showToast('No se pudo copiar', 'error'));
}

function renderCotizador() {
  const tbody = document.getElementById('quote-tbody');
  if (!tbody) return;
  if (!activeQuote.items.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="quote-empty"><i class="bi bi-cart" style="font-size:1.5rem;display:block;margin-bottom:8px;color:var(--gold)"></i>Agregá vinos desde la lista (🛒) o desde Favoritos</td></tr>`;
    renderQuoteSummary();
    renderSavedQuotes();
    return;
  }
  tbody.innerHTML = activeQuote.items.map((item, i) => {
    const w = item.wine;
    const qty = item.cantidad || 1;
    const ttv = item.ttv || '';
    const margen = ttv && w.precio ? ((ttv - w.precio) / w.precio * 100).toFixed(0) : null;
    const margenClass = margen > 0 ? 'positive' : margen < 0 ? 'negative' : '';
    return `<tr>
      <td class="qt-nombre">${escHtml(w.nombre || '—')}<div style="font-size:0.78rem;color:var(--text-muted)">${escHtml(w.bodega || '')}</div></td>
      <td><span class="badge-source badge-${w.source}">${SOURCE_LABELS[w.source] || w.source}</span></td>
      <td class="qt-price">${formatPrice(w.precio)}</td>
      <td><input class="qt-input" type="number" min="1" value="${qty}" style="width:65px" onchange="updateQuoteItemField(${i},'cantidad',+this.value);renderCotizador()"></td>
      <td><input class="qt-input" type="number" min="0" placeholder="TTV" value="${ttv}" style="width:90px" oninput="updateQuoteItemField(${i},'ttv',+this.value)"></td>
      <td class="qt-margin ${margenClass}">${margen != null ? margen + '%' : '—'}</td>
      <td><input class="qt-input qt-input-notes" type="text" placeholder="Notas..." value="${escHtml(item.notas || '')}" onchange="updateQuoteItemField(${i},'notas',this.value)"></td>
      <td><button class="btn-qt-remove" onclick="removeFromQuote(${i})">×</button></td>
    </tr>`;
  }).join('');
  renderQuoteSummary();
  renderSavedQuotes();
}

function renderSavedQuotes() {
  const el = document.getElementById('saved-quotes-list');
  if (!el) return;
  const quotes = _quotes;
  if (!quotes.length) { el.innerHTML = '<div class="saved-quotes-empty">No hay cotizaciones guardadas.</div>'; return; }
  el.innerHTML = quotes.map(q => {
    const items = q.items || [];
    const total = items.reduce((s, i) => s + (i.wine.precio || 0) * (parseInt(i.cantidad) || 1), 0);
    const date = new Date(q.savedAt).toLocaleDateString('es-AR');
    return `<div class="saved-quote-item">
      <div>
        <div class="sq-name">${escHtml(q.cliente || 'Sin nombre')}</div>
        <div class="sq-meta">${date} · ${items.length} vino${items.length !== 1 ? 's' : ''} · Costo: ${formatPrice(total)}</div>
      </div>
      <div class="sq-actions">
        <button class="btn-sq btn-sq-load" onclick="loadQuote(${q.id})"><i class="bi bi-upload"></i> Cargar</button>
        <button class="btn-sq btn-sq-del" onclick="deleteQuote(${q.id})"><i class="bi bi-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

/* ─── Columnas visibles ──────────────────────────────────────────────────────── */
const COL_CONFIG = [
  { key: 'bodega',       label: 'Bodega' },
  { key: 'cepa',         label: 'Cepa' },
  { key: 'subzona',      label: 'Subzona' },
  { key: 'zona',         label: 'Zona' },
  { key: 'provincia',    label: 'Provincia' },
  { key: 'pais',         label: 'País' },
  { key: 'min_unidades', label: 'Mín. Bot.' },
  { key: 'source',       label: 'Proveedor' },
  { key: 'market_price', label: 'P. Mercado' },
  { key: 'market_diff',  label: 'Vs. Mercado' },
];
const COLS_KEY = 'vinoapp_hidden_cols';
let hiddenCols = new Set(JSON.parse(localStorage.getItem(COLS_KEY) || '["subzona","pais"]'));

function applyColVisibility() {
  const table = document.querySelector('.wine-table');
  if (!table) return;
  COL_CONFIG.forEach(({ key }) => table.classList.toggle(`hide-col-${key}`, hiddenCols.has(key)));
}

function toggleColPanel(e) {
  e.stopPropagation();
  const panel = document.getElementById('col-panel');
  if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
  panel.innerHTML = COL_CONFIG.map(({ key, label }) => `
    <label class="col-panel-item">
      <input type="checkbox" ${hiddenCols.has(key) ? '' : 'checked'} onchange="toggleCol('${key}', this.checked)">
      <span>${label}</span>
    </label>`).join('') +
    `<div class="col-panel-footer">
      <button onclick="resetCols()">Restablecer</button>
    </div>`;
  panel.classList.add('open');
}

function toggleCol(key, visible) {
  if (visible) hiddenCols.delete(key);
  else hiddenCols.add(key);
  localStorage.setItem(COLS_KEY, JSON.stringify([...hiddenCols]));
  applyColVisibility();
}

function resetCols() {
  hiddenCols = new Set(['subzona', 'pais']);
  localStorage.setItem(COLS_KEY, JSON.stringify([...hiddenCols]));
  applyColVisibility();
  document.getElementById('col-panel').classList.remove('open');
}

document.addEventListener('click', e => {
  const panel = document.getElementById('col-panel');
  if (panel && !panel.contains(e.target) && e.target.id !== 'btn-col-toggle') {
    panel.classList.remove('open');
  }
});

/* ─── Migración desde localStorage ──────────────────────────────────────────── */
async function migrateFromLocalStorage() {
  const tryMigrate = async (lsKey, serverItems, postUrl, idField) => {
    let local;
    try { local = JSON.parse(localStorage.getItem(lsKey) || '[]'); } catch { return; }
    if (!local.length) return;

    const serverKeys = new Set(serverItems.map(i => i[idField]));
    const toMigrate = local.filter(item => !serverKeys.has(item[idField]));

    for (const item of toMigrate) {
      try {
        const { id: _drop, ...data } = item;
        const resp = await fetch(postUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const saved = await resp.json();
        serverItems.unshift(saved);
      } catch {}
    }
    localStorage.removeItem(lsKey);
  };

  await tryMigrate('vinoapp_favorites',    _favorites, '/api/favorites', 'wineId');
  await tryMigrate('vinoapp_saved_views',  _views,     '/api/views',     'name');
  await tryMigrate('vinoapp_quotes',       _quotes,    '/api/quotes',    'savedAt');
}

/* ─── Init ───────────────────────────────────────────────────────────────────── */
async function init() {
  msSource    = new MultiSelect('ms-source',    'Todos los proveedores', debouncedLoad, SOURCE_LABELS);
  msCepa      = new MultiSelect('ms-cepa',      'Todas las cepas',       debouncedLoad);
  msPais      = new MultiSelect('ms-pais',      'Todos los países',      debouncedLoad);
  msProvincia = new MultiSelect('ms-provincia', 'Todas las provincias',  debouncedLoad);
  msZona      = new MultiSelect('ms-zona',      'Todas las zonas',       debouncedLoad);

  msSource.setOptions(['cepas_argentinas', 'mp_drinks', 'rustico']);
  applyColVisibility();

  const winesTbody = document.getElementById('wines-tbody');
  winesTbody.addEventListener('focusin', e => {
    if (!e.target.classList.contains('market-price-input')) return;
    const input = e.target;
    input.value = input.dataset.raw || '';
    input.select();
  });
  winesTbody.addEventListener('input', e => {
    if (!e.target.classList.contains('market-price-input')) return;
    const input = e.target;
    const key   = input.dataset.key;
    if (!key) return;
    input.dataset.raw = input.value.replace(/[^\d.]/g, '');
    _mpDirty.add(key);
    clearTimeout(_mpTimers[key]);
    _mpTimers[key] = setTimeout(() => saveMarketPrice(input), 800);
  });
  winesTbody.addEventListener('focusout', e => {
    if (!e.target.classList.contains('market-price-input')) return;
    const input = e.target;
    const key   = input.dataset.key;
    if (!key) return;
    const n     = input.dataset.raw === '' ? null : parseFloat(input.dataset.raw);
    input.value = mpFormat(n) || '';
    saveMarketPrice(input);
  });

  await Promise.all([loadWines(), loadStatus(), loadFilterOptions(), loadFavorites(), loadViews(), loadQuotes()]);
  await migrateFromLocalStorage();
}

init();

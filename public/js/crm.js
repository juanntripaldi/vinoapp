/* ═══════════════════════════════════════════════════════════════════════════════
   crm.js — Módulo Clientes + Pedidos
   ═══════════════════════════════════════════════════════════════════════════════ */

/* ─── Estado ─────────────────────────────────────────────────────────────────── */
let _clients = [];
let _orders  = [];

let activePedido = {
  cliente_id: null, cliente_nombre: '', fecha: _todayDate(),
  estado: 'confirmado', notas: '', items: [],
};

let _clienteSearch = '';
let _clientDetailId = null;
let _editClienteId  = null;
let _editOrderId    = null;
let _modalPedido    = null;
let _pedidoWineTimer = null;
let _pedidoWineResults = [];
let _pendingClientCallback = null;
let _importRows = [];

const ESTADO_MAP = {
  borrador:   { label: 'Borrador',   cls: 'estado-borrador'   },
  confirmado: { label: 'Confirmado', cls: 'estado-confirmado' },
  entregado:  { label: 'Entregado',  cls: 'estado-entregado'  },
  cancelado:  { label: 'Cancelado',  cls: 'estado-cancelado'  },
};

/* ─── Utilities ──────────────────────────────────────────────────────────────── */
function _todayDate() {
  return new Date().toISOString().split('T')[0];
}

function _fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

function _estadoBadge(e) {
  const m = ESTADO_MAP[e] || { label: e || '—', cls: '' };
  return `<span class="estado-badge ${m.cls}">${escHtml(m.label)}</span>`;
}

function _pedidoRunningTotal() {
  return activePedido.items.reduce((s, i) => s + (i.precio_unitario || 0) * (i.cantidad || 0), 0);
}

/* ─── API Clientes ───────────────────────────────────────────────────────────── */
async function loadClients() {
  try { _clients = await (await fetch('/api/clients')).json(); }
  catch { _clients = []; }
}

async function _apiAddClient(data) {
  const r = await fetch('/api/clients', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function _apiUpdateClient(id, fields) {
  await fetch(`/api/clients/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
  });
  const c = _clients.find(c => c.id === id);
  if (c) Object.assign(c, fields);
}

async function _apiDeleteClient(id) {
  await fetch(`/api/clients/${id}`, { method: 'DELETE' });
  _clients = _clients.filter(c => c.id !== id);
}

/* ─── API Pedidos ────────────────────────────────────────────────────────────── */
async function loadOrders() {
  try { _orders = await (await fetch('/api/orders')).json(); }
  catch { _orders = []; }
}

async function _apiAddOrder(data) {
  const r = await fetch('/api/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  const saved = await r.json();
  _orders.unshift(saved);
  return saved;
}

async function _apiUpdateOrder(id, fields) {
  await fetch(`/api/orders/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
  });
  const o = _orders.find(o => o.id === id);
  if (o) Object.assign(o, fields);
}

async function _apiDeleteOrder(id) {
  await fetch(`/api/orders/${id}`, { method: 'DELETE' });
  _orders = _orders.filter(o => o.id !== id);
}

/* ─── Active Pedido (carrito) ────────────────────────────────────────────────── */
function addToPedido(wine) {
  const id = wineId(wine);
  const existing = activePedido.items.find(i => i.wine_id === id);
  if (existing) {
    existing.cantidad += wine.min_unidades || 1;
  } else {
    activePedido.items.push({
      wine_id: id,
      nombre: wine.nombre || '—',
      bodega: wine.bodega || null,
      cepa: wine.cepa || null,
      source: wine.source,
      precio_unitario: wine.precio || 0,
      cantidad: wine.min_unidades || 1,
    });
  }
  updatePedidoBadge();
  const n = activePedido.items.length;
  showToast(`📦 ${wine.nombre} → Pedido (${n} ítem${n !== 1 ? 's' : ''})`, 'success', 2000);
}

function updatePedidoBadge() {
  const b = document.getElementById('pedido-badge');
  if (b) b.textContent = activePedido.items.length || '';
}

function clearActivePedido() {
  if (activePedido.items.length && !confirm('¿Limpiar el pedido en curso?')) return;
  activePedido = { cliente_id: null, cliente_nombre: '', fecha: _todayDate(), estado: 'confirmado', notas: '', items: [] };
  updatePedidoBadge();
  renderActivePedidoBanner();
}

/* ─── Vista: Clientes ────────────────────────────────────────────────────────── */
function renderClientes() {
  const q = _clienteSearch.toLowerCase();
  const filtered = q
    ? _clients.filter(c =>
        (c.nombre || '').toLowerCase().includes(q) ||
        (c.codigo || '').toLowerCase().includes(q) ||
        (c.telefono || '').includes(q))
    : _clients;

  const countEl = document.getElementById('clientes-count');
  if (countEl) countEl.textContent = filtered.length !== _clients.length
    ? `${filtered.length} de ${_clients.length} clientes`
    : `${_clients.length} cliente${_clients.length !== 1 ? 's' : ''}`;

  const grid = document.getElementById('clientes-grid');
  if (!grid) return;

  if (!filtered.length) {
    grid.innerHTML = `<div class="crm-empty"><i class="bi bi-people"></i><p>${
      _clients.length === 0
        ? 'No hay clientes todavía.<br><small>Creá el primero con el botón + Nuevo Cliente.</small>'
        : 'No hay clientes con ese filtro.'
    }</p></div>`;
    return;
  }

  grid.innerHTML = filtered.map(c => {
    const co = _orders.filter(o => o.cliente_id === c.id);
    const lastOrder = co[0];
    const totalGasto = co.reduce((s, o) => s + (o.total || 0), 0);
    return `<div class="client-card" onclick="openClientDetail(${c.id})">
      <div class="client-card-header">
        <div class="client-avatar">${escHtml((c.nombre || '?')[0].toUpperCase())}</div>
        <div class="client-card-info-name">
          <div class="client-name">${escHtml(c.nombre)}</div>
          <div class="client-code">${escHtml(c.codigo || '—')}</div>
        </div>
        <div class="client-card-actions">
          <button class="btn-card-action" onclick="event.stopPropagation();openClienteModal(${c.id})" title="Editar"><i class="bi bi-pencil"></i></button>
          <button class="btn-card-action btn-card-del" onclick="event.stopPropagation();confirmDeleteCliente(${c.id})" title="Eliminar"><i class="bi bi-trash"></i></button>
        </div>
      </div>
      <div class="client-card-contact">
        ${c.telefono ? `<span><i class="bi bi-telephone"></i> ${escHtml(c.telefono)}</span>` : ''}
        ${c.email    ? `<span><i class="bi bi-envelope"></i> ${escHtml(c.email)}</span>`    : ''}
      </div>
      <div class="client-card-stats">
        <span class="ccs-item"><strong>${co.length}</strong> pedido${co.length !== 1 ? 's' : ''}</span>
        <span class="ccs-sep">·</span>
        <span class="ccs-item"><strong>${formatPrice(totalGasto)}</strong></span>
        ${lastOrder ? `<span class="ccs-sep">·</span><span class="ccs-item">Últ. ${_fmtDate(lastOrder.fecha)}</span>` : ''}
      </div>
      ${c.notas ? `<div class="client-card-notes">${escHtml(c.notas.slice(0, 80))}${c.notas.length > 80 ? '…' : ''}</div>` : ''}
    </div>`;
  }).join('');
}

/* ─── Modal: Cliente ─────────────────────────────────────────────────────────── */
function openClienteModal(id = null, prefillNombre = '') {
  _editClienteId = id || null;
  const modal = document.getElementById('modal-cliente');
  document.getElementById('modal-cliente-title').textContent = id ? 'Editar Cliente' : 'Nuevo Cliente';

  const fields = ['cl-nombre', 'cl-codigo', 'cl-telefono', 'cl-email', 'cl-direccion', 'cl-notas'];
  if (id) {
    const c = _clients.find(c => c.id === id);
    if (!c) return;
    document.getElementById('cl-nombre').value    = c.nombre    || '';
    document.getElementById('cl-codigo').value    = c.codigo    || '';
    document.getElementById('cl-telefono').value  = c.telefono  || '';
    document.getElementById('cl-email').value     = c.email     || '';
    document.getElementById('cl-direccion').value = c.direccion || '';
    document.getElementById('cl-notas').value     = c.notas     || '';
  } else {
    fields.forEach(f => { document.getElementById(f).value = ''; });
    if (prefillNombre) document.getElementById('cl-nombre').value = prefillNombre;
  }
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('cl-nombre').focus(), 50);
}

function closeClienteModal() {
  document.getElementById('modal-cliente').style.display = 'none';
  _pendingClientCallback = null;
}

async function saveClienteModal() {
  const nombre = document.getElementById('cl-nombre').value.trim();
  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }

  const data = {
    nombre,
    codigo:    document.getElementById('cl-codigo').value.trim()    || null,
    telefono:  document.getElementById('cl-telefono').value.trim()  || null,
    email:     document.getElementById('cl-email').value.trim()     || null,
    direccion: document.getElementById('cl-direccion').value.trim() || null,
    notas:     document.getElementById('cl-notas').value.trim()     || null,
  };

  try {
    let saved;
    if (_editClienteId) {
      await _apiUpdateClient(_editClienteId, data);
      saved = _clients.find(c => c.id === _editClienteId);
      showToast('Cliente actualizado', 'success');
    } else {
      saved = await _apiAddClient(data);
      _clients.unshift(saved);
      _clients.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
      showToast(`Cliente "${saved.nombre}" creado`, 'success');
    }
    closeClienteModal();
    if (_pendingClientCallback && saved) {
      _pendingClientCallback(saved);
      _pendingClientCallback = null;
    }
    renderClientes();
    if (_clientDetailId) renderClientDetail();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function confirmDeleteCliente(id) {
  const c = _clients.find(c => c.id === id);
  if (!c) return;
  const co = _orders.filter(o => o.cliente_id === id);
  const msg = co.length
    ? `¿Eliminar "${c.nombre}"? Tiene ${co.length} pedido${co.length !== 1 ? 's' : ''} registrado${co.length !== 1 ? 's' : ''}.`
    : `¿Eliminar "${c.nombre}"?`;
  if (!confirm(msg)) return;
  await _apiDeleteClient(id);
  if (_clientDetailId === id) closeClientDetail();
  renderClientes();
  showToast('Cliente eliminado', 'info');
}

/* ─── Panel: Detalle de cliente ──────────────────────────────────────────────── */
function openClientDetail(id) {
  _clientDetailId = id;
  renderClientDetail();
  document.getElementById('panel-cliente').classList.add('open');
  document.getElementById('panel-overlay').classList.add('open');
}

function closeClientDetail() {
  document.getElementById('panel-cliente').classList.remove('open');
  document.getElementById('panel-overlay').classList.remove('open');
  _clientDetailId = null;
}

function renderClientDetail() {
  if (!_clientDetailId) return;
  const c = _clients.find(c => c.id === _clientDetailId);
  if (!c) return;

  const co = _orders
    .filter(o => o.cliente_id === c.id)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const totalGasto    = co.reduce((s, o) => s + (o.total || 0), 0);
  const totalVenta    = co.reduce((s, o) => s + (o.total_venta != null ? o.total_venta : (o.total || 0)), 0);
  const totalGanancia = co.reduce((s, o) => s + (o.total_venta != null ? o.total_venta - o.total : 0), 0);
  const avgTicket     = co.length ? totalGasto / co.length : 0;
  const confirmados   = co.filter(o => o.estado === 'confirmado' || o.estado === 'entregado').length;

  const cepaCounts = {};
  co.forEach(o => (o.items || []).forEach(i => {
    if (i.cepa) cepaCounts[i.cepa] = (cepaCounts[i.cepa] || 0) + (i.cantidad || 0);
  }));
  const topCepas = Object.entries(cepaCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  document.getElementById('panel-cliente-content').innerHTML = `
    <div class="panel-client-header">
      <div class="panel-avatar">${escHtml((c.nombre || '?')[0].toUpperCase())}</div>
      <div class="panel-client-meta">
        <div class="panel-client-name">${escHtml(c.nombre)}</div>
        <div class="panel-client-code">${escHtml(c.codigo || '')}</div>
      </div>
      <div class="panel-client-actions">
        <button class="btn-panel-edit" onclick="openClienteModal(${c.id})"><i class="bi bi-pencil"></i> Editar</button>
        <button class="btn-panel-order" onclick="openPedidoModal(null,${c.id})"><i class="bi bi-plus"></i> Nuevo pedido</button>
      </div>
    </div>
    <div class="panel-client-info">
      ${c.telefono ? `<div><i class="bi bi-telephone"></i> ${escHtml(c.telefono)}</div>` : ''}
      ${c.email    ? `<div><i class="bi bi-envelope"></i> ${escHtml(c.email)}</div>`    : ''}
      ${c.direccion? `<div><i class="bi bi-geo-alt"></i> ${escHtml(c.direccion)}</div>` : ''}
      ${c.notas    ? `<div class="panel-notes"><i class="bi bi-chat-left-text"></i> ${escHtml(c.notas)}</div>` : ''}
    </div>
    <div class="panel-stats-grid">
      <div class="panel-stat"><div class="ps-value">${co.length}</div><div class="ps-label">Pedidos</div></div>
      <div class="panel-stat"><div class="ps-value">${confirmados}</div><div class="ps-label">Confirmados</div></div>
      <div class="panel-stat"><div class="ps-value">${formatPrice(totalGasto)}</div><div class="ps-label">Costo total</div></div>
      <div class="panel-stat"><div class="ps-value">${formatPrice(avgTicket)}</div><div class="ps-label">Ticket prom.</div></div>
      ${totalGanancia > 0 ? `<div class="panel-stat"><div class="ps-value gan-pos">${formatPrice(totalVenta)}</div><div class="ps-label">Facturado</div></div>` : ''}
      ${totalGanancia > 0 ? `<div class="panel-stat"><div class="ps-value gan-pos">${formatPrice(totalGanancia)}</div><div class="ps-label">Ganancia total</div></div>` : ''}
    </div>
    ${topCepas.length ? `
      <div class="panel-section-title">Cepas preferidas</div>
      <div class="panel-cepas">${topCepas.map(([cepa, n]) =>
        `<span class="panel-cepa-chip">${escHtml(cepa)} <strong>${n}</strong> bot.</span>`).join('')}
      </div>` : ''}
    <div class="panel-section-title">Historial de pedidos</div>
    ${co.length === 0
      ? '<div class="panel-no-orders">Sin pedidos todavía</div>'
      : co.map(o => {
          const gan = o.total_venta != null ? o.total_venta - o.total : null;
          const ganTxt = gan != null ? `<span class="por-gan ${gan >= 0 ? 'gan-pos' : 'gan-neg'}">+${formatPrice(gan)}</span>` : '';
          return `
        <div class="panel-order-row" onclick="openPedidoModal(${o.id})">
          <div class="por-left">
            <span class="por-num">#${o.numero}</span>
            <span class="por-date">${_fmtDate(o.fecha)}</span>
            ${_estadoBadge(o.estado)}
          </div>
          <div class="por-right">
            <span class="por-items">${(o.items || []).length} ítem${(o.items || []).length !== 1 ? 's' : ''}</span>
            <span class="por-total">${formatPrice(o.total)}</span>
            ${ganTxt}
          </div>
        </div>`;}).join('')
    }
  `;
}

/* ─── Vista: Pedidos ─────────────────────────────────────────────────────────── */
function renderPedidos() {
  renderActivePedidoBanner();
  renderOrdersList();
}

function renderActivePedidoBanner() {
  const banner = document.getElementById('active-pedido-banner');
  if (!banner) return;
  if (!activePedido.items.length) { banner.style.display = 'none'; return; }
  banner.style.display = '';
  banner.innerHTML = `
    <div class="apb-info">
      <i class="bi bi-cart-fill"></i>
      <span><strong>Pedido en curso:</strong> ${activePedido.items.length} ítem${activePedido.items.length !== 1 ? 's' : ''} · ${formatPrice(_pedidoRunningTotal())}</span>
    </div>
    <div class="apb-actions">
      <button class="btn-apb-edit" onclick="openPedidoModal(null,null,true)"><i class="bi bi-pencil"></i> Editar y confirmar</button>
      <button class="btn-apb-clear" onclick="clearActivePedido()" title="Limpiar pedido"><i class="bi bi-x-lg"></i></button>
    </div>`;
}

function renderOrdersList() {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;

  let list = [..._orders];
  const fCliente = (document.getElementById('filter-order-cliente')?.value || '').toLowerCase();
  const fEstado  = document.getElementById('filter-order-estado')?.value  || '';
  const fDesde   = document.getElementById('filter-order-desde')?.value   || '';
  const fHasta   = document.getElementById('filter-order-hasta')?.value   || '';

  if (fCliente) list = list.filter(o => (o.cliente_nombre || '').toLowerCase().includes(fCliente));
  if (fEstado)  list = list.filter(o => o.estado === fEstado);
  if (fDesde)   list = list.filter(o => String(o.fecha) >= fDesde);
  if (fHasta)   list = list.filter(o => String(o.fecha) <= fHasta);

  const countEl = document.getElementById('orders-count');
  if (countEl) countEl.textContent = `${list.length} pedido${list.length !== 1 ? 's' : ''}`;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="orders-empty">
      <i class="bi bi-clipboard" style="font-size:2rem;display:block;margin-bottom:10px;color:var(--gold)"></i>
      ${_orders.length === 0
        ? 'No hay pedidos todavía.<br><small>Creá el primero con "+ Nuevo pedido".</small>'
        : 'No hay pedidos con esos filtros.'}
    </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(o => {
    const ganancia = o.total_venta != null ? o.total_venta - o.total : null;
    const margen   = ganancia != null && o.total_venta > 0
      ? ((ganancia / o.total_venta) * 100).toFixed(0) + '%' : null;
    const ganCls   = ganancia == null ? '' : ganancia >= 0 ? 'gan-pos' : 'gan-neg';
    const ganHtml  = ganancia != null
      ? `<span class="${ganCls}">${formatPrice(ganancia)}</span><small class="${ganCls}"> ${margen}</small>`
      : '<span class="gan-na">—</span>';
    return `
    <tr class="order-row" onclick="openPedidoModal(${o.id})">
      <td class="td-num">#${o.numero}</td>
      <td class="td-fecha">${_fmtDate(o.fecha)}</td>
      <td class="td-cliente">${escHtml(o.cliente_nombre || '—')}</td>
      <td>${_estadoBadge(o.estado)}</td>
      <td class="td-items">${(o.items || []).length} ítem${(o.items || []).length !== 1 ? 's' : ''}</td>
      <td class="td-total">${formatPrice(o.total)}</td>
      <td class="td-gan">${ganHtml}</td>
      <td class="td-order-actions" onclick="event.stopPropagation()">
        <button class="btn-order-action" onclick="openPedidoModal(${o.id})" title="Editar"><i class="bi bi-pencil"></i></button>
        <button class="btn-order-action btn-order-del" onclick="confirmDeleteOrder(${o.id})" title="Eliminar"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

async function confirmDeleteOrder(id) {
  const o = _orders.find(o => o.id === id);
  if (!o || !confirm(`¿Eliminar pedido #${o.numero}?`)) return;
  await _apiDeleteOrder(id);
  renderPedidos();
  showToast('Pedido eliminado', 'info');
}

/* ─── Modal: Pedido ──────────────────────────────────────────────────────────── */
function openPedidoModal(orderId = null, presetClienteId = null, fromActive = false) {
  _editOrderId = orderId || null;
  const modal = document.getElementById('modal-pedido');
  const title = document.getElementById('modal-pedido-title');

  document.getElementById('pedido-wine-q').value = '';
  document.getElementById('pedido-wine-results').innerHTML = '';
  _pedidoWineResults = [];

  if (orderId) {
    const o = _orders.find(o => o.id === orderId);
    if (!o) return;
    title.textContent = `Pedido #${o.numero}`;
    _modalPedido = { cliente_id: o.cliente_id, cliente_nombre: o.cliente_nombre || '', fecha: o.fecha, estado: o.estado, notas: o.notas || '', items: o.items.map(i => ({ ...i })) };
  } else if (fromActive) {
    title.textContent = 'Confirmar Pedido';
    _modalPedido = { ...activePedido, items: activePedido.items.map(i => ({ ...i })) };
  } else {
    title.textContent = 'Nuevo Pedido';
    const preCliente = presetClienteId ? _clients.find(c => c.id === presetClienteId) : null;
    _modalPedido = { cliente_id: presetClienteId || null, cliente_nombre: preCliente?.nombre || '', fecha: _todayDate(), estado: 'confirmado', notas: '', items: [] };
  }

  document.getElementById('pedido-fecha').value  = _modalPedido.fecha;
  document.getElementById('pedido-estado').value = _modalPedido.estado;
  document.getElementById('pedido-notas').value  = _modalPedido.notas;
  const tvInput = document.getElementById('pedido-total-venta');
  if (tvInput) tvInput.value = _modalPedido.total_venta != null ? _modalPedido.total_venta : '';
  _setModalClient(_modalPedido.cliente_id, _modalPedido.cliente_nombre);
  renderPedidoModalItems();
  renderPedidoVentaGanancia();
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('pedido-wine-q').focus(), 50);
}

function _setModalClient(id, nombre) {
  const search = document.getElementById('pedido-cliente-search');
  const chip   = document.getElementById('pedido-client-chip');
  if (id) {
    search.value = '';
    search.style.display = 'none';
    chip.style.display = 'flex';
    chip.innerHTML = `<span>${escHtml(nombre)}</span><button class="chip-remove" onclick="clearModalClient()">×</button>`;
  } else {
    search.value = nombre || '';
    search.style.display = '';
    chip.style.display = 'none';
    chip.innerHTML = '';
  }
  if (_modalPedido) { _modalPedido.cliente_id = id; _modalPedido.cliente_nombre = nombre; }
}

function clearModalClient() {
  _setModalClient(null, '');
  document.getElementById('pedido-client-dropdown').style.display = 'none';
  document.getElementById('pedido-cliente-search').focus();
}

function pedidoClientSearch(val) {
  const dropdown = document.getElementById('pedido-client-dropdown');
  if (!val.trim()) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }
  const q = val.toLowerCase();
  const matches = _clients.filter(c =>
    (c.nombre || '').toLowerCase().includes(q) || (c.codigo || '').toLowerCase().includes(q)
  ).slice(0, 8);

  const newItem = `<div class="pcd-item pcd-new" onclick="openClienteModalInline('${escHtml(val).replace(/'/g, "\\'")}')">
    <i class="bi bi-plus-circle"></i> Crear "${escHtml(val)}"</div>`;

  dropdown.innerHTML = (matches.length
    ? matches.map(c => `<div class="pcd-item" onclick="selectModalClient(${c.id},'${escHtml(c.nombre).replace(/'/g, "\\'")}')">
        <strong>${escHtml(c.nombre)}</strong><span class="pcd-code">${escHtml(c.codigo || '')}</span>
      </div>`).join('') + newItem
    : newItem);
  dropdown.style.display = '';
}

function selectModalClient(id, nombre) {
  _setModalClient(id, nombre);
  document.getElementById('pedido-client-dropdown').style.display = 'none';
}

function openClienteModalInline(prefill) {
  document.getElementById('pedido-client-dropdown').style.display = 'none';
  _pendingClientCallback = saved => {
    if (!_clients.find(c => c.id === saved.id)) _clients.unshift(saved);
    _clients.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
    selectModalClient(saved.id, saved.nombre);
  };
  openClienteModal(null, prefill);
}

function pedidoWineSearch(val) {
  clearTimeout(_pedidoWineTimer);
  const results = document.getElementById('pedido-wine-results');
  if (!val.trim()) { results.innerHTML = ''; return; }
  _pedidoWineTimer = setTimeout(async () => {
    try {
      const p = new URLSearchParams({ nombre: val, sort: 'nombre', dir: 'asc' });
      _pedidoWineResults = (await (await fetch(`/api/wines?${p}`)).json()).slice(0, 12);
      results.innerHTML = _pedidoWineResults.length
        ? _pedidoWineResults.map((w, i) => `
            <div class="pwr-item" onclick="addWineToPedidoModal(${i})">
              <div>
                <div class="pwr-name">${escHtml(w.nombre || '—')}</div>
                <div class="pwr-sub">${escHtml(w.bodega || '')}${w.cepa ? ` · ${escHtml(w.cepa)}` : ''} · <span class="badge-source badge-${w.source}">${SOURCE_LABELS[w.source] || w.source}</span></div>
              </div>
              <div class="pwr-price">${formatPrice(w.precio)}</div>
            </div>`).join('')
        : '<div class="pwr-empty">Sin resultados</div>';
    } catch {}
  }, 300);
}

function addWineToPedidoModal(idx) {
  const w = _pedidoWineResults[idx];
  if (!w || !_modalPedido) return;
  const id = wineId(w);
  const existing = _modalPedido.items.find(i => i.wine_id === id);
  if (existing) {
    existing.cantidad += w.min_unidades || 1;
  } else {
    _modalPedido.items.push({
      wine_id: id,
      nombre: w.nombre || '—',
      bodega: w.bodega || null,
      cepa: w.cepa || null,
      source: w.source,
      precio_unitario: w.precio || 0,
      cantidad: w.min_unidades || 1,
    });
  }
  renderPedidoModalItems();
  document.getElementById('pedido-wine-q').value = '';
  document.getElementById('pedido-wine-results').innerHTML = '';
  showToast(`${w.nombre} agregado`, 'success', 1500);
}

function renderPedidoVentaGanancia() {
  const el = document.getElementById('pedido-venta-ganancia');
  if (!el || !_modalPedido) return;
  const tv = parseFloat(document.getElementById('pedido-total-venta')?.value);
  const costo = _modalPedido.items.reduce((s, i) => s + (i.precio_unitario || 0) * (i.cantidad || 0), 0);
  if (!tv || !costo) { el.textContent = ''; return; }
  const gan = tv - costo;
  const pct = ((gan / tv) * 100).toFixed(0);
  el.textContent = (gan >= 0 ? '+' : '') + formatPrice(gan) + ' (' + pct + '%)';
  el.className = 'pedido-venta-ganancia ' + (gan >= 0 ? 'gan-pos' : 'gan-neg');
}

function renderPedidoModalItems() {
  if (!_modalPedido) return;
  const list    = document.getElementById('pedido-modal-items');
  const totalEl = document.getElementById('pedido-modal-total');
  const countEl = document.getElementById('pedido-items-count');
  const items   = _modalPedido.items;

  if (countEl) countEl.textContent = items.length ? `${items.length} ítem${items.length !== 1 ? 's' : ''}` : '';

  if (!items.length) {
    list.innerHTML = '<div class="pedido-items-empty">Buscá un vino arriba para agregarlo al pedido</div>';
    if (totalEl) totalEl.innerHTML = '';
    return;
  }

  list.innerHTML = items.map((item, i) => `
    <div class="pedido-item-row">
      <div class="pir-wine">
        <div class="pir-name">${escHtml(item.nombre)}</div>
        <div class="pir-sub">${item.bodega ? escHtml(item.bodega) : ''}${item.cepa ? ` · ${escHtml(item.cepa)}` : ''} · <span class="badge-source badge-${item.source}">${SOURCE_LABELS[item.source] || item.source}</span></div>
      </div>
      <div class="pir-controls">
        <button class="pir-btn" onclick="changePedidoQty(${i},-1)">−</button>
        <span class="pir-qty">${item.cantidad}</span>
        <button class="pir-btn" onclick="changePedidoQty(${i},1)">+</button>
      </div>
      <div class="pir-price">${formatPrice(item.precio_unitario)}</div>
      <div class="pir-subtotal">${formatPrice(item.precio_unitario * item.cantidad)}</div>
      <button class="pir-del" onclick="removePedidoModalItem(${i})"><i class="bi bi-x"></i></button>
    </div>`).join('');

  const total = items.reduce((s, i) => s + (i.precio_unitario || 0) * (i.cantidad || 0), 0);
  if (totalEl) totalEl.innerHTML = `<span class="pedido-total-label">Total:</span><span class="pedido-total-val">${formatPrice(total)}</span>`;
}

function changePedidoQty(idx, delta) {
  const item = _modalPedido?.items[idx];
  if (!item) return;
  item.cantidad = Math.max(1, (item.cantidad || 1) + delta);
  renderPedidoModalItems();
}

function removePedidoModalItem(idx) {
  _modalPedido?.items.splice(idx, 1);
  renderPedidoModalItems();
}

function closePedidoModal() {
  document.getElementById('modal-pedido').style.display = 'none';
  document.getElementById('pedido-client-dropdown').style.display = 'none';
  _editOrderId = null;
  _modalPedido = null;
}

async function savePedidoModal() {
  if (!_modalPedido) return;
  if (!_modalPedido.items.length) { showToast('El pedido está vacío', 'error'); return; }

  _modalPedido.estado = document.getElementById('pedido-estado').value;
  _modalPedido.fecha  = document.getElementById('pedido-fecha').value;
  _modalPedido.notas  = document.getElementById('pedido-notas').value.trim() || null;
  const tvRaw = parseFloat(document.getElementById('pedido-total-venta')?.value);
  _modalPedido.total_venta = isNaN(tvRaw) || tvRaw <= 0 ? null : tvRaw;

  if (!_modalPedido.cliente_id) {
    const nombre = document.getElementById('pedido-cliente-search').value.trim();
    _modalPedido.cliente_nombre = nombre || null;
  }

  try {
    const wasActive = document.getElementById('modal-pedido-title').textContent === 'Confirmar Pedido';
    if (_editOrderId) {
      await _apiUpdateOrder(_editOrderId, _modalPedido);
      showToast('Pedido actualizado', 'success');
    } else {
      const saved = await _apiAddOrder(_modalPedido);
      if (wasActive) {
        activePedido = { cliente_id: null, cliente_nombre: '', fecha: _todayDate(), estado: 'confirmado', notas: '', items: [] };
        updatePedidoBadge();
      }
      showToast(`Pedido #${saved.numero} guardado`, 'success');
    }
    closePedidoModal();
    renderPedidos();
    if (_clientDetailId) renderClientDetail();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/* ─── Importación CSV / Excel ────────────────────────────────────────────────── */
function openImportModal() {
  document.getElementById('modal-import').style.display = 'flex';
  document.getElementById('import-file').value = '';
  document.getElementById('import-preview').innerHTML = '';
  document.getElementById('btn-import-confirm').style.display = 'none';
  _importRows = [];
}

function closeImportModal() {
  document.getElementById('modal-import').style.display = 'none';
}

function downloadImportTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['fecha', 'codigo_cliente', 'nombre_cliente', 'nombre_vino', 'bodega', 'cepa', 'proveedor', 'precio_unitario', 'cantidad', 'notas_pedido'],
    ['2024-01-15', 'CLI001', 'Juan Pérez', 'Catena Zapata Adrianna', 'Catena Zapata', 'Malbec', 'cepas_argentinas', 15000, 6, ''],
    ['2024-01-15', 'CLI001', 'Juan Pérez', 'Luigi Bosca Malbec', 'Luigi Bosca', 'Malbec', 'mp_drinks', 8000, 12, ''],
    ['2024-02-01', 'CLI002', 'María García', 'Achaval Ferrer Malbec', 'Achaval Ferrer', 'Malbec', 'cepas_argentinas', 12000, 6, 'Entrega el 5/2'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
  XLSX.writeFile(wb, 'plantilla_pedidos.xlsx');
}

function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      parseImportRows(XLSX.utils.sheet_to_json(ws, { defval: '' }));
    } catch (err) {
      showToast('Error leyendo archivo: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseImportRows(rows) {
  const preview  = document.getElementById('import-preview');
  const btnConf  = document.getElementById('btn-import-confirm');

  if (!rows.length) { preview.innerHTML = '<p style="color:var(--text-muted)">El archivo está vacío.</p>'; return; }

  const norm = s => String(s).toLowerCase().trim().replace(/[\s-]+/g, '_');
  const cols = Object.keys(rows[0]).map(norm);
  const missing = ['fecha', 'nombre_vino', 'precio_unitario', 'cantidad'].filter(r => !cols.includes(r));
  if (missing.length) {
    preview.innerHTML = `<p style="color:var(--wine)">Faltan columnas: <strong>${missing.join(', ')}</strong>.<br>Descargá la plantilla para ver el formato.</p>`;
    return;
  }

  const normalized = rows.map(row => {
    const r = {};
    Object.keys(row).forEach(k => { r[norm(k)] = row[k]; });
    return r;
  });

  const groups = {};
  normalized.forEach(r => {
    const key = `${r.fecha}__${r.codigo_cliente || r.nombre_cliente || 'anonimo'}`;
    if (!groups[key]) groups[key] = {
      fecha: String(r.fecha), codigo: String(r.codigo_cliente || ''),
      nombre: String(r.nombre_cliente || ''), notas: String(r.notas_pedido || ''), items: [],
    };
    groups[key].items.push({
      nombre_vino: String(r.nombre_vino || ''),
      bodega: String(r.bodega || ''),
      cepa: String(r.cepa || ''),
      proveedor: String(r.proveedor || ''),
      precio_unitario: parseFloat(r.precio_unitario) || 0,
      cantidad: parseInt(r.cantidad) || 1,
    });
  });

  _importRows = Object.values(groups);
  preview.innerHTML = `
    <p style="margin-bottom:10px"><strong>${_importRows.length} pedido${_importRows.length !== 1 ? 's' : ''}</strong> detectado${_importRows.length !== 1 ? 's' : ''} (${normalized.length} ítems)</p>
    <div class="import-preview-wrap">
      <table class="import-preview-table">
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Ítems</th><th>Total</th></tr></thead>
        <tbody>${_importRows.map(o => {
          const total = o.items.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0);
          return `<tr>
            <td>${escHtml(o.fecha)}</td>
            <td>${escHtml(o.nombre || o.codigo || 'Anónimo')}</td>
            <td>${o.items.length}</td>
            <td>${formatPrice(total)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  btnConf.style.display = '';
}

async function confirmImport() {
  if (!_importRows.length) return;
  const btn = document.getElementById('btn-import-confirm');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Importando...';

  let created = 0;
  try {
    for (const o of _importRows) {
      let clienteId = null, clienteNombre = o.nombre || null;

      if (o.codigo || o.nombre) {
        const existing = _clients.find(c =>
          (o.codigo && c.codigo && c.codigo.toLowerCase() === o.codigo.toLowerCase()) ||
          (o.nombre && c.nombre && c.nombre.toLowerCase() === o.nombre.toLowerCase())
        );
        if (existing) {
          clienteId = existing.id;
          clienteNombre = existing.nombre;
        } else if (o.nombre) {
          const saved = await _apiAddClient({ nombre: o.nombre, codigo: o.codigo || null });
          _clients.unshift(saved);
          _clients.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
          clienteId = saved.id;
          clienteNombre = saved.nombre;
        }
      }

      const items = o.items.map(i => ({
        wine_id: `${i.proveedor}::${(i.nombre_vino || '').toLowerCase()}`,
        nombre: i.nombre_vino, bodega: i.bodega || null, cepa: i.cepa || null,
        source: i.proveedor || 'desconocido',
        precio_unitario: i.precio_unitario, cantidad: i.cantidad,
      }));

      await _apiAddOrder({ cliente_id: clienteId, cliente_nombre: clienteNombre, fecha: o.fecha, estado: 'entregado', items, notas: o.notas || null });
      created++;
    }
    showToast(`${created} pedido${created !== 1 ? 's' : ''} importado${created !== 1 ? 's' : ''}`, 'success');
    closeImportModal();
    renderPedidos();
    renderClientes();
  } catch (err) {
    showToast('Error importando: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-cloud-upload"></i> Confirmar importación';
  }
}
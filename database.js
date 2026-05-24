require('dotenv').config();
const { MongoClient } = require('mongodb');
const { normalizeRegion, normalizeCepa, inferBodega, cleanBodega } = require('./normalization');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME     = 'vinoapp';

let _db = null;

let state = {
  wines: [],
  history: [],
  meta: {
    cepas_argentinas: { last_updated: null, count: 0 },
    mp_drinks:        { last_updated: null, count: 0 },
    rustico:          { last_updated: null, count: 0 },
  },
};

let marketPrices = {};
let favorites = [];
let views = [];
let quotes = [];
let clients = [];
let orders = [];
let _nextOrderNum = 1;

// ─── Conexión y carga inicial ─────────────────────────────────────────────────

async function init() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI no está definida en .env');
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  _db = client.db(DB_NAME);
  console.log('  ✓ MongoDB conectado');

  const stateDoc = await _db.collection('state').findOne({ _id: 'main' });
  if (stateDoc) {
    const { _id, ...rest } = stateDoc;
    state = { ...state, ...rest };
  }

  const mpDocs = await _db.collection('market_prices').find({}).toArray();
  marketPrices = {};
  mpDocs.forEach(doc => { marketPrices[doc._id] = doc.price; });

  const favDocs = await _db.collection('favorites').find({}).sort({ savedAt: -1 }).toArray();
  favorites = favDocs.map(({ _id, ...rest }) => ({ id: _id, ...rest }));

  const viewDocs = await _db.collection('views').find({}).sort({ createdAt: -1 }).toArray();
  views = viewDocs.map(({ _id, ...rest }) => ({ id: _id, ...rest }));

  const quoteDocs = await _db.collection('quotes').find({}).sort({ savedAt: -1 }).toArray();
  quotes = quoteDocs.map(({ _id, ...rest }) => ({ id: _id, ...rest })).slice(0, 50);

  const clientDocs = await _db.collection('clients').find({}).sort({ nombre: 1 }).toArray();
  clients = clientDocs.map(({ _id, ...rest }) => ({ id: _id, ...rest }));

  const orderDocs = await _db.collection('orders').find({}).sort({ fecha: -1, _id: -1 }).toArray();
  orders = orderDocs.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
  _nextOrderNum = orders.length > 0 ? Math.max(...orders.map(o => o.numero || 0)) + 1 : 1;
}

// ─── Persistencia ─────────────────────────────────────────────────────────────

async function save() {
  if (!_db) return;
  await _db.collection('state').replaceOne(
    { _id: 'main' },
    { _id: 'main', wines: state.wines, history: state.history, meta: state.meta },
    { upsert: true }
  );
}

async function persistMarketPrice(key, price) {
  if (!_db) return;
  if (price == null) {
    await _db.collection('market_prices').deleteOne({ _id: key });
  } else {
    await _db.collection('market_prices').replaceOne(
      { _id: key },
      { _id: key, price },
      { upsert: true }
    );
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────

function parseMulti(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

function marketKey(w) { return `${w.source}::${(w.nombre || '').toLowerCase()}`; }

function getWines({ source, nombre, cepa, subzona, zona, provincia, pais, min_price, max_price, min_unidades, sort, dir } = {}) {
  let wines = [...state.wines];

  const sources = parseMulti(source);
  if (sources.length) wines = wines.filter(w => sources.includes(w.source));

  if (nombre) {
    const q = nombre.toLowerCase();
    wines = wines.filter(w =>
      (w.nombre && w.nombre.toLowerCase().includes(q)) ||
      (w.bodega && w.bodega.toLowerCase().includes(q))
    );
  }

  const cepas = parseMulti(cepa);
  if (cepas.length) wines = wines.filter(w => w.cepa && cepas.includes(w.cepa));

  const zonas = parseMulti(zona);
  if (zonas.length) wines = wines.filter(w => w.zona && zonas.includes(w.zona));

  const provincias = parseMulti(provincia);
  if (provincias.length) wines = wines.filter(w => w.provincia && provincias.includes(w.provincia));

  const paises = parseMulti(pais);
  if (paises.length) wines = wines.filter(w => w.pais && paises.includes(w.pais));

  if (subzona)  { const q = subzona.toLowerCase();  wines = wines.filter(w => w.subzona  && w.subzona.toLowerCase().includes(q)); }
  if (min_price != null && !isNaN(min_price)) wines = wines.filter(w => w.precio >= parseFloat(min_price));
  if (max_price != null && !isNaN(max_price)) wines = wines.filter(w => w.precio <= parseFloat(max_price));
  if (min_unidades != null && !isNaN(min_unidades)) wines = wines.filter(w => (w.min_unidades || 1) === parseInt(min_unidades));

  wines = wines.map(w => {
    const market_price = marketPrices[marketKey(w)] ?? null;
    const market_diff = (market_price != null && w.precio != null && market_price > 0)
      ? Math.round((market_price - w.precio) / market_price * 100)
      : null;
    return { ...w, market_price, market_diff };
  });

  const validSorts = ['nombre', 'bodega', 'cepa', 'subzona', 'zona', 'provincia', 'pais', 'precio', 'source', 'min_unidades', 'market_price', 'market_diff'];
  const sortCol = validSorts.includes(sort) ? sort : 'nombre';
  const asc = dir !== 'desc';

  wines.sort((a, b) => {
    const va = a[sortCol];
    const vb = b[sortCol];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return asc ? va - vb : vb - va;
    return asc ? String(va).localeCompare(String(vb), 'es') : String(vb).localeCompare(String(va), 'es');
  });

  return wines;
}

function titleCase(str) {
  if (!str) return str;
  const lower = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'o', 'e', 'con', 'sin']);
  return str
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i === 0 || !lower.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w)
    .join(' ');
}

async function saveWines(source, wines) {
  const oldWines = state.wines.filter(w => w.source === source);
  state.wines = state.wines.filter(w => w.source !== source);

  const now = new Date().toISOString();
  const toInsert = wines.map((w, i) => {
    let bodega = w.bodega ? cleanBodega(w.bodega.trim()) : '';
    if (!bodega) bodega = inferBodega(w.nombre || '');
    if (bodega)  bodega = titleCase(cleanBodega(bodega));
    bodega = bodega || null;

    const cepa = normalizeCepa(w.cepa || '') || null;
    const reg  = normalizeRegion(w.region || '');
    const precio = w.precio ?? w.precio_efectivo ?? null;
    const min_unidades = source === 'rustico' ? (w.unidades_caja || 6) : 1;

    return {
      id:           `${source}_${i}`,
      source,
      nombre:       w.nombre ? w.nombre.trim() : null,
      bodega,
      cepa,
      subzona:      reg.subzona   || null,
      zona:         reg.zona      || null,
      provincia:    reg.provincia || null,
      pais:         reg.pais      || 'Argentina',
      linea:        w.linea ? w.linea.trim() : null,
      precio,
      min_unidades,
      unidades_caja: w.unidades_caja ?? null,
      notas:        w.notas || null,
      last_updated: now,
    };
  });

  state.wines.push(...toInsert);
  state.meta[source] = { last_updated: now, count: toInsert.length };

  if (oldWines.length > 0) {
    const oldMap = new Map(oldWines.map(w => [(w.nombre || '').toLowerCase(), w]));
    const newMap = new Map(toInsert.map(w => [(w.nombre || '').toLowerCase(), w]));
    const changes = [];

    for (const [key, w] of newMap) {
      const old = oldMap.get(key);
      if (!old) {
        changes.push({ type: 'added', source, nombre: w.nombre, bodega: w.bodega, cepa: w.cepa, precio: w.precio, min_unidades: w.min_unidades || 1, date: now });
      } else if (old.precio != null && w.precio != null && old.precio !== w.precio) {
        changes.push({ type: 'price_change', source, nombre: w.nombre, bodega: w.bodega, cepa: w.cepa, precio_old: old.precio, precio_new: w.precio, min_unidades: w.min_unidades || 1, date: now });
      }
    }
    for (const [key, w] of oldMap) {
      if (!newMap.has(key)) {
        changes.push({ type: 'removed', source, nombre: w.nombre, bodega: w.bodega, cepa: w.cepa, precio: w.precio, min_unidades: w.min_unidades || 1, date: now });
      }
    }

    if (changes.length) {
      if (!state.history) state.history = [];
      state.history = [...changes, ...state.history].slice(0, 1000);
    }
  }

  await save();
}

async function setMarketPrice(key, price) {
  if (price == null || price === '' || isNaN(price)) {
    delete marketPrices[key];
    await persistMarketPrice(key, null);
  } else {
    marketPrices[key] = parseFloat(price);
    await persistMarketPrice(key, parseFloat(price));
  }
}

function getHistory(limit = 200) {
  const wineMap = new Map(state.wines.map(w => [`${w.source}::${(w.nombre || '').toLowerCase()}`, w]));
  return (state.history || []).slice(0, limit).map(h => {
    if (h.min_unidades) return h;
    const wine = wineMap.get(`${h.source}::${(h.nombre || '').toLowerCase()}`);
    return wine ? { ...h, min_unidades: wine.min_unidades } : h;
  });
}

function getOptions() {
  const cepas        = [...new Set(state.wines.map(w => w.cepa).filter(Boolean))].sort();
  const subzonas     = [...new Set(state.wines.map(w => w.subzona).filter(Boolean))].sort();
  const zonas        = [...new Set(state.wines.map(w => w.zona).filter(Boolean))].sort();
  const provincias   = [...new Set(state.wines.map(w => w.provincia).filter(Boolean))].sort();
  const paises       = [...new Set(state.wines.map(w => w.pais).filter(Boolean))].sort();
  const bodegas      = [...new Set(state.wines.map(w => w.bodega).filter(Boolean))].sort();
  const min_unidades = [...new Set(state.wines.map(w => w.min_unidades || 1))].sort((a, b) => a - b);
  return { cepas, subzonas, zonas, provincias, paises, bodegas, min_unidades };
}

function getStats() {
  const wines = state.wines;

  const count = (arr, key) => {
    const map = {};
    arr.forEach(w => { const v = w[key]; if (v) map[v] = (map[v] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ [key]: k, cantidad: v })).sort((a, b) => b.cantidad - a.cantidad);
  };

  const avgBy = (arr, groupKey, valKey) => {
    const map = {};
    arr.forEach(w => {
      const g = w[groupKey], v = w[valKey];
      if (g && v != null) {
        if (!map[g]) map[g] = { sum: 0, n: 0 };
        map[g].sum += v; map[g].n++;
      }
    });
    return Object.entries(map)
      .map(([k, { sum, n }]) => ({ [groupKey]: k, avg_precio: Math.round(sum / n), cantidad: n }))
      .sort((a, b) => b.avg_precio - a.avg_precio);
  };

  const bySrc = {};
  wines.forEach(w => {
    if (!bySrc[w.source]) bySrc[w.source] = { source: w.source, cantidad: 0, precios: [] };
    bySrc[w.source].cantidad++;
    if (w.precio != null) bySrc[w.source].precios.push(w.precio);
  });

  return {
    total_vinos:      wines.length,
    total_bodegas:    new Set(wines.map(w => w.bodega).filter(Boolean)).size,
    total_cepas:      new Set(wines.map(w => w.cepa).filter(Boolean)).size,
    total_proveedores: new Set(wines.map(w => w.source)).size,
    por_cepa:         count(wines, 'cepa').slice(0, 15),
    por_bodega:       count(wines, 'bodega').slice(0, 10),
    por_zona:         count(wines, 'zona'),
    por_provincia:    count(wines, 'provincia'),
    por_pais:         count(wines, 'pais'),
    por_proveedor:    Object.values(bySrc).map(s => ({
      source:    s.source,
      cantidad:  s.cantidad,
      avg_precio: s.precios.length ? Math.round(s.precios.reduce((a, b) => a + b, 0) / s.precios.length) : null,
      min_precio: s.precios.length ? Math.min(...s.precios) : null,
      max_precio: s.precios.length ? Math.max(...s.precios) : null,
    })),
    precio_por_cepa:  avgBy(wines, 'cepa', 'precio').slice(0, 12),
    last_updates:     Object.entries(state.meta).map(([source, m]) => ({
      source, total: m.count, last_updated: m.last_updated,
    })),
  };
}

function getStatus() {
  return Object.entries(state.meta).map(([source, m]) => ({
    source, total: m.count, last_updated: m.last_updated,
  }));
}

function getAllForChat(limit = 400) {
  return state.wines.slice(0, limit);
}

// ─── Favoritos ────────────────────────────────────────────────────────────────

function getFavorites() {
  return favorites.map(f => ({
    ...f,
    wine: { ...f.wine, market_price: marketPrices[f.wineId] ?? null },
  }));
}

async function addFavorite(fav) {
  const id = Date.now();
  const { id: _ignored, ...data } = fav;
  await _db.collection('favorites').insertOne({ _id: id, ...data });
  const newFav = { id, ...data };
  favorites.unshift(newFav);
  return newFav;
}

async function removeFavorite(id) {
  await _db.collection('favorites').deleteOne({ _id: id });
  favorites = favorites.filter(f => f.id !== id);
}

async function patchFavorite(id, fields) {
  await _db.collection('favorites').updateOne({ _id: id }, { $set: fields });
  const fav = favorites.find(f => f.id === id);
  if (fav) Object.assign(fav, fields);
}

// ─── Vistas guardadas ─────────────────────────────────────────────────────────

function getViews() { return views; }

async function addView(view) {
  const id = Date.now();
  const { id: _ignored, ...data } = view;
  await _db.collection('views').insertOne({ _id: id, ...data });
  const newView = { id, ...data };
  views.unshift(newView);
  return newView;
}

async function removeView(id) {
  await _db.collection('views').deleteOne({ _id: id });
  views = views.filter(v => v.id !== id);
}

// ─── Cotizaciones ─────────────────────────────────────────────────────────────

function getQuotes() { return quotes; }

async function addQuote(quote) {
  const id = Date.now();
  const { id: _ignored, ...data } = quote;
  await _db.collection('quotes').insertOne({ _id: id, ...data });
  const newQuote = { id, ...data };
  quotes.unshift(newQuote);
  if (quotes.length > 50) {
    const removed = quotes.splice(50);
    for (const q of removed) {
      await _db.collection('quotes').deleteOne({ _id: q.id });
    }
  }
  return newQuote;
}

async function removeQuote(id) {
  await _db.collection('quotes').deleteOne({ _id: id });
  quotes = quotes.filter(q => q.id !== id);
}

// ─── Clientes ─────────────────────────────────────────────────────────────────

function getClients() { return clients; }

async function addClient(data) {
  const id = Date.now();
  const now = new Date().toISOString();
  const codigo = (data.codigo && data.codigo.trim()) || `CLI${String(clients.length + 1).padStart(3, '0')}`;
  const doc = {
    _id: id, codigo, nombre: data.nombre,
    telefono: data.telefono || null, email: data.email || null,
    direccion: data.direccion || null, notas: data.notas || null,
    created_at: now,
  };
  await _db.collection('clients').insertOne(doc);
  const newClient = { id, ...doc };
  delete newClient._id;
  clients.push(newClient);
  clients.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  return newClient;
}

async function updateClientById(id, fields) {
  const allowed = ['codigo', 'nombre', 'telefono', 'email', 'direccion', 'notas'];
  const update = {};
  for (const k of allowed) if (k in fields) update[k] = fields[k];
  await _db.collection('clients').updateOne({ _id: id }, { $set: update });
  const c = clients.find(c => c.id === id);
  if (c) Object.assign(c, update);
}

async function deleteClientById(id) {
  await _db.collection('clients').deleteOne({ _id: id });
  clients = clients.filter(c => c.id !== id);
}

// ─── Pedidos ──────────────────────────────────────────────────────────────────

function getOrders({ cliente_id, estado, fecha_from, fecha_to } = {}) {
  let result = [...orders];
  if (cliente_id) result = result.filter(o => o.cliente_id === parseInt(cliente_id));
  if (estado)     result = result.filter(o => o.estado === estado);
  if (fecha_from) result = result.filter(o => o.fecha >= fecha_from);
  if (fecha_to)   result = result.filter(o => o.fecha <= fecha_to);
  return result;
}

async function addOrder(data) {
  const id = Date.now();
  const now = new Date().toISOString();
  const numero = _nextOrderNum++;
  const items = data.items || [];
  const total = items.reduce((s, i) => s + ((i.precio_unitario || 0) * (i.cantidad || 0)), 0);
  const doc = {
    _id: id, numero,
    cliente_id: data.cliente_id || null,
    cliente_nombre: data.cliente_nombre || null,
    fecha: data.fecha || now.split('T')[0],
    estado: data.estado || 'borrador',
    items, total,
    notas: data.notas || null,
    created_at: now,
  };
  await _db.collection('orders').insertOne(doc);
  const newOrder = { id, ...doc };
  delete newOrder._id;
  orders.unshift(newOrder);
  return newOrder;
}

async function updateOrderById(id, fields) {
  const allowed = ['cliente_id', 'cliente_nombre', 'fecha', 'estado', 'items', 'notas'];
  const update = {};
  for (const k of allowed) if (k in fields) update[k] = fields[k];
  if (fields.items) {
    update.total = fields.items.reduce((s, i) => s + ((i.precio_unitario || 0) * (i.cantidad || 0)), 0);
  }
  await _db.collection('orders').updateOne({ _id: id }, { $set: update });
  const o = orders.find(o => o.id === id);
  if (o) Object.assign(o, update);
}

async function deleteOrderById(id) {
  await _db.collection('orders').deleteOne({ _id: id });
  orders = orders.filter(o => o.id !== id);
}

module.exports = {
  init, getWines, saveWines, getOptions, getStats, getStatus, getAllForChat, getHistory, setMarketPrice,
  getFavorites, addFavorite, removeFavorite, patchFavorite,
  getViews, addView, removeView,
  getQuotes, addQuote, removeQuote,
  getClients, addClient, updateClientById, deleteClientById,
  getOrders, addOrder, updateOrderById, deleteOrderById,
};

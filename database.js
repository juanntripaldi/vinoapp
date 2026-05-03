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
        changes.push({ type: 'added', source, nombre: w.nombre, bodega: w.bodega, cepa: w.cepa, precio: w.precio, date: now });
      } else if (old.precio != null && w.precio != null && old.precio !== w.precio) {
        changes.push({ type: 'price_change', source, nombre: w.nombre, bodega: w.bodega, cepa: w.cepa, precio_old: old.precio, precio_new: w.precio, date: now });
      }
    }
    for (const [key, w] of oldMap) {
      if (!newMap.has(key)) {
        changes.push({ type: 'removed', source, nombre: w.nombre, bodega: w.bodega, cepa: w.cepa, precio: w.precio, date: now });
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
  return (state.history || []).slice(0, limit);
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

module.exports = { init, getWines, saveWines, getOptions, getStats, getStatus, getAllForChat, getHistory, setMarketPrice };

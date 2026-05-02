/**
 * Base de datos simple en JSON.
 */
const fs   = require('fs');
const path = require('path');
const { normalizeRegion, normalizeCepa, inferBodega, cleanBodega } = require('./normalization');

const DB_PATH = path.join(__dirname, 'wines.json');

let state = {
  wines: [],
  meta: {
    cepas_argentinas: { last_updated: null, count: 0 },
    mp_drinks:        { last_updated: null, count: 0 },
    rustico:          { last_updated: null, count: 0 },
  },
};

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      state = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('No se pudo leer la base de datos, se empieza desde cero:', e.message);
  }
}

function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2), 'utf8');
}

load();

// ─── API ──────────────────────────────────────────────────────────────────────

function getWines({ source, nombre, cepa, subzona, zona, provincia, pais, min_price, max_price, sort, dir } = {}) {
  let wines = [...state.wines];

  if (source)   wines = wines.filter(w => w.source === source);
  if (nombre) {
    const q = nombre.toLowerCase();
    wines = wines.filter(w =>
      (w.nombre && w.nombre.toLowerCase().includes(q)) ||
      (w.bodega && w.bodega.toLowerCase().includes(q))
    );
  }
  if (cepa)     { const q = cepa.toLowerCase();     wines = wines.filter(w => w.cepa     && w.cepa.toLowerCase().includes(q)); }
  if (subzona)  { const q = subzona.toLowerCase();  wines = wines.filter(w => w.subzona  && w.subzona.toLowerCase().includes(q)); }
  if (zona)     { const q = zona.toLowerCase();     wines = wines.filter(w => w.zona     && w.zona.toLowerCase().includes(q)); }
  if (provincia){ const q = provincia.toLowerCase();wines = wines.filter(w => w.provincia && w.provincia.toLowerCase().includes(q)); }
  if (pais)     { const q = pais.toLowerCase();     wines = wines.filter(w => w.pais     && w.pais.toLowerCase().includes(q)); }
  if (min_price != null && !isNaN(min_price)) wines = wines.filter(w => w.precio >= parseFloat(min_price));
  if (max_price != null && !isNaN(max_price)) wines = wines.filter(w => w.precio <= parseFloat(max_price));

  const validSorts = ['nombre', 'bodega', 'cepa', 'subzona', 'zona', 'provincia', 'pais', 'precio', 'source', 'min_unidades'];
  const sortCol = validSorts.includes(sort) ? sort : 'nombre';
  const asc = dir !== 'desc';

  wines.sort((a, b) => {
    const va = a[sortCol] ?? '';
    const vb = b[sortCol] ?? '';
    if (typeof va === 'number' && typeof vb === 'number') return asc ? va - vb : vb - va;
    return asc ? String(va).localeCompare(String(vb), 'es') : String(vb).localeCompare(String(va), 'es');
  });

  return wines;
}

/** Normaliza texto a Title Case */
function titleCase(str) {
  if (!str) return str;
  const lower = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'o', 'e', 'con', 'sin']);
  return str
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i === 0 || !lower.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w)
    .join(' ');
}

function saveWines(source, wines) {
  state.wines = state.wines.filter(w => w.source !== source);

  const now = new Date().toISOString();
  const toInsert = wines.map((w, i) => {
    // Bodega: limpiar sufijos duplicadores, luego inferir si está vacía
    let bodega = w.bodega ? cleanBodega(w.bodega.trim()) : '';
    if (!bodega) bodega = inferBodega(w.nombre || '');
    if (bodega)  bodega = titleCase(cleanBodega(bodega));
    bodega = bodega || null;

    // Cepa normalizada
    const cepa = normalizeCepa(w.cepa || '') || null;

    // Región → subzona / zona / provincia / pais
    const reg = normalizeRegion(w.region || '');

    // Precio único
    const precio = w.precio ?? w.precio_efectivo ?? null;

    // Mínimo de compra: Rústico vende por caja, resto por unidad
    const min_unidades = source === 'rustico' ? (w.unidades_caja || 6) : 1;

    return {
      id:           `${source}_${i}`,
      source,
      nombre:       w.nombre ? w.nombre.trim() : null,
      bodega,
      cepa,
      subzona:      reg.subzona  || null,
      zona:         reg.zona     || null,
      provincia:    reg.provincia || null,
      pais:         reg.pais     || 'Argentina',
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
  save();
}

function getOptions() {
  const cepas     = [...new Set(state.wines.map(w => w.cepa).filter(Boolean))].sort();
  const subzonas  = [...new Set(state.wines.map(w => w.subzona).filter(Boolean))].sort();
  const zonas     = [...new Set(state.wines.map(w => w.zona).filter(Boolean))].sort();
  const provincias = [...new Set(state.wines.map(w => w.provincia).filter(Boolean))].sort();
  const paises    = [...new Set(state.wines.map(w => w.pais).filter(Boolean))].sort();
  const bodegas   = [...new Set(state.wines.map(w => w.bodega).filter(Boolean))].sort();
  return { cepas, subzonas, zonas, provincias, paises, bodegas };
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

module.exports = { getWines, saveWines, getOptions, getStats, getStatus, getAllForChat };

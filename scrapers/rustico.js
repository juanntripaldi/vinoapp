const https = require('https');
const pdf   = require('pdf-parse');
const { BODEGAS_LIST, CEPAS_REF, inferBodega } = require('../normalization');

// Lista de alias de cepas (lowercase) para limpiar el nombre
const CEPA_ALIASES_LC = [];
for (const entry of CEPAS_REF) {
  CEPA_ALIASES_LC.push(entry.canonical.toLowerCase());
  for (const a of entry.aliases) CEPA_ALIASES_LC.push(a.toLowerCase());
}
// Ordenar de más larga a más corta para quitar primero las más específicas
CEPA_ALIASES_LC.sort((a, b) => b.length - a.length);

/**
 * Elimina la bodega (al inicio) y la cepa (al final) del nombre del vino.
 * Formato Rústico: "BODEGA NOMBRE CEPA [PACK]"
 * Ejemplo: "LAMADRID MATILDE MALBEC" → "MATILDE"
 * Si tras la limpieza no queda texto significativo (≥3 chars), devuelve el original sin bodega.
 */
function cleanRusticoName(rawName) {
  let name = rawName.trim();

  // 1) Quitar bodega solo si aparece AL INICIO
  for (const bodega of BODEGAS_LIST) {
    const re = new RegExp('^' + bodega.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i');
    if (re.test(name)) {
      name = name.replace(re, '').trim();
      break;
    }
  }

  const nameAfterBodega = name; // guardar versión sin bodega como fallback

  // 2) Quitar cepa(s) solo AL FINAL del string (reverse: más largas primero)
  for (const alias of CEPA_ALIASES_LC) {
    if (alias.length < 4) continue;
    // Solo al final, con posible puntuación o espacio antes
    const re = new RegExp('[\\s,;/–-]*' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'gi');
    name = name.replace(re, '').trim();
  }

  // 3) Limpiar conectores solos al final: "o", "y", "-", ","
  name = name.replace(/[\s,;/–-]+[oy]?\s*$/i, '').trim();
  name = name.replace(/^[oy,;/–-\s]+/i, '').trim();

  // 4) Si queda muy poco (solo puntuación o <3 chars reales), usar fallback
  const meaningful = name.replace(/[^a-záéíóúñüa-z0-9]/gi, '');
  if (meaningful.length < 3) return nameAfterBodega;

  return name;
}

const PDF_URL = 'https://www.rusticovinos.com.ar/fotos/CARTA_DE_VINOS_RUSTICO.pdf';

const CEPAS = [
  'Malbec', 'Cabernet Sauvignon', 'Cab Sauv', 'Cab Franc', 'Cabernet Franc',
  'Merlot', 'Syrah', 'Shiraz', 'Tempranillo', 'Bonarda', 'Pinot Noir',
  'Sangiovese', 'Petit Verdot', 'Torrontés', 'Torrontes', 'Chardonnay',
  'Sauvignon Blanc', 'Chenin', 'Viognier', 'Blend', 'Corte', 'Rosé', 'Rose',
  'Espumante', 'Extra Brut', 'Brut', 'Demi Sec', 'Nature', 'Blanc de Blancs',
  'Pedro Giménez', 'Garnacha', 'Ancellotta', 'Carmenere', 'Tannat',
  'Gewurztraminer', 'Pinot Gris', 'Semillon', 'Assemblage', 'Naranjo',
];

const REGIONES = [
  'Luján de Cuyo', 'Lujan de Cuyo', 'Valle de Uco', 'Maipú', 'Gualtallary', 'Tupungato',
  'Mendoza', 'San Juan', 'Salta', 'Cafayate', 'La Rioja', 'Neuquén', 'Río Negro', 'Patagonia',
  'Agrelo', 'Chacayes', 'Altamira', 'Bella Vista', 'Cepillo',
];

function extractCepa(str) {
  const lower = str.toLowerCase();
  for (const c of CEPAS) {
    if (lower.includes(c.toLowerCase())) return c;
  }
  return '';
}

function extractRegion(str) {
  const lower = str.toLowerCase();
  for (const r of REGIONES) {
    if (lower.includes(r.toLowerCase())) return r;
  }
  return '';
}

function parsePrice(str) {
  if (!str) return null;
  const cleaned = String(str)
    .replace(/\$/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  const num = parseFloat(cleaned.replace(/[^\d.]/g, ''));
  return isNaN(num) || num < 100 ? null : num;
}

/**
 * Parsea una página del PDF usando coordenadas X/Y para identificar columnas.
 * Estructura de cada página:
 *   x≈46:   bodega header (ignoramos)
 *   x≈137:  nombre completo del vino (ej: "BODEGA VINO CEPA 6X750")
 *   x≈480-496: precio de oferta (número antes del $)
 *   x≈516-533: precio de lista (número antes del $)
 */
function parsePage(textContent) {
  const items = textContent.items;

  // Constantes de X (con tolerancia de ±10px)
  const X_NAME    = 137;  // columna de nombres
  const X_OFERTA  = 490;  // columna precio oferta (número)
  const X_LISTA   = 528;  // columna precio lista (número)
  const TOLERANCE = 15;

  const isNear = (x, target) => Math.abs(x - target) <= TOLERANCE;
  const isPrice = (str) => /^\d[\d.]+$/.test(str.trim());  // solo números y puntos

  // Agrupar items por Y (±2px = misma fila)
  const rows = {};
  for (const item of items) {
    const x = Math.round(item.transform[4]);
    const y = Math.round(item.transform[5]);
    const str = item.str.trim();
    if (!str) continue;

    // Redondear Y a múltiplos de 2 para agrupar filas
    const yKey = Math.round(y / 2) * 2;
    if (!rows[yKey]) rows[yKey] = { nombre: '', oferta: null, lista: null };

    if (isNear(x, X_NAME)) {
      // Columna de nombres (x≈137)
      rows[yKey].nombre += str + ' ';
    } else if (isNear(x, X_OFERTA) && isPrice(str)) {
      rows[yKey].oferta = parsePrice(str);
    } else if (isNear(x, X_LISTA) && isPrice(str)) {
      rows[yKey].lista = parsePrice(str);
    }
  }

  const wines = [];
  for (const yKey of Object.keys(rows).sort((a, b) => b - a)) {
    const row = rows[yKey];
    const nombre = row.nombre.trim();

    if (!nombre || nombre.length < 5) continue;
    // Filtrar encabezados
    if (/^PRECIO|^Vigencia/i.test(nombre)) continue;
    // Filtrar si no tiene pack (NxM) → probablemente no es un vino
    if (!row.oferta && !row.lista) continue;

    // Parsear nombre: "BODEGA WINE CEPA 6X750"
    const packMatch = nombre.match(/\s+\d+X\d+\s*$/i);
    const pack = packMatch ? packMatch[0].trim() : null;
    const nameWithoutPack = packMatch ? nombre.substring(0, packMatch.index).trim() : nombre.trim();

    // Cepa, región y bodega se extraen del nombre original (antes de limpiar)
    const cepa   = extractCepa(nameWithoutPack);
    const region = extractRegion(nameWithoutPack) || 'Mendoza';
    const bodega = inferBodega(nameWithoutPack);   // del nombre completo, antes del cleanup

    // Nombre limpio: quitar bodega y cepa
    const nombreLimpio = cleanRusticoName(nameWithoutPack);

    // Precio = min(precio_lista, precio_oferta) * 0.95
    const precioBase = Math.min(row.lista ?? Infinity, row.oferta ?? Infinity);
    const precio = isFinite(precioBase) ? Math.round(precioBase * 0.95) : null;

    const unidades_caja = pack ? (parseInt(pack.split('X')[0]) || null) : null;

    wines.push({
      nombre: nombreLimpio,
      bodega,
      cepa,
      region,
      linea: '',
      precio,
      unidades_caja,
      notas: pack || '',
    });
  }

  return wines;
}

async function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : `https://www.rusticovinos.com.ar${res.headers.location}`;
        fetchBuffer(loc).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function scrapeRustico() {
  console.log('[Rústico] Descargando PDF...');
  const buffer = await fetchBuffer(PDF_URL);
  console.log(`[Rústico] PDF descargado (${Math.round(buffer.length / 1024)} KB). Procesando...`);

  const allWines = [];
  const wineNames = new Set();

  // Procesar página por página usando el renderer personalizado
  const opts = {
    pagerender: function(pageData) {
      return pageData.getTextContent().then(function(textContent) {
        const pageWines = parsePage(textContent);
        for (const w of pageWines) {
          if (!wineNames.has(w.nombre)) {
            wineNames.add(w.nombre);
            allWines.push(w);
          }
        }
        // Retornar texto simple para que pdf-parse no falle
        return textContent.items.map(i => i.str).join(' ');
      });
    }
  };

  await pdf(buffer, opts);

  console.log(`[Rústico] ${allWines.length} vinos importados`);
  return allWines;
}

module.exports = { scrapeRustico };

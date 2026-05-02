const https = require('https');

const URL = 'https://mpdrinks.com.ar/lista-de-precios/';

const CEPAS = [
  'Malbec', 'Cabernet Sauvignon', 'Cab Sauv', 'Cabernet Franc', 'Cab Franc',
  'Merlot', 'Syrah', 'Shiraz', 'Tempranillo', 'Bonarda', 'Pinot Noir',
  'Sangiovese', 'Petit Verdot', 'Torrontés', 'Chardonnay', 'Sauvignon Blanc',
  'Chenin', 'Viognier', 'Blend', 'Corte', 'Rosé', 'Rose',
  'Espumante', 'Extra Brut', 'Demi Sec', 'Nature',
  'Pedro Giménez', 'Garnacha', 'Ancellotta', 'Varietales',
];

const REGIONES = [
  'Mendoza', 'Luján de Cuyo', 'Valle de Uco', 'Maipú', 'Gualtallary', 'Tupungato',
  'San Juan', 'Salta', 'Cafayate', 'La Rioja', 'Neuquén', 'Río Negro', 'Patagonia',
];

const BODEGAS_CONOCIDAS = [
  'Achaval Ferrer', 'Catena', 'Zuccardi', 'Clos de los Siete', 'Trapiche',
  'Norton', 'Rutini', 'Caro', 'Cheval des Andes', 'Mendel',
  'Durigutti', 'El Enemigo', 'Bressia', 'Clos de Chacras', 'Fabre Montmayou',
  'Familia Zuccardi', 'Finca Decero', 'Finca Las Moras', 'Finca Sophenia',
  'Kaiken', 'Luigi Bosca', 'Luca', 'Melipal', 'Nieto Senetiner',
  'Alma Negra', 'Bramare', 'Mevi', 'Clos Mayor', 'Dante Robino',
  'Alta Vista', 'Andeluna', 'Antucura', 'Baron B', 'Bianchi',
  'Casa Boher', 'Cinco Sentidos', 'Claro Oscuro', 'Cuvelier',
  'Escorihuela', 'Gascon', 'Gascón', 'Killka', 'La Azul', 'La Rural',
  'Lamadrid', 'Las Perdices', 'Los Cardos', 'Maipe', 'Melipal',
  'Michel Torino', 'Pascual Toso', 'Piattelli', 'Pulenta', 'Riglos',
  'Santa Ana', 'Santa Julia', 'Septima', 'Séptima', 'Susana Balbo',
  'Terrazas', 'Tikal', 'Trivento', 'Viña Cobos', 'Zolo',
  'Falasco', 'Aime', 'Atigrado', 'Aruma', 'Antonieta',
];

// Secciones a incluir (texto del h3, lowercased parcial)
const WINE_SECTION_KEYWORDS = ['vinos', 'espumantes', 'sidras'];
// Secciones a excluir explícitamente
const EXCLUDE_SECTION_KEYWORDS = ['vasos', 'copas', 'aperitivos', 'destilados', 'licores', 'energizante', 'jugos', 'gaseosa', 'botellones', 'insumos', 'fraperas', 'accesorios'];

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

function extractBodega(nombre) {
  const lower = nombre.toLowerCase();
  for (const b of BODEGAS_CONOCIDAS) {
    if (lower.includes(b.toLowerCase())) return b;
  }
  // Si el nombre tiene paréntesis, es probable que sea la bodega: "Antonieta Rose (Falasco)"
  const parenMatch = nombre.match(/\(([^)]+)\)/);
  if (parenMatch) return parenMatch[1].trim();
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
  return isNaN(num) ? null : num;
}

function stripHtml(str) {
  return str
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0', 'Accept': 'text/html' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : `https://mpdrinks.com.ar${res.headers.location}`;
        fetchHtml(loc).then(resolve).catch(reject);
        return;
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

function extractWineSections(html) {
  // Dividir por h3 para identificar secciones
  // Cada bloque: ...h3 content</h3>...html until next h3...
  const result = [];

  // Dividir en segmentos basados en h3
  const segments = html.split(/<h3[^>]*>/i);
  let currentSection = null;
  let currentHtml = '';

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    // El primer segmento no tiene h3 antes
    if (i === 0) { currentHtml = seg; continue; }

    // Extraer el título del h3
    const endH3 = seg.indexOf('</h3>');
    const h3Content = endH3 >= 0 ? seg.substring(0, endH3) : seg.substring(0, 100);
    const sectionTitle = stripHtml(h3Content).toLowerCase().trim();
    const afterH3 = endH3 >= 0 ? seg.substring(endH3 + 5) : '';

    // Guardar sección anterior si era de vinos
    if (currentSection !== null) {
      const isWine = WINE_SECTION_KEYWORDS.some(k => currentSection.includes(k));
      const isExcluded = EXCLUDE_SECTION_KEYWORDS.some(k => currentSection.includes(k));
      if (isWine && !isExcluded) {
        result.push(currentHtml);
      }
    }

    currentSection = sectionTitle;
    currentHtml = afterH3;
  }

  // No olvidar la última sección
  if (currentSection !== null) {
    const isWine = WINE_SECTION_KEYWORDS.some(k => currentSection.includes(k));
    const isExcluded = EXCLUDE_SECTION_KEYWORDS.some(k => currentSection.includes(k));
    if (isWine && !isExcluded) {
      result.push(currentHtml);
    }
  }

  return result.join('\n');
}

function parseTable(tableHtml) {
  const wines = [];
  const rows = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];

  let headers = null;
  let nameCol = 0;
  let efectivoCol = -1;
  let precioCol = -1;   // columna genérica "PRECIO" (Vinos de Añada)
  let unidadesCol = -1;

  for (const row of rows) {
    // Detectar si es th (encabezado)
    const isHeader = /<th\b/i.test(row);
    const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []).map(c => stripHtml(c));

    if (cells.length < 2) continue;

    if (isHeader) {
      headers = cells.map(c => c.toLowerCase());
      efectivoCol = -1; precioCol = -1; unidadesCol = -1;
      // Detectar columnas por nombre
      headers.forEach((h, i) => {
        if (h.includes('efectivo') || h.includes('contado')) efectivoCol = i;
        else if (h.includes('unidad') || h.includes('caja')) unidadesCol = i;
        else if (h === '' || h.includes('nombre') || h.includes('vino') || h.includes('producto')) nameCol = i;
        // Columna "PRECIO" genérica (sin "efectivo" ni "tarjeta") → Vinos de Añada
        else if (h.trim() === 'precio') precioCol = i;
      });
      continue;
    }

    const nombre = cells[nameCol] || '';
    if (!nombre || nombre.length < 3) continue;
    // Filtrar encabezados que puedan aparecer como data rows
    if (['nombre', 'vino', 'producto', 'descripcion', 'efectivo', 'tarjeta'].includes(nombre.toLowerCase())) continue;
    // Filtrar promociones
    if (nombre.toLowerCase().includes('llevando') || nombre.includes('$') || nombre.toLowerCase().includes('nuevo')) continue;

    // Precio: "Precio Efectivo x Unidad" > "PRECIO" > columna 1 por posición
    const precio = efectivoCol >= 0 ? parsePrice(cells[efectivoCol])
                 : precioCol   >= 0 ? parsePrice(cells[precioCol])
                 : parsePrice(cells[1]);
    const unidades = unidadesCol >= 0 ? (parseInt(cells[unidadesCol]) || null) : null;

    if (!precio || precio < 500) continue;

    wines.push({
      nombre,
      bodega: extractBodega(nombre),
      cepa: extractCepa(nombre),
      region: extractRegion(nombre) || 'Mendoza',
      linea: '',
      precio,
      unidades_caja: unidades,
      notas: '',
    });
  }

  return wines;
}

async function scrapeMpDrinks() {
  console.log('[MP Drinks] Descargando lista de precios...');
  const html = await fetchHtml(URL);

  const wineHtml = extractWineSections(html);
  const tableMatches = wineHtml.match(/<table[\s\S]*?<\/table>/gi) || [];
  console.log(`[MP Drinks] Tablas de vinos encontradas: ${tableMatches.length}`);

  let wines = [];
  for (const table of tableMatches) {
    wines.push(...parseTable(table));
  }

  // Deduplicar por nombre
  const seen = new Set();
  wines = wines.filter(w => {
    if (seen.has(w.nombre)) return false;
    seen.add(w.nombre);
    return true;
  });

  console.log(`[MP Drinks] ${wines.length} vinos importados`);
  return wines;
}

module.exports = { scrapeMpDrinks };

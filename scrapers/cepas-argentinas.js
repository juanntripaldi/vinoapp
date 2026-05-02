const https = require('https');

const SHEET_ID = '1f4B9GSCIO4MYXbWJajblHjt2oruy_DDoeEFt9bftzJU';
const GID = '0';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

function parsePrice(str) {
  if (!str) return null;
  // Formato argentino: "$22.000,00" → 22000
  const cleaned = String(str)
    .replace(/\$/g, '')
    .replace(/\./g, '')       // miles
    .replace(',', '.')        // decimal
    .trim();
  const num = parseFloat(cleaned.replace(/[^\d.]/g, ''));
  return isNaN(num) ? null : num;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Seguir redirect manualmente
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.split('\n');
  const wines = [];

  // Buscar la fila de encabezados reales
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('bodega') && lower.includes('nombre')) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    console.error('[Cepas Argentinas] No se encontraron encabezados reconocibles');
    return [];
  }

  const headers = parseCSVLine(lines[headerIdx]).map(h => h.toLowerCase().trim());
  console.log('[Cepas Argentinas] Columnas:', headers);

  // Índices de columnas
  const iBody = headers.findIndex(h => h.includes('bodega'));
  const iNom  = headers.findIndex(h => h.includes('nombre'));
  const iCepa = headers.findIndex(h => h.includes('cepa'));
  const iPrecio = headers.findIndex(h => h.includes('precio'));
  const iZona = headers.findIndex(h => h.includes('zona'));
  const iObs  = headers.findIndex(h => h.includes('observ') || h.includes('obs'));

  let lastBodega = '';

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const get = (idx) => (idx >= 0 && cols[idx] ? cols[idx].trim() : '');

    const bodega  = get(iBody);
    const nombre  = get(iNom);
    const cepa    = get(iCepa);
    const precio  = get(iPrecio);
    const zona    = get(iZona);
    const obs     = get(iObs);

    // Actualizar bodega actual si está presente (quitar "NUEVO" y variantes)
    if (bodega) lastBodega = bodega.replace(/\s*NUEVO[!.]?\s*/gi, '').trim();

    // Solo agregar si tiene nombre de vino
    if (!nombre) continue;

    wines.push({
      nombre,
      bodega: lastBodega,
      cepa,
      region: zona,
      linea: '',
      precio_efectivo: parsePrice(precio),
      precio_tarjeta: null,
      unidades_caja: null,
      notas: obs,
    });
  }

  return wines;
}

async function scrapeCepasArgentinas() {
  console.log('[Cepas Argentinas] Descargando Google Sheet...');
  try {
    const { status, data } = await fetchUrl(CSV_URL);

    if (status !== 200) {
      throw new Error(`HTTP ${status}. El Google Sheet debe ser público: Compartir → Cualquier persona con el enlace → Lector`);
    }

    const wines = parseCSV(data);
    console.log(`[Cepas Argentinas] ${wines.length} vinos importados`);
    return wines;
  } catch (err) {
    console.error('[Cepas Argentinas] Error:', err.message);
    throw err;
  }
}

module.exports = { scrapeCepasArgentinas };

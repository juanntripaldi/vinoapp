require('dotenv').config();
const express = require('express');
const path = require('path');
const { networkInterfaces } = require('os');
const db = require('./database');
const { scrapeCepasArgentinas } = require('./scrapers/cepas-argentinas');
const { scrapeMpDrinks } = require('./scrapers/mp-drinks');
const { scrapeRustico } = require('./scrapers/rustico');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── API: Lista de vinos con filtros ─────────────────────────────────────────
app.get('/api/wines', (req, res) => {
  try {
    const wines = db.getWines(req.query);
    res.json(wines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Opciones únicas para filtros ───────────────────────────────────────
app.get('/api/options', (req, res) => {
  try {
    res.json(db.getOptions());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Actualizar fuente de datos ─────────────────────────────────────────
app.post('/api/update', async (req, res) => {
  const { source } = req.body;
  const results = {};

  const sources = source === 'all'
    ? ['cepas_argentinas', 'mp_drinks', 'rustico']
    : [source];

  for (const src of sources) {
    try {
      let wines = [];
      if (src === 'cepas_argentinas') wines = await scrapeCepasArgentinas();
      else if (src === 'mp_drinks')   wines = await scrapeMpDrinks();
      else if (src === 'rustico')      wines = await scrapeRustico();

      await db.saveWines(src, wines);
      results[src] = { success: true, count: wines.length };
    } catch (err) {
      results[src] = { success: false, error: err.message };
    }
  }

  res.json({ success: true, results });
});

// ─── API: Estadísticas para dashboard ────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  try {
    res.json(db.getStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Chat con IA ─────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(400).json({
      error: 'ANTHROPIC_API_KEY no configurada. Copiá .env.example como .env y agregá tu clave de https://console.anthropic.com/'
    });
  }

  const { message, history = [] } = req.body;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const wines = db.getAllForChat(400);
    const wineContext = JSON.stringify(wines);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: `Sos un consultor de vinos experto que ayuda a armar pedidos para una vinoteca/distribuidora.

LISTA ACTUAL DE VINOS (${wines.length} vinos de 3 proveedores):
${wineContext}

Proveedores:
- "cepas_argentinas" = Cepas Argentinas
- "mp_drinks" = MP Drinks
- "rustico" = Rústico

Tu trabajo:
1. Ayudar a armar pedidos según presupuesto, ocasión, cantidad de personas, preferencias
2. Comparar precios entre proveedores para el mismo vino o estilo
3. Recomendar vinos según perfil (cepa, región, precio)
4. Calcular totales y cantidades (ej: "para 50 personas, 1 botella cada 3 personas = 17 botellas")
5. Sugerir combinaciones y maridajes

Siempre:
- Especificá el proveedor y el precio (efectivo y tarjeta si aplica)
- Armá listas ordenadas y claras cuando recomendés pedidos
- Usá $ argentinos
- Respondé en español rioplatense, amigable y profesional
- Si no hay vinos cargados, avisalo y sugerí actualizar la base de datos`,
      messages: [
        ...history.slice(-10),
        { role: 'user', content: message }
      ],
    });

    res.json({ response: response.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Precio de mercado ───────────────────────────────────────────────────
app.post('/api/market-price', async (req, res) => {
  try {
    const { key, price } = req.body;
    if (!key) return res.status(400).json({ error: 'key requerida' });
    await db.setMarketPrice(key, price == null || price === '' ? null : parseFloat(price));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Historial de cambios ────────────────────────────────────────────────
app.get('/api/history', (req, res) => {
  try {
    res.json(db.getHistory(300));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Favoritos ───────────────────────────────────────────────────────────
app.get('/api/favorites', (_req, res) => {
  res.json(db.getFavorites());
});

app.post('/api/favorites', async (req, res) => {
  try {
    const fav = await db.addFavorite(req.body);
    res.json(fav);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/favorites/:id', async (req, res) => {
  try {
    await db.patchFavorite(parseInt(req.params.id), req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/favorites/:id', async (req, res) => {
  try {
    await db.removeFavorite(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Vistas guardadas ────────────────────────────────────────────────────
app.get('/api/views', (_req, res) => {
  res.json(db.getViews());
});

app.post('/api/views', async (req, res) => {
  try {
    const view = await db.addView(req.body);
    res.json(view);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/views/:id', async (req, res) => {
  try {
    await db.removeView(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Cotizaciones ────────────────────────────────────────────────────────
app.get('/api/quotes', (_req, res) => {
  res.json(db.getQuotes());
});

app.post('/api/quotes', async (req, res) => {
  try {
    const quote = await db.addQuote(req.body);
    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/quotes/:id', async (req, res) => {
  try {
    await db.removeQuote(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Clientes ────────────────────────────────────────────────────────────
app.get('/api/clients', (_req, res) => {
  res.json(db.getClients());
});

app.post('/api/clients', async (req, res) => {
  try {
    const client = await db.addClient(req.body);
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/clients/:id', async (req, res) => {
  try {
    await db.updateClientById(parseInt(req.params.id), req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    await db.deleteClientById(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Pedidos ─────────────────────────────────────────────────────────────
app.get('/api/orders', (req, res) => {
  try {
    res.json(db.getOrders(req.query));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const order = await db.addOrder(req.body);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/orders/:id', async (req, res) => {
  try {
    await db.updateOrderById(parseInt(req.params.id), req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    await db.deleteOrderById(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Estado de las fuentes ───────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  try {
    res.json(db.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Auto-importación en startup si la BD está vacía ─────────────────────────
async function autoImportIfEmpty() {
  const stats = db.getStats();
  if (stats.total_vinos > 0) return;

  console.log('\n  Base de datos vacía, importando datos automáticamente...');
  const sourceFns = {
    cepas_argentinas: scrapeCepasArgentinas,
    mp_drinks:        scrapeMpDrinks,
    rustico:          scrapeRustico,
  };

  for (const [src, fn] of Object.entries(sourceFns)) {
    try {
      const wines = await fn();
      await db.saveWines(src, wines);
      console.log(`  ✓ ${src}: ${wines.length} vinos importados`);
    } catch (err) {
      console.warn(`  ✗ ${src}: ${err.message}`);
    }
  }
  console.log('  Importación completada.\n');
}

// ─── Inicio del servidor ──────────────────────────────────────────────────────
db.init().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    let localIP = null;
    let tailscaleIP = null;
    try {
      const nets = networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family !== 'IPv4' || net.internal) continue;
          if (net.address.startsWith('100.')) {
            tailscaleIP = net.address;
          } else if (!localIP) {
            localIP = net.address;
          }
        }
      }
    } catch {}

    console.log('\n====================================');
    console.log('   VINOAPP - Lista de Precios');
    console.log('====================================');
    console.log(`\n  Computadora:  http://localhost:${PORT}`);
    if (localIP)     console.log(`  WiFi local:   http://${localIP}:${PORT}`);
    if (tailscaleIP) console.log(`  Tailscale:    http://${tailscaleIP}:${PORT}`);
    else             console.log(`  Tailscale:    (no detectado)`);
    console.log('\n  Presioná Ctrl+C para detener\n');

    autoImportIfEmpty();
  });
}).catch(err => {
  console.error('\n  ✗ Error al iniciar:', err.message);
  process.exit(1);
});

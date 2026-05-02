const db = require('./database');
const { scrapeCepasArgentinas } = require('./scrapers/cepas-argentinas');
const { scrapeMpDrinks } = require('./scrapers/mp-drinks');
const { scrapeRustico } = require('./scrapers/rustico');

(async () => {
  const sources = [
    ['cepas_argentinas', scrapeCepasArgentinas],
    ['mp_drinks', scrapeMpDrinks],
    ['rustico', scrapeRustico],
  ];

  for (let i = 0; i < sources.length; i++) {
    const [src, fn] = sources[i];
    console.log(`[${i+1}/${sources.length}] ${src}...`);
    try {
      const wines = await fn();
      db.saveWines(src, wines);
    } catch (e) {
      console.error(`ERROR en ${src}:`, e.message);
    }
  }

  // Stats finales
  const all = db.getWines({});
  const bodegas = new Set(all.filter(w => w.bodega).map(w => w.bodega));
  const cepas   = new Set(all.filter(w => w.cepa).map(w => w.cepa));
  const paises  = new Set(all.filter(w => w.pais).map(w => w.pais));
  const sinBodega = all.filter(w => !w.bodega).length;
  const sinCepa  = all.filter(w => !w.cepa).length;

  console.log('\n=== RESULTADO FINAL ===');
  console.log(`Total vinos : ${all.length}`);
  console.log(`Bodegas     : ${bodegas.size}`);
  console.log(`Cepas       : ${cepas.size} -> ${[...cepas].sort().join(', ')}`);
  console.log(`Países      : ${paises.size} -> ${[...paises].sort().join(', ')}`);
  console.log(`Sin bodega  : ${sinBodega}`);
  console.log(`Sin cepa    : ${sinCepa}`);

  // Muestra Rústico
  const rustico = all.filter(w => w.fuente === 'rustico').slice(0, 5);
  console.log('\nMuestra Rústico (5 vinos):');
  for (const w of rustico) {
    console.log(` | ${w.nombre} | bodega: ${w.bodega} | cepa: ${w.cepa} | min: ${w.min_unidades}`);
  }

  // Verificar bodegas deduplicadas
  console.log('\nBodegas deduplicadas (buscar Yacochuya):');
  const yacos = [...bodegas].filter(b => /yaco/i.test(b));
  yacos.forEach(b => console.log(b));
})();

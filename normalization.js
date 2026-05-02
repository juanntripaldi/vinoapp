/**
 * Módulo de normalización de datos de vinos.
 * Exporta: normalizeRegion, normalizeCepa, inferBodega, cleanBodega
 */
const path = require('path');
const fs   = require('fs');

// ─── Cargar archivos de referencia ───────────────────────────────────────────

const CEPAS_REF   = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/cepas_ref.json'),   'utf8'));
const GEO         = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/geography.json'),   'utf8'));

// Índice alias→canonical para cepas (todo en minúsculas)
const CEPA_INDEX = {};
for (const entry of CEPAS_REF) {
  for (const alias of entry.aliases) {
    CEPA_INDEX[alias.toLowerCase().trim()] = entry.canonical;
  }
  // el canonical también se mapea a sí mismo
  CEPA_INDEX[entry.canonical.toLowerCase().trim()] = entry.canonical;
}

// Sets para lookup rápido de países y provincias
const PAISES_SET     = new Set(GEO.paises.map(p => p.toLowerCase()));
const PROVINCIAS_SET = new Set(GEO.provincias_argentina.map(p => p.toLowerCase()));

// ─── CEPA ────────────────────────────────────────────────────────────────────

/** Palabras que identifican ruido NO cepa */
const NOISE_RE = /^(\d{2,4}([,\-/]\d{2,4})+|\d{4}|\d+\s*cc|\d+\s*bot|años\s+\d|sin\s+intervencion|elaborado|partida|edicion|con estuche|estuche|estuche de madera|caja de madera|coleccion|assamblage \d|vertical|coupage de barricas|coupage|crianza biologica|nueva añada|tardio|sidra|amber ale|purgatorio|apostador|inseparable|jackot|judas|barrabas|magdalena|biu|biolento|impo|bestial|biuti|guapo|claret|varios|variedad|varietal|varios|mezcla de tintas|sin puno|solera|blend de añadas|uvas chilenas)$/i;

/**
 * Normaliza una cepa al nombre canónico.
 * Retorna '' si no reconoce la cepa.
 */
function normalizeCepa(str) {
  if (!str) return '';
  let s = str.trim();

  // Quitar prefijos de porcentaje "100%", "97%malbec" → dejamos el resto
  s = s.replace(/^\d+%\s*puro\s*/i, '').replace(/^\d+%\s*/i, '').replace(/^puro\s+/i, '');
  // Quitar porcentajes internos: "87% Malbec 13% C Franc" → "Malbec C Franc"
  s = s.replace(/\b\d+%\s*/g, '');
  // Quitar años solos: "2018", "2017,2018"
  s = s.replace(/\b\d{4}([,\-]\d{2,4})*\b/g, '').replace(/^\d{2}([,\-]\d{2})+$/, '');
  // Quitar volúmenes
  s = s.replace(/\b\d+\s*cc\b/gi, '').replace(/\b\d+\s*bot\b.*/gi, '');
  // Limpiar espacios
  s = s.replace(/\s+/g, ' ').trim();

  if (!s || s.length < 2) return '';

  // Comprobar si es ruido puro
  if (NOISE_RE.test(s.toLowerCase())) return '';

  const lower = s.toLowerCase();

  // Búsqueda exacta en índice
  if (CEPA_INDEX[lower]) return CEPA_INDEX[lower];

  // Búsqueda parcial: si el lower CONTIENE un alias conocido (más largo primero)
  const aliases = Object.keys(CEPA_INDEX).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    if (alias.length >= 4 && lower.includes(alias)) {
      return CEPA_INDEX[alias];
    }
  }

  // No reconocida → vacío
  return '';
}

// ─── REGIÓN ──────────────────────────────────────────────────────────────────

/**
 * Mapa de regiones exactas (lowercase) → { subzona, zona, provincia, pais }
 */
const REGION_MAP = {
  // ── Mendoza · Luján de Cuyo ──
  'agrelo':                           { subzona: 'Agrelo',              zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'agrelo lujan de cuyo':             { subzona: 'Agrelo',              zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'agrelo mendoza':                   { subzona: 'Agrelo',              zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'alto agrelo mendoza':              { subzona: 'Agrelo',              zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'vistalba lujan de cuyo':           { subzona: 'Vistalba',            zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'lujan de cuyo vistalba':           { subzona: 'Vistalba',            zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'perdriel lujan de cuyo':           { subzona: 'Perdriel',            zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'perdriel mendoza':                 { subzona: 'Perdriel',            zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'ugarteche':                        { subzona: 'Ugarteche',           zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'ugarteche mendoza':                { subzona: 'Ugarteche',           zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'las compuertas':                   { subzona: 'Las Compuertas',      zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'compuertas mendoza':               { subzona: 'Las Compuertas',      zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'chacras de coria':                 { subzona: 'Chacras de Coria',    zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'lujan de cuyo':                    { subzona: '',                    zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'lujan de cuyo mendoza':            { subzona: '',                    zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'jujan de cuyo':                    { subzona: '',                    zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'cordon plata':                     { subzona: 'Cordón Plata',        zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  'paraje san luis':                  { subzona: 'Paraje San Luis',     zona: 'Luján de Cuyo',    provincia: 'Mendoza' },
  // ── Mendoza · Maipú ──
  'maipu mendoza':                    { subzona: '',                    zona: 'Maipú',             provincia: 'Mendoza' },
  'lunlunta maipu':                   { subzona: 'Lunlunta',            zona: 'Maipú',             provincia: 'Mendoza' },
  'lunlunta mendoza':                 { subzona: 'Lunlunta',            zona: 'Maipú',             provincia: 'Mendoza' },
  'cruz de piedra maipu':             { subzona: 'Cruz de Piedra',      zona: 'Maipú',             provincia: 'Mendoza' },
  'barrancas maipu':                  { subzona: 'Barrancas',           zona: 'Maipú',             provincia: 'Mendoza' },
  'orfila junin mendoza':             { subzona: 'Orfila',              zona: 'Maipú',             provincia: 'Mendoza' },
  'montecaseros san martin':          { subzona: 'Montecaseros',        zona: 'San Martín',        provincia: 'Mendoza' },
  'san martin mendoza':               { subzona: '',                    zona: 'San Martín',        provincia: 'Mendoza' },
  'rivadavia mendoza':                { subzona: '',                    zona: 'Rivadavia',         provincia: 'Mendoza' },
  'medrano mendoza':                  { subzona: 'Medrano',             zona: 'San Martín',        provincia: 'Mendoza' },
  // ── Mendoza · Valle de Uco ──
  'valle de uco':                     { subzona: '',                    zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'valle  de uco':                    { subzona: '',                    zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'valle de uco mendoza':             { subzona: '',                    zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'mendoza tunuyan':                  { subzona: '',                    zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'tunuyan':                          { subzona: '',                    zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'tunuyan mendoza':                  { subzona: '',                    zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'tupungato':                        { subzona: '',                    zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'tupungato mendoza':                { subzona: '',                    zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'tupungato y zampal':               { subzona: 'Tupungato',           zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'finca vidal tupuingato mendoza':   { subzona: 'Tupungato',           zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'anchoris tupungato':               { subzona: 'Anchoris',            zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'gualtallary':                      { subzona: 'Gualtallary',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'gualtallary - uco':                { subzona: 'Gualtallary',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'gualtallary mendoza':              { subzona: 'Gualtallary',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'gualtellary':                      { subzona: 'Gualtallary',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'gualta mendoza':                   { subzona: 'Gualtallary',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'gualta uco valley':                { subzona: 'Gualtallary',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'gualtallary/monasteri':            { subzona: 'Gualtallary',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'el peral':                         { subzona: 'El Peral',            zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'el peral mendoza':                 { subzona: 'El Peral',            zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'el peral tupungato':               { subzona: 'El Peral',            zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'el peral y gualta':                { subzona: 'El Peral / Gualtallary', zona: 'Valle de Uco',   provincia: 'Mendoza' },
  'la carrera tupungato':             { subzona: 'La Carrera',          zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'san jose tupungato':               { subzona: 'San José',            zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'altamira':                         { subzona: 'Paraje Altamira',     zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'altamira mendoza':                 { subzona: 'Paraje Altamira',     zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'paraje altamira':                  { subzona: 'Paraje Altamira',     zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'paraje altamira mendoza':          { subzona: 'Paraje Altamira',     zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'la consulta':                      { subzona: 'La Consulta',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'la consulta mendoza':              { subzona: 'La Consulta',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'la consulta uco':                  { subzona: 'La Consulta',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'la consulta - uco':                { subzona: 'La Consulta',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'la consulta / russel':             { subzona: 'La Consulta',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'la consulta-uco':                  { subzona: 'La Consulta',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'la consulta  el cepillo':          { subzona: 'La Consulta / El Cepillo', zona: 'Valle de Uco', provincia: 'Mendoza' },
  'la consulta y altamira':           { subzona: 'La Consulta / Paraje Altamira', zona: 'Valle de Uco', provincia: 'Mendoza' },
  'chacayes':                         { subzona: 'Los Chacayes',        zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'chacayes mendoza':                 { subzona: 'Los Chacayes',        zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'chacayes valle de uco':            { subzona: 'Los Chacayes',        zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'los chacayes':                     { subzona: 'Los Chacayes',        zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'los chacayes - uco':               { subzona: 'Los Chacayes',        zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'los chacayes tunuyan':             { subzona: 'Los Chacayes',        zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'los chacayes valle de uco':        { subzona: 'Los Chacayes',        zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'chacayes y lunlunta':              { subzona: 'Los Chacayes / Lunlunta', zona: 'Valle de Uco',  provincia: 'Mendoza' },
  'lunlunta y chacayes':              { subzona: 'Los Chacayes / Lunlunta', zona: 'Valle de Uco',  provincia: 'Mendoza' },
  'sauces y chacayes uco':            { subzona: 'Los Chacayes',        zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'el cepillo':                       { subzona: 'El Cepillo',          zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'el cepillo mendoza':               { subzona: 'El Cepillo',          zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'el cepillo uco':                   { subzona: 'El Cepillo',          zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'el cepillo valle de uco':          { subzona: 'El Cepillo',          zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'mendoza cepillo':                  { subzona: 'El Cepillo',          zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'pampa el cepillo':                 { subzona: 'El Cepillo',          zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'cordon el cepillo':                { subzona: 'El Cepillo',          zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'vista flores':                     { subzona: 'Vista Flores',        zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'vista flores mendoza':             { subzona: 'Vista Flores',        zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'vistaflores mendoza':              { subzona: 'Vista Flores',        zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'san pablo':                        { subzona: 'San Pablo',           zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'san pablo mendoza':                { subzona: 'San Pablo',           zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'san pablo tunuyan':                { subzona: 'San Pablo',           zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'san pablo valle de uco':           { subzona: 'San Pablo',           zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'ig san pablo':                     { subzona: 'San Pablo',           zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'los arboles tunuyan':              { subzona: 'Los Árboles',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'los arboles tunuyan mendoza':      { subzona: 'Los Árboles',         zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'villa seca valle de uco':          { subzona: 'Villa Seca',          zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'las carreras':                     { subzona: 'Las Carreras',        zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'pucara /san carlos':               { subzona: 'Valle de Pucará',     zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'valle de pucara':                  { subzona: 'Valle de Pucará',     zona: 'Valle de Uco',      provincia: 'Mendoza' },
  'cafayate y tupungato':             { subzona: 'Multi-Zona',          zona: 'Valle de Uco',      provincia: 'Mendoza' },
  // ── Mendoza · general ──
  'mendoza':                          { subzona: '',                    zona: '',                  provincia: 'Mendoza' },
  'alvear mendoza':                   { subzona: 'Alvear',              zona: 'San Rafael',        provincia: 'Mendoza' },
  'san rafael':                       { subzona: '',                    zona: 'San Rafael',        provincia: 'Mendoza' },
  'san rafael mendoza':               { subzona: '',                    zona: 'San Rafael',        provincia: 'Mendoza' },
  'el challao mendoza':               { subzona: 'El Challao',          zona: 'Las Heras',         provincia: 'Mendoza' },
  'desierto de lavalle':              { subzona: 'Lavalle',             zona: 'Lavalle',           provincia: 'Mendoza' },
  'villa tulumaya , lavalle mendoza': { subzona: 'Villa Tulumaya',      zona: 'Lavalle',           provincia: 'Mendoza' },
  'este de mendoza':                  { subzona: '',                    zona: 'Este de Mendoza',   provincia: 'Mendoza' },
  'las 4 zonas':                      { subzona: 'Multi-Zona',          zona: 'Mendoza',           provincia: 'Mendoza' },
  // ── Salta ──
  'salta':                            { subzona: '',                    zona: 'Valles Calchaquíes', provincia: 'Salta' },
  'cafayate':                         { subzona: 'Cafayate',            zona: 'Valles Calchaquíes', provincia: 'Salta' },
  'cafayate salta':                   { subzona: 'Cafayate',            zona: 'Valles Calchaquíes', provincia: 'Salta' },
  'finca el recreo cafayate':         { subzona: 'Cafayate',            zona: 'Valles Calchaquíes', provincia: 'Salta' },
  'molinos cafayate salt':            { subzona: 'Molinos',             zona: 'Valles Calchaquíes', provincia: 'Salta' },
  'molinos salta':                    { subzona: 'Molinos',             zona: 'Valles Calchaquíes', provincia: 'Salta' },
  'angastaco salta':                  { subzona: 'Angastaco',           zona: 'Valles Calchaquíes', provincia: 'Salta' },
  'quebrada de angastaco':            { subzona: 'Angastaco',           zona: 'Valles Calchaquíes', provincia: 'Salta' },
  'cachi salta':                      { subzona: 'Cachi',               zona: 'Valles Calchaquíes', provincia: 'Salta' },
  'payogasta cachi':                  { subzona: 'Payogasta',           zona: 'Valles Calchaquíes', provincia: 'Salta' },
  'tolombon':                         { subzona: 'Tolombón',            zona: 'Valles Calchaquíes', provincia: 'Salta' },
  'tolombon salta':                   { subzona: 'Tolombón',            zona: 'Valles Calchaquíes', provincia: 'Salta' },
  'alto valle calchaqui':             { subzona: 'Alto Valle Calchaquí', zona: 'Valles Calchaquíes', provincia: 'Salta' },
  'valle calchaqui salta':            { subzona: '',                    zona: 'Valles Calchaquíes', provincia: 'Salta' },
  'valles calchaquies':               { subzona: '',                    zona: 'Valles Calchaquíes', provincia: 'Salta' },
  // ── San Juan ──
  'san juan':                         { subzona: '',                    zona: '',                  provincia: 'San Juan' },
  'pedernal':                         { subzona: 'Pedernal',            zona: 'Pedernal',          provincia: 'San Juan' },
  'pedernal san juan':                { subzona: 'Pedernal',            zona: 'Pedernal',          provincia: 'San Juan' },
  'perdernal san juan':               { subzona: 'Pedernal',            zona: 'Pedernal',          provincia: 'San Juan' },
  'valle pedernal san juan':          { subzona: 'Pedernal',            zona: 'Pedernal',          provincia: 'San Juan' },
  'valle del pedernal':               { subzona: 'Pedernal',            zona: 'Pedernal',          provincia: 'San Juan' },
  'barreal san juan':                 { subzona: 'Barreal',             zona: 'Calingasta',        provincia: 'San Juan' },
  'san juan calingasta':              { subzona: 'Calingasta',          zona: 'Calingasta',        provincia: 'San Juan' },
  'calinga':                          { subzona: 'Calingasta',          zona: 'Calingasta',        provincia: 'San Juan' },
  'lacienaga zonda san juan':         { subzona: 'Zonda',               zona: 'Zonda',             provincia: 'San Juan' },
  'san juan valle de tulum':          { subzona: '',                    zona: 'Valle de Tulum',    provincia: 'San Juan' },
  // ── Neuquén ──
  'neuquen':                          { subzona: '',                    zona: '',                  provincia: 'Neuquén' },
  'san patrico del chañar':           { subzona: 'San Patricio del Chañar', zona: 'San Patricio del Chañar', provincia: 'Neuquén' },
  'chañar/neuquen':                   { subzona: 'San Patricio del Chañar', zona: 'San Patricio del Chañar', provincia: 'Neuquén' },
  'ribera del cuarzo patagonia':      { subzona: 'Ribera del Cuarzo',   zona: 'Neuquén',           provincia: 'Neuquén' },
  // ── Río Negro ──
  'rio negro':                        { subzona: '',                    zona: 'Alto Valle del Río Negro', provincia: 'Río Negro' },
  'rio negro ,mainque':               { subzona: 'Mainque',             zona: 'Alto Valle del Río Negro', provincia: 'Río Negro' },
  'mainque rio negro':                { subzona: 'Mainque',             zona: 'Alto Valle del Río Negro', provincia: 'Río Negro' },
  'gral roca rio negro':              { subzona: 'Gral. Roca',          zona: 'Alto Valle del Río Negro', provincia: 'Río Negro' },
  'valle azul rio negro':             { subzona: 'Valle Azul',          zona: 'Alto Valle del Río Negro', provincia: 'Río Negro' },
  'patagonia':                        { subzona: '',                    zona: '',                  provincia: 'Patagonia' },
  'chubut patagonia':                 { subzona: '',                    zona: '',                  provincia: 'Chubut' },
  'trevelin':                         { subzona: 'Trevelin',            zona: 'Trevelin',          provincia: 'Chubut' },
  // ── La Rioja ──
  'la rioja':                         { subzona: '',                    zona: '',                  provincia: 'La Rioja' },
  'chilecito mendoza':                { subzona: 'Chilecito',           zona: 'Chilecito',         provincia: 'La Rioja' },
  // ── Jujuy / NOA ──
  'jujuy':                            { subzona: '',                    zona: '',                  provincia: 'Jujuy' },
  'san salvador de jujuy':            { subzona: 'San Salvador de Jujuy', zona: 'Quebrada de Humahuaca', provincia: 'Jujuy' },
  'q - humahuaca':                    { subzona: 'Quebrada de Humahuaca', zona: 'Quebrada de Humahuaca', provincia: 'Jujuy' },
  'quebrada de humahuaca':            { subzona: 'Quebrada de Humahuaca', zona: 'Quebrada de Humahuaca', provincia: 'Jujuy' },
  'pumamarca':                        { subzona: 'Purmamarca',          zona: 'Quebrada de Humahuaca', provincia: 'Jujuy' },
  'quebrada de san luca':             { subzona: 'San Lucas',           zona: 'NOA',               provincia: 'Jujuy' },
  'quebrada de san luis':             { subzona: '',                    zona: 'NOA',               provincia: 'Jujuy' },
  'noa':                              { subzona: '',                    zona: 'NOA',               provincia: '' },
  // ── Tucumán / Catamarca ──
  'colacao del valle .calchaquies':   { subzona: 'Colalao del Valle',   zona: 'Valles Calchaquíes', provincia: 'Tucumán' },
  'colacao del valle tucuman':        { subzona: 'Colalao del Valle',   zona: 'Valles Calchaquíes', provincia: 'Tucumán' },
  'catamarca':                        { subzona: '',                    zona: '',                  provincia: 'Catamarca' },
  'quebrada de hualfin':              { subzona: 'Quebrada de Hualfín', zona: 'Belén',             provincia: 'Catamarca' },
  // ── Córdoba / Buenos Aires ──
  'cordoba':                          { subzona: '',                    zona: '',                  provincia: 'Córdoba' },
  'chapadmalal':                      { subzona: 'Chapadmalal',         zona: 'General Pueyrredon', provincia: 'Buenos Aires' },
  // ── Multi-Provincia ──
  'cuyo':                             { subzona: '',                    zona: '',                  provincia: 'Cuyo' },
  'argentina':                        { subzona: '',                    zona: '',                  provincia: '' },
  'mendoza y salta':                  { subzona: '',                    zona: '',                  provincia: 'Mendoza / Salta' },
  'salta y mendoza':                  { subzona: '',                    zona: '',                  provincia: 'Mendoza / Salta' },
  'mendoza/cordoba':                  { subzona: '',                    zona: '',                  provincia: 'Mendoza / Córdoba' },
  'salta-mendoza-patagonia':          { subzona: '',                    zona: '',                  provincia: '' },
  'molinos/gualtallary':              { subzona: 'Molinos / Gualtallary', zona: 'Multi-Zona',     provincia: 'Salta / Mendoza' },
  // ── Internacional ──
  'bordeaux francia':                 { subzona: 'Bordeaux',            zona: 'Bordeaux',          pais: 'Francia' },
  'chile':                            { subzona: '',                    zona: '',                  pais: 'Chile' },
  'colchagua chile':                  { subzona: 'Valle de Colchagua',  zona: 'Valle de Colchagua', pais: 'Chile' },
  'itata/chile':                      { subzona: 'Valle del Itata',     zona: 'Valle del Itata',   pais: 'Chile' },
  'valle de casablanca':              { subzona: 'Valle de Casablanca', zona: 'Valle de Casablanca', pais: 'Chile' },
  'eeuu indian wells':                { subzona: 'Indian Wells',        zona: 'California',        pais: 'EEUU' },
  'eeuu washington':                  { subzona: '',                    zona: 'Washington',        pais: 'EEUU' },
  'españa':                           { subzona: '',                    zona: '',                  pais: 'España' },
  'galicia españa':                   { subzona: 'Galicia',             zona: 'Galicia',           pais: 'España' },
  'la rioja españa':                  { subzona: '',                    zona: 'La Rioja',          pais: 'España' },
  'rioja españa':                     { subzona: '',                    zona: 'La Rioja',          pais: 'España' },
  'francia':                          { subzona: '',                    zona: '',                  pais: 'Francia' },
  'francia provance':                 { subzona: 'Provenza',            zona: 'Provenza',          pais: 'Francia' },
  'italia':                           { subzona: '',                    zona: '',                  pais: 'Italia' },
  'italia veneto':                    { subzona: '',                    zona: 'Veneto',            pais: 'Italia' },
  'italia/puglia':                    { subzona: '',                    zona: 'Puglia',            pais: 'Italia' },
  'italia/sicilia':                   { subzona: '',                    zona: 'Sicilia',           pais: 'Italia' },
  'la toscana italia':                { subzona: '',                    zona: 'Toscana',           pais: 'Italia' },
  'torino italia':                    { subzona: 'Turín',               zona: 'Piamonte',          pais: 'Italia' },
  'nueva zelanda':                    { subzona: '',                    zona: '',                  pais: 'Nueva Zelanda' },
  'uruguay':                          { subzona: '',                    zona: '',                  pais: 'Uruguay' },
  // ── Datos inválidos ──
  'xxxxxxxxxxxxxxxxxxx':              { subzona: '',                    zona: '',                  provincia: '' },
};

/**
 * Determina si una cadena es un país extranjero (no Argentina).
 */
function esPaisExtranjero(str) {
  const lower = str.toLowerCase().trim();
  return PAISES_SET.has(lower) && lower !== 'argentina';
}

/**
 * Normaliza región → { subzona, zona, provincia, pais }
 */
function normalizeRegion(str) {
  if (!str) return { subzona: '', zona: '', provincia: '', pais: 'Argentina' };
  const key = str.trim().toLowerCase();
  const found = REGION_MAP[key];

  if (found) {
    // Si el mapa ya define pais explícitamente (entradas internacionales)
    if (found.pais) {
      return {
        subzona:   found.subzona  || '',
        zona:      found.zona     || '',
        provincia: '',
        pais:      found.pais,
      };
    }
    // Entrada argentina: pais=Argentina por defecto
    return {
      subzona:   found.subzona  || '',
      zona:      found.zona     || '',
      provincia: found.provincia || '',
      pais:      found.provincia ? 'Argentina' : '',
    };
  }

  // Fallback: ver si el string mismo es un país conocido
  if (esPaisExtranjero(key)) {
    return { subzona: '', zona: '', provincia: '', pais: str.trim() };
  }

  // Fallback genérico: tratar como provincia argentina desconocida
  return { subzona: '', zona: '', provincia: str.trim(), pais: 'Argentina' };
}

// ─── BODEGA ──────────────────────────────────────────────────────────────────

/**
 * Sufijos a eliminar de nombres de bodega para deduplicar.
 * "Yacochuya Cosecha Nueva" → "Yacochuya"
 */
const BODEGA_SUFFIX_RE = /\s+(cosecha\s+nueva|nueva\s+cosecha|nueva\s+añada|añada\s+\d+|añada|cosecha\s+\d+|\d{4}|nuevo[!.]?|new|edicion\s+limitada|ed\.\s*lim\.?)$/i;

/**
 * Limpia sufijos que generan duplicados en bodegas.
 */
function cleanBodega(str) {
  if (!str) return str;
  let s = str.trim();
  // Aplicar hasta que no haya más sufijos
  let prev;
  do {
    prev = s;
    s = s.replace(BODEGA_SUFFIX_RE, '').trim();
  } while (s !== prev);
  return s;
}

/**
 * Lista de bodegas conocidas, ordenadas de más larga a más corta.
 * Incluye las que estaban sin bodega en la importación anterior.
 */
const BODEGAS_LIST = [
  // Ampliadas para cubrir los ~650 sin bodega (especialmente MP Drinks y Rústico)
  'Achaval Ferrer', 'Altos Las Hormigas', 'Alta Vista', 'Alma Negra',
  'Alfredo Roca', 'Angelica Zapata', 'Angelica', 'Angelo Mattei',
  'Antes y Despues', 'Andeluna', 'Alpamanta', 'Alpasion', 'Antucura',
  'Arcayaco', 'Atamisque', 'Baron B', 'Bemberg', 'Blanchard y Lurton',
  'Bodega Luca', 'Bodega Septima', 'Bodega Sottano', 'Bodega Flichman',
  'Bodega Norton', 'Bodega Bianchi', 'Bodega Zuccardi', 'Bodega Catena',
  'Bramare', 'Bressia', 'Canopus', 'Cara Sur', 'Cara Sucia', 'Carinae',
  'Casa Boher', 'Casa de Uco', 'Casarena', 'Catena Zapata', 'Catena',
  'Cheval Des Andes', 'Cheval des Andes', 'Cinco Sentidos',
  'Clandestino Hugo Gottardini', 'Claro Oscuro', 'Clos de los 7',
  'Clos de los Siete', 'Clos Dechacras', 'Colome', 'Corazon del Sol',
  'Corvus', 'Cruzat', 'Cuatro Gatos Locos', '4 Gatos Locos',
  'Cuvelier Los Andes', 'Cuvelier', 'Dante Robino', 'De Angeles',
  'Del Rio Elorza', 'Diamandes', 'Domaine Bousquet', 'Domaine Nico',
  'Domingo Molina', 'Dominio de Freneza', 'Don Manuel Villafañe',
  'Dona Paula', 'Doña Paula', 'Durigutti', 'El Enemigo', 'El Porvenir',
  'Elefante Wines', 'Enrique Foster', 'Escala Humana', 'Escarlata',
  'Escorihuela Gascon', 'Escorihuela', 'Fabre Montmayou', 'Falasco',
  'Familia Cassone', 'Familia Deicas', 'Familia Mastrantonio',
  'Familia Miras', 'Familia Zuccardi', 'Fernando Dupont',
  'Finca Ambrosia', 'Finca Bandini', 'Finca Cosmos', 'Finca Decero',
  'Finca Flichman', 'Finca Las Moras', 'Finca la Anita',
  'Finca las Glicinas', 'Finca Sophenia', 'Finca Suarez',
  'Finca Rio Las Arcas', 'Fuego Blanco', 'Garzon', 'Gascon', 'Gascón',
  'Gen del Alma', 'Grazie Mille', 'Humberto Canale', 'Imatorras',
  'Inculto', 'Inimaginable Wines', 'Kaiken', 'Kantaka', 'Killka',
  'Krontiras', 'La Azul', 'La Cayetana', 'La Coste de los Andes',
  'Las Estelas', 'Las Perdices', 'Laureano Gomez', 'Leo Erazo Wines',
  'Les Astronautes', 'Lorenzo de Agrelo', 'Los Bisole', 'Los Chocos',
  'Los Dragones', 'Los Noques', 'Luca', 'Lui Wines', 'Luigi Bosca',
  'Lupawines', 'Lurton Piedra Negra', 'Lurton',
  'Maal Wines', 'Macollo', 'Magna Montis', 'Malabarista',
  'Manos Negras', 'Marcelo Pelleriti', 'Marchiori & Barraud',
  'Marques de Caceres', 'Mascota', 'Matervini', 'Matias Riccitelli',
  'Mendel', 'Michelini', 'Mil Suelos', 'Miraluna', 'Montes Alpha',
  'Montesco', 'Monteviejo', 'Mundo Reves', 'Nieto Senetiner',
  'Noemia', 'Norton', 'Odre', 'Onofri Wines', 'Otaviano', 'Otronia',
  'Paco Puga', 'Pajarito Amichu', 'Pascual Toso', 'Paso a Paso',
  'Pedro Parra', 'Pelusa Maradona', 'Perse', 'Philippe Caraguel',
  'Phillippe Caraguel', 'Piattelli', 'Pielihueso', 'Pulenta',
  'Puramun Wines', 'Pyros', 'Qaramy', 'Raquis', 'Renacer',
  'Revancha', 'Ricominciare', 'Riglos', 'Rocamadre', 'Rolland',
  'Rutini', 'Salentein', 'Santa Julia', 'Santa Ana', 'Schroeder',
  'Seclantas Adentro', 'Sierra Lima Alfa', 'Sin Reglas Wines',
  'Slow Wines', 'Sofakingbueno', 'Solocontigo', 'Solito Va',
  'Superuco', 'Susana Balbo', 'Suspiro del Viento', 'Tacuil',
  'Tajungapul Wines', 'Tapiz', 'Teho', 'Tekendama', 'Tempus Alba',
  'Terra Camiare', 'Tikal', 'Tinto Negro', 'Tordos', 'Trapezio',
  'Trapiche', 'Trivento', 'Tukma', 'Tupun', 'Universo Vigil',
  'Valle Arriba', 'Vallisto', 'Ver Sacrum', 'Via Revolucionaria',
  'Vinos del Mono', 'Vinyes Ocults', 'Vivo o Muerto',
  'Viña Alicia', 'Viña Cobos', 'Viña las Perdices', 'Viñedos Imposibles',
  'Vizcacha Wines', 'Wine & Art', 'Wine y Circo',
  'Yacochuya', 'Yanay', 'Zorzal', 'Zuccardi',
  // Bodegas frecuentes en Rústico y MP Drinks sin bodega asignada
  'A Lisa', 'A la Par', 'Abremundos', 'Aicardi', 'Aime',
  'Alandes', 'Alfa Crux', 'Alpataco', 'Altimus', 'Altocedro',
  'Amalaya', 'Alma Mora', 'Alaris', 'Alamos', 'Adrianna',
  'Anaia', 'Antropo', 'Apepa', 'Argento', 'Aristides', 'Aruma',
  'Atigrado', 'Avarizza', 'Barroco', 'Bianchi', 'Biplano', 'Bira',
  'Cantina No Tradicional', 'Caro', 'Chacra', 'Chacho',
  'Chañar Punco', 'Chañarmuyo', 'Comahue', 'Conscientemente',
  'Contra Corriente', 'Correntoso', 'De Moño Rojo', 'Desquiciado',
  'Dualismo', 'Domiciano', 'Equilibrio Imperfecto',
  'Finca Beth', 'Finca Camuñas', 'Gualiana',
  'Homo Felix', 'Huarpe', 'Huentala', 'Juan Ubaldini',
  'Lamadrid', 'Maipe', 'Mevi', 'Nat Cool', 'Nido de Tigre',
  'Nina', 'Nodo', 'Pastoral', 'Patritti', 'Piensa',
  'Proyecto Circulares', 'Pucara', 'Rincon de los Leones',
  'Saint Claire Wines', 'Sarapura', 'Septima', 'Séptima',
  'Thibaut Delmontte', 'Altos de Medrano', 'Clos de Chacras',
  'Melipal', 'La Rural', 'Las Perdices', 'Michel Torino',
  'Arizitides', 'Clos Mayor', 'Antonieta', 'Las Moras',
  'Finca Las Moras', 'El Esteco', 'Cuma', 'Amphora',
  'Clos de los Siete', 'Monteviejo', 'Rolland', 'Cuvelier',
  'Chateau Margaux', 'Terrazas', 'Terrazas de los Andes',
  'La Consulta', 'Achaval', 'Noemia', 'Noemia', 'Chacra',
  'Humberto Canale', 'Familia Schroeder', 'Schroeder',
  'Familia Bianchi', 'Bianchi', 'Clase Azul', 'Club Tapiz',
  'Amphora Wines', 'Finca El Origen', 'El Origen',
  'Santiago Graffigna', 'Graffigna', 'Callia',
  'Pircas Negras', 'Chimpa', 'Aniello',
  'Familia Cecchin', 'Cecchin', 'Carmelo Patti', 'Patti',
  '13/20', 'Cuatro Gatos', 'Altas Cumbres', 'Finca Flichman',
  'Chakana', 'Chakana Wines', 'Luca Wines', 'Brander',
  'Poesia', 'Achaval Ferrer', 'Caro Catena',
  'Nieto', 'Nieto Senetiner', 'Zaha', 'Huarpe',
  'Carlos Pulenta', 'Pulenta Estate', 'Gran Lurton',
  'Clos de Siete', 'Clos du Siete',
  // Bodegas frecuentes en Rústico sin bodega asignada
  'Alma Mater', 'Altar Uco', 'Alta Yari', 'Altaland', 'Altaluvia',
  'Bodegas Lopez', 'Lopez', 'Bodegas Esmeralda', 'Esmeralda',
  'Bodegas El Porvenir', 'Bodegas Callia', 'Bodegas La Rosa',
  'Arizitides Wines', 'Bruno Nebbia', 'Nebbia',
  'Clos Mayor', 'Clos de Chacras',
  'Cuvee Louise', 'Coppola', 'Cuatro Elementos',
  'Dante Robino', 'Del Fin del Mundo', 'Fin del Mundo',
  'El Esteco', 'El Principal', 'El Enemigo', 'El Porvenir',
  'Ecos de Raza', 'Enkii', 'Entre Rios', 'Eral Bravo',
  'Familia Schroeder', 'Familia Bonjour', 'Faraon',
  'Finca El Origen', 'El Origen', 'Finca Vitivinícola',
  'Flor de Cardon', 'Flor de Cardon',
  'Gimenez Riili', 'Gimenez Mendez', 'Giordano',
  'Guarda Pampa', 'Haras de Pirque', 'Huarpe',
  'Infinito', 'Intimo',
  'Jean Bousquet', 'Jost Wines', 'Juan de Dios',
  'La Celia', 'La Consulta', 'La Linda', 'La Posta',
  'Lagarde', 'Laur', 'Lavaque', 'Lazo',
  'Leoncio Arizu', 'Lito Cruz', 'Lo Tengo',
  'Los Haroldos', 'Los Intocables', 'Los Ríos',
  'Lycos', 'Maiten', 'Manos de Mujeres',
  'Mayorquin', 'Michelini', 'Mil Suelos',
  'Monje Correas', 'Monje', 'Monteviejo',
  'Mosquita Muerta', 'Movi', 'Mundus Bacillus',
  'Nieto Sentiner', 'Nocturno', 'Nqn',
  'Otronia', 'Oveja Negra', 'Oxalis',
  'Palo a Pique', 'Palo Alto', 'Paradigma',
  'Paraje Altamira', 'Pasarela', 'Pedrera',
  'Pedro Parra y Familia', 'Pegar La Vuelta',
  'Peñaflor', 'Perini', 'Petite Fleur',
  'Piamonte', 'Picaro', 'Pircas Negras',
  'Primativo', 'Proemio', 'Proyecto Uno',
  'Quara', 'Quimera',
  'Raices', 'Ramon Bilbao', 'Raza',
  'Revana', 'Rio Elorza', 'Rio los Sauces',
  'Salentein', 'Santiago Graffigna', 'Graffigna',
  'Saurus', 'Secreto Patagonico', 'Seta',
  'Siesta', 'Silvio Carta', 'Sin Filtrar',
  'Sol de Andes', 'Sottano', 'Sur de los Andes',
  'Tamari', 'Tango', 'Tannat Wines',
  'Tilia', 'Tobiano', 'Toro Viejo',
  'Trivento', 'Tres Cruces', 'Trevi',
  'Uco Valley Wines', 'Ukika', 'Uvas de Altura',
  'Valentin Bianchi', 'Versado', 'Via Revolucionaria',
  'Vientos Alisios', 'Villa El Cerne',
  'Winecology', 'Xumek',
].sort((a, b) => b.length - a.length);

/**
 * Intenta inferir bodega del nombre del vino.
 */
function inferBodega(nombre) {
  if (!nombre) return '';
  const lower = nombre.toLowerCase();
  for (const bodega of BODEGAS_LIST) {
    if (lower.includes(bodega.toLowerCase())) return bodega;
  }
  return '';
}

module.exports = { normalizeRegion, normalizeCepa, inferBodega, cleanBodega, BODEGAS_LIST, CEPAS_REF };

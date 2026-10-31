// Pruebas de la lista de espera contra el EMULADOR de Firestore (nunca produccion).
// Correr:  firebase emulators:exec --only firestore --project demo-lista "node pruebas/lista-espera.test.cjs"
const LE = require('../lista-espera.js');
const crypto = require('crypto');
const P = 'demo-lista';
const BASE = 'http://127.0.0.1:8187';
const DOCS = `projects/${P}/databases/(default)/documents`;
const cfg = { projectId: P, apiKey: 'llave-falsa' };   // el emulador ignora la llave
let ok = 0, mal = 0;
const caso = (nombre, cond, extra) => { if (cond) { ok++; console.log('  OK  ' + nombre); } else { mal++; console.log('  MAL ' + nombre + (extra ? '  -> ' + extra : '')); } };
const hash = c => crypto.createHash('sha256').update(c).digest('hex');
const commit = (writes, owner) => fetch(`${BASE}/v1/${DOCS}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(owner ? { Authorization: 'Bearer owner' } : {}) }, body: JSON.stringify({ writes }) });
const alta = (id, fields, transform = true) => commit([{ update: { name: `${DOCS}/lista_espera/${id}`, fields }, ...(transform ? { updateTransforms: [{ fieldPath: 'creado', setToServerValue: 'REQUEST_TIME' }] } : {}), currentDocument: { exists: false } }]);
const negado = async (pr) => { const r = await pr; const t = await r.text(); return r.status === 403 || /PERMISSION_DENIED/.test(t) ? true : `${r.status} ${t.slice(0, 120)}`; };
const F = (c, a = true) => ({ correo: { stringValue: c }, acepto: { booleanValue: a } });

(async () => {
  console.log('Cliente (lista-espera.js):');
  caso('correo valido se anota', (await LE.anotar('ana@ejemplo.com', { config: cfg, base: BASE })) === 'ok');
  caso('mayusculas y espacios se guardan normalizados', (await LE.anotar('  LUIS@Ejemplo.COM ', { config: cfg, base: BASE })) === 'ok');
  caso('dos ids seguidos son distintos y de 64 hex', (() => { const a = LE.idAlAzar(crypto.webcrypto), b = LE.idAlAzar(crypto.webcrypto); return a !== b && /^[a-f0-9]{64}$/.test(a); })());
  caso('correo sin arroba -> invalido (no sale a la red)', (await LE.anotar('ana.ejemplo.com', { config: cfg, base: BASE })) === 'invalido');
  caso('vacio -> invalido', (await LE.anotar('', { config: cfg, base: BASE })) === 'invalido');
  caso('sin proyecto configurado -> "cerrada"', (await LE.anotar('b@ejemplo.com', { config: { projectId: '' }, base: BASE })) === 'cerrada');
  caso('sin llave (apiKey vacia) -> "cerrada"', (await LE.anotar('b@ejemplo.com', { config: { projectId: P, apiKey: '' }, base: BASE })) === 'cerrada');
  caso('red que nunca responde -> "error" al vencer el tiempo limite', (await LE.anotar('d@ejemplo.com', { config: cfg, base: BASE, espera: 300, fetch: () => new Promise(() => {}) })) === 'error');
  caso('servidor caido -> "error" sin lanzar', (await LE.anotar('c@ejemplo.com', { config: cfg, base: 'http://127.0.0.1:1' })) === 'error');

  console.log('Reglas, saltandose la pagina (como lo haria un atacante):');
  const idB = hash('beto@ejemplo.com');
  let v;
  v = await negado(alta(idB, { ...F('beto@ejemplo.com'), extra: { stringValue: 'x' } })); caso('campo de mas', v === true, v);
  v = await negado(alta(idB, { correo: { stringValue: 'beto@ejemplo.com' } })); caso('sin consentimiento', v === true, v);
  v = await negado(alta(idB, F('beto@ejemplo.com', false))); caso('consentimiento en false', v === true, v);
  v = await negado(alta(idB, { ...F('beto@ejemplo.com'), creado: { timestampValue: '2020-01-01T00:00:00Z' } }, false)); caso('fecha puesta por el navegador', v === true, v);
  v = await negado(alta('no-es-hash', F('beto@ejemplo.com'))); caso('id que no es sha256', v === true, v);
  v = await negado(alta(idB, F('BETO@ejemplo.com'))); caso('correo con mayusculas', v === true, v);
  v = await negado(alta(idB, F('a'.repeat(250) + '@x.com'))); caso('correo de mas de 254', v === true, v);
  v = await negado(alta(idB, { correo: { integerValue: '5' }, acepto: { booleanValue: true } })); caso('correo que no es texto', v === true, v);
  v = await negado(alta(idB, F('<script>@x.com'))); caso('correo con caracteres raros', v === true, v);
  for (const c of ['+1-@a.co', '-x@a.co', '.@a.co', '%@a.co']) { v = await negado(alta(hash(c), F(c))); caso('correo que empieza con simbolo (Excel lo leeria como formula): ' + c, v === true, v); }
  caso('el cliente tambien rechaza +cmd@a.co', !LE.esValido('+cmd@a.co'));
  caso('correos normales con punto, guion y + siguen pasando', ['luis.p+tag@sub.dominio.com.mx', 'a_b-c@x-y.co', '1@a.co'].every(c => LE.esValido(c)));
  const lista0 = await (await fetch(`${BASE}/v1/${DOCS}/lista_espera`, { headers: { Authorization: 'Bearer owner' } })).json();
  const docAna = (lista0.documents || []).find(d => d.fields.correo.stringValue === 'ana@ejemplo.com');
  const idAna = docAna ? docAna.name.split('/').pop() : 'x'.repeat(64);
  v = await negado(alta(idAna, F('ana@ejemplo.com'))); caso('crear encima de un id que ya existe (no revela nada: se niega)', v === true || /FAILED_PRECONDITION|^409 /.test(String(v)), v);
  v = await negado(fetch(`${BASE}/v1/${DOCS}/lista_espera/${idAna}`)); caso('leer un registro', v === true, v);
  v = await negado(fetch(`${BASE}/v1/${DOCS}/lista_espera`)); caso('listar la lista', v === true, v);
  v = await negado(fetch(`${BASE}/v1/${DOCS}:runQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'lista_espera' }] } }) })); caso('consultar la lista', v === true, v);
  v = await negado(commit([{ update: { name: `${DOCS}/lista_espera/${idAna}`, fields: F('otro@ejemplo.com') }, updateTransforms: [{ fieldPath: 'creado', setToServerValue: 'REQUEST_TIME' }] }])); caso('cambiar un registro existente', v === true, v);
  v = await negado(commit([{ delete: `${DOCS}/lista_espera/${idAna}` }])); caso('borrar un registro', v === true, v);
  v = await negado(commit([{ update: { name: `${DOCS}/otra/x`, fields: F('x@ejemplo.com') } }])); caso('escribir en otra coleccion', v === true, v);
  v = await negado(commit([{ update: { name: `${DOCS}/lista_espera/${hash('z@ejemplo.com')}/sub/x`, fields: F('z@ejemplo.com') } }])); caso('escribir en una subcoleccion', v === true, v);

  console.log('Lo que quedo guardado (leido como dueno del emulador):');
  const g = await (await fetch(`${BASE}/v1/${DOCS}/lista_espera/${idAna}`, { headers: { Authorization: 'Bearer owner' } })).json();
  caso('correo en minusculas', g.fields && g.fields.correo.stringValue === 'ana@ejemplo.com', JSON.stringify(g).slice(0, 150));
  caso('consentimiento true', g.fields && g.fields.acepto.booleanValue === true);
  caso('fecha del servidor', g.fields && !!g.fields.creado.timestampValue);
  caso('solo tres campos', g.fields && Object.keys(g.fields).length === 3);
  const todos = await (await fetch(`${BASE}/v1/${DOCS}/lista_espera`, { headers: { Authorization: 'Bearer owner' } })).json();
  caso('solo los dos registros legitimos (nada de los ataques)', (todos.documents || []).length === 2, (todos.documents || []).length);
  caso('el de mayusculas quedo en minusculas', (todos.documents || []).some(d => d.fields.correo.stringValue === 'luis@ejemplo.com'));

  console.log(`\n${ok} bien, ${mal} mal`);
  process.exit(mal ? 1 : 0);
})();

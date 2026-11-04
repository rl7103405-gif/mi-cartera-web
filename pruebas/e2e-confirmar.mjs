// La pagina de confirmar la lista de espera, en Chrome de verdad contra el EMULADOR (nunca produccion), con su CSP y las reglas de firestore.rules.
// Correr desde la raiz del repo:
//   firebase emulators:exec --only firestore --project demo-lista "node pruebas/e2e-confirmar.mjs"
// Capturas (opcional): CAPTURAS=capturas node ... deja PNG a 1440 y 390 px.
import { chromium } from 'file:///C:/Users/elita/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const RAIZ = resolve('.');
const EMU = 'http://127.0.0.1:8187', P = 'demo-lista', DOCS = `projects/${P}/databases/(default)/documents`;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const pedidosSitio = [];
const srv = http.createServer(async (req, res) => {
  pedidosSitio.push(req.url);
  const archivo = join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!archivo.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  try { const b = await readFile(archivo); res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => srv.once('listening', r));
const SITIO = `http://127.0.0.1:${srv.address().port}/confirmar.html`;

let ok = 0, mal = 0;
const caso = (n, c, x) => { if (c) { ok++; console.log('  OK  ' + n); } else { mal++; console.log('  MAL ' + n + (x !== undefined ? '  -> ' + x : '')); } };
const OWN = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const sembrar = (token, estado = 'pendiente', dias = 30) => fetch(`${EMU}/v1/${DOCS}/confirmaciones/${token}`, { method: 'PATCH', headers: OWN, body: JSON.stringify({ fields: {
  lista: { stringValue: 'x'.repeat(64) }, estado: { stringValue: estado }, caduca: { timestampValue: new Date(Date.now() + dias * 86400000).toISOString() } } }) });
const leer = async token => { const j = await (await fetch(`${EMU}/v1/${DOCS}/confirmaciones/${token}`, { headers: OWN })).json(); return j.fields || {}; };

const nav = await chromium.launch({ channel: 'chrome' });
const errores = [], aFuera = [];
async function abrir(fragmento, { ancho = 390, cortarRed } = {}) {
  const ctx = await nav.newContext({ viewport: { width: ancho, height: ancho > 800 ? 900 : 844 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const estado = { cortar: cortarRed, cuerpos: [] };
  page.on('console', m => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|status of 40[34]/.test(m.text())) errores.push(m.text()); });
  page.on('pageerror', e => errores.push(String(e)));
  page.on('request', r => { const u = new URL(r.url()); if (u.hostname !== '127.0.0.1') aFuera.push(u.hostname); });
  await page.route('https://firestore.googleapis.com/**', async route => {
    if (estado.cortar) return route.abort('internetdisconnected');
    estado.cuerpos.push(route.request().postData());
    const u = new URL(route.request().url());
    const r = await fetch(EMU + u.pathname, { method: route.request().method(), headers: { 'Content-Type': 'application/json' }, body: route.request().postData() });
    route.fulfill({ status: r.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: await r.text() });
  });
  await page.goto(SITIO + fragmento, { waitUntil: 'load' });
  await page.evaluate(p => { window.ListaEspera.CONFIG.projectId = p; window.ListaEspera.CONFIG.apiKey = 'llave-de-prueba'; }, P);
  return { ctx, page, estado };
}
const T1 = 'a'.repeat(64), T2 = 'b'.repeat(64), T3 = 'c'.repeat(64), T4 = 'd'.repeat(64);
for (const t of [T1, T2, T3, T4]) await sembrar(t);
await sembrar('e'.repeat(64), 'pendiente', -1);

console.log('Confirmar:');
{
  const { ctx, page, estado } = await abrir(`#t=${T1}&a=confirmar`);
  caso('dice qué va a pasar', (await page.locator('#c-titulo').textContent()).includes('Confirma'));
  caso('el botón dice qué hace', (await page.locator('#c-boton').textContent()) === 'Sí, sigo interesado');
  await page.waitForTimeout(300);
  caso('abrir la página NO confirma: los escáneres de correo abren ligas', (await leer(T1)).estado.stringValue === 'pendiente' && !estado.cuerpos.length);
  caso('el token no le llega al servidor de la página (va en el fragmento)', !pedidosSitio.some(u => u.includes(T1)));
  const caja = await page.locator('#c-boton').boundingBox();
  caso('botón de al menos 44 px', caja.height >= 44, caja.height);
  await page.click('#c-boton');
  await page.waitForFunction(() => document.getElementById('c-titulo').textContent.startsWith('Listo'));
  const f = await leer(T1);
  caso('con el botón queda confirmado, con hora del servidor', f.estado.stringValue === 'confirmado' && !!f.respondida);
  caso('el botón desaparece', await page.locator('#c-boton').isHidden());
  caso('no manda nada de más', JSON.parse(estado.cuerpos[0]).writes.length === 1 && JSON.parse(estado.cuerpos[0]).writes[0].updateMask.fieldPaths.join() === 'estado');
  caso('a 390 no se desborda', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await ctx.close();
}
console.log('Baja:');
{
  const { ctx, page } = await abrir(`#t=${T2}&a=baja`);
  caso('dice que es darse de baja', (await page.locator('#c-titulo').textContent()).includes('baja') && (await page.locator('#c-boton').textContent()) === 'Sí, darme de baja');
  await page.click('#c-boton');
  await page.waitForFunction(() => document.getElementById('c-titulo').textContent.startsWith('Listo'));
  caso('queda de baja', (await leer(T2)).estado.stringValue === 'baja');
  await ctx.close();
  const b = await abrir(`#t=${T2}&a=confirmar`);
  await b.page.click('#c-boton');
  await b.page.waitForFunction(() => document.getElementById('c-titulo').textContent.includes('ya no se puede'));
  caso('la liga de confirmar ya no la deshace', (await leer(T2)).estado.stringValue === 'baja');
  caso('y lo dice, sin botón', await b.page.locator('#c-boton').isHidden());
  await b.ctx.close();
}
console.log('Ligas que no sirven:');
for (const [frag, nombre] of [['', 'sin fragmento'], ['#t=corto', 'token corto'], ['#t=<img src=x onerror=alert(1)>', 'con HTML']]) {
  const { ctx, page } = await abrir(frag);
  caso(nombre + ': dice que no sirve y no hay botón', (await page.locator('#c-titulo').textContent()).includes('no sirve') && await page.locator('#c-boton').isHidden());
  await ctx.close();
}
{
  const { ctx, page } = await abrir(`#t=${'e'.repeat(64)}`);
  caso('sin accion en la liga: es confirmar', (await page.locator('#c-boton').textContent()) === 'Sí, sigo interesado');
  await page.click('#c-boton');
  await page.waitForFunction(() => document.getElementById('c-titulo').textContent.includes('ya no se puede'));
  caso('vencida: no confirma y lo dice', (await leer('e'.repeat(64))).estado.stringValue === 'pendiente');
  await ctx.close();
}
console.log('Sin red:');
{
  const { ctx, page, estado } = await abrir(`#t=${T3}&a=confirmar`, { cortarRed: true });
  await page.click('#c-boton');
  await page.waitForFunction(() => document.getElementById('c-estado').textContent.startsWith('No se pudo'));
  caso('avisa y deja reintentar', await page.locator('#c-boton').isVisible() && (await leer(T3)).estado.stringValue === 'pendiente');
  estado.cortar = false;
  await page.click('#c-boton');
  await page.waitForFunction(() => document.getElementById('c-titulo').textContent.startsWith('Listo'));
  caso('al volver la señal, confirma', (await leer(T3)).estado.stringValue === 'confirmado');
  await ctx.close();
}
if (process.env.CAPTURAS) {
  await mkdir(process.env.CAPTURAS, { recursive: true });
  for (const ancho of [1440, 390]) {
    const { ctx, page } = await abrir(`#t=${T4}&a=confirmar`, { ancho });
    await page.screenshot({ path: join(process.env.CAPTURAS, `confirmar-${ancho}.png`) });
    await ctx.close();
  }
}
caso('sin errores de consola ni de CSP', !errores.length, errores.join(' | '));
caso('no sale a ningún otro sitio', aFuera.every(h => h === 'firestore.googleapis.com'), aFuera.join());
await nav.close();
srv.close();
console.log(`\n${mal ? mal + ' MAL de ' + (ok + mal) : 'TODO BIEN ' + ok + '/' + ok}`);
process.exit(mal ? 1 : 0);

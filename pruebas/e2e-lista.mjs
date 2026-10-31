// La forma de la lista de espera en Chrome de verdad, contra el EMULADOR (nunca produccion).
// Las peticiones a firestore.googleapis.com se desvian al emulador, asi se prueba la pagina real con su CSP.
// Correr desde la raiz del repo:
//   firebase emulators:exec --only firestore --project demo-lista "node pruebas/e2e-lista.mjs"
// Capturas (opcional): CAPTURAS=capturas node ... deja PNG a 1440 y 390 px.
import { chromium } from 'file:///C:/Users/elita/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const RAIZ = resolve('.');
const EMU = 'http://127.0.0.1:8187';
const P = 'demo-lista';
const DOCS = `projects/${P}/databases/(default)/documents`;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const archivo = join(RAIZ, ruta.endsWith('/') ? ruta + 'index.html' : ruta);
  if (!archivo.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  try { const b = await readFile(archivo); res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(8124);
const SITIO = 'http://127.0.0.1:8124/';

let ok = 0, mal = 0;
const caso = (n, c, x) => { if (c) { ok++; console.log('  OK  ' + n); } else { mal++; console.log('  MAL ' + n + (x !== undefined ? '  -> ' + x : '')); } };
const contar = async () => ((await (await fetch(`${EMU}/v1/${DOCS}/lista_espera`, { headers: { Authorization: 'Bearer owner' } })).json()).documents || []);

const nav = await chromium.launch({ channel: 'chrome' });   // el Chrome instalado (como las demas pruebas)
const errores = [];
async function abrir(ancho, conProyecto, cortarRed, colgarRed) {
  const ctx = await nav.newContext({ viewport: { width: ancho, height: ancho > 800 ? 900 : 844 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', e => errores.push(String(e)));
  await page.route('https://firestore.googleapis.com/**', async route => {
    if (cortarRed) return route.abort('internetdisconnected');
    if (colgarRed) return;   // la ruta nunca responde
    const u = new URL(route.request().url());
    const r = await fetch(EMU + u.pathname, { method: route.request().method(), headers: { 'Content-Type': 'application/json' }, body: route.request().postData() });
    route.fulfill({ status: r.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: await r.text() });
  });
  await page.goto(SITIO, { waitUntil: 'load' });
  if (conProyecto) await page.evaluate(p => { window.ListaEspera.CONFIG.projectId = p; window.ListaEspera.CONFIG.apiKey = 'llave-de-prueba'; }, P);
  await page.locator('#forma').scrollIntoViewIfNeeded();
  return { ctx, page };
}
const enviar = async (page, correo, acepto) => {
  await page.fill('#f-correo', correo);
  if (acepto) await page.check('#f-acepto'); else await page.uncheck('#f-acepto');
  await page.click('#f-enviar');
  // espera a que termine: o sale el "listo" o un error, nunca un tiempo fijo
  await page.waitForFunction(() => !document.getElementById('f-gracias').hidden || !document.getElementById('f-error').hidden, null, { timeout: 8000 }).catch(() => {});
};

console.log('Sin proyecto configurado:');
{ const { ctx, page } = await abrir(1440, false);
  await enviar(page, 'ana@ejemplo.com', true);
  caso('avisa que la lista aun no esta abierta', /todavía no está abierta/.test(await page.textContent('#f-error')));
  caso('no se guardo nada', (await contar()).length === 0);
  await ctx.close(); }

console.log('Con proyecto (emulador), escritorio:');
{ const { ctx, page } = await abrir(1440, true);
  await enviar(page, 'ana@', true);
  caso('correo incompleto: error visible', !(await page.isHidden('#f-error')) && /correo completo/.test(await page.textContent('#f-error')));
  caso('correo incompleto: el campo queda marcado y con el foco', (await page.getAttribute('#f-correo', 'aria-invalid')) === 'true' && await page.evaluate(() => document.activeElement.id) === 'f-correo');
  await enviar(page, 'ana@ejemplo.com', false);
  caso('sin aceptar el aviso: lo pide', /aviso de privacidad/.test(await page.textContent('#f-error')));
  await page.check('#f-acepto');
  caso('al corregir, el error se quita solo', await page.isHidden('#f-error'));
  await page.focus('#f-correo'); await page.keyboard.press('Enter');
  await page.waitForSelector('#f-gracias:not([hidden])', { timeout: 8000 }).catch(() => {});
  caso('Enter en el correo envia y sale "Ya estás en la lista"', !(await page.isHidden('#f-gracias')) && (await page.textContent('#f-gracias-correo')) === 'ana@ejemplo.com');
  const docs = await contar();
  caso('quedo UN registro en la base, en minusculas', docs.length === 1 && docs[0].fields.correo.stringValue === 'ana@ejemplo.com', JSON.stringify(docs.map(d => d.fields.correo)));
  await page.click('#f-volver');
  caso('"Anotar otro correo" regresa al campo vacio', !(await page.isHidden('#f-campos')) && (await page.inputValue('#f-correo')) === '');
  // robot: llena la trampa
  await page.evaluate(() => { document.getElementById('f-ref').value = 'http://spam.example'; });
  await enviar(page, 'robot@ejemplo.com', true);
  caso('robot ve el "listo"', !(await page.isHidden('#f-gracias')));
  caso('pero no se guarda nada del robot', (await contar()).length === 1);
  if (process.env.CAPTURAS) { await mkdir(process.env.CAPTURAS, { recursive: true }); await page.locator('#lugar').screenshot({ path: `${process.env.CAPTURAS}/forma-gracias-v1-1440.png` }); }
  await ctx.close(); }

console.log('Sin red:');
{ const { ctx, page } = await abrir(1440, true, true);
  await enviar(page, 'luis@ejemplo.com', true);
  caso('dice que no se pudo guardar', /No se pudo guardar/.test(await page.textContent('#f-error')));
  caso('el boton vuelve a estar activo y con su texto', (await page.getAttribute('#f-enviar', 'aria-disabled')) === null && (await page.textContent('#f-enviar')).trim() === 'Anotarme en la lista');
  caso('tras el error el foco vuelve al boton', await page.evaluate(() => document.activeElement.id) === 'f-enviar');
  await ctx.close(); }

console.log('Red que nunca responde (tiempo limite):');
{ const { ctx, page } = await abrir(1440, true, false, true);
  // la pagina usa 15 s por defecto; aqui se acorta para no esperar
  await page.evaluate(() => { const LE = window.ListaEspera, orig = LE.anotar; LE.anotar = (c, o) => orig(c, Object.assign({}, o, { espera: 1500 })); });
  await page.fill('#f-correo', 'colgado@ejemplo.com'); await page.check('#f-acepto');
  await page.click('#f-enviar');
  await page.waitForFunction(() => document.getElementById('f-enviar').getAttribute('aria-busy') === 'true', null, { timeout: 3000 }).catch(() => {});
  caso('mientras espera: "Guardando…" y aria-disabled', (await page.textContent('#f-enviar')).trim() === 'Guardando…' && (await page.getAttribute('#f-enviar', 'aria-disabled')) === 'true');
  await page.waitForFunction(() => !document.getElementById('f-error').hidden, null, { timeout: 6000 }).catch(() => {});
  caso('al vencer el limite sale el error', /No se pudo guardar/.test(await page.textContent('#f-error')));
  caso('el boton sale de "Guardando…"', (await page.textContent('#f-enviar')).trim() === 'Anotarme en la lista' && (await page.getAttribute('#f-enviar', 'aria-disabled')) === null);
  caso('no se guardo nada', (await contar()).length === 1);
  await ctx.close(); }

console.log('Telefono (390 px):');
{ const { ctx, page } = await abrir(390, true);
  const caja = await page.locator('#forma').boundingBox();
  caso('la forma cabe a lo ancho', caja && caja.x >= 0 && caja.x + caja.width <= 390, JSON.stringify(caja));
  const fuente = await page.$eval('#f-correo', e => parseFloat(getComputedStyle(e).fontSize));
  caso('el campo tiene letra de 16 px o mas (sin zoom en iPhone)', fuente >= 16, fuente);
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  caso('la pagina no se desborda de lado', ancho <= 390, ancho);
  if (process.env.CAPTURAS) await page.locator('#lugar').screenshot({ path: `${process.env.CAPTURAS}/forma-v1-390.png` });
  await enviar(page, 'zoe@ejemplo.com', true);
  caso('se anota desde el telefono', !(await page.isHidden('#f-gracias')) && (await contar()).length === 2);
  await ctx.close(); }

const csp = errores.filter(e => /Content Security Policy|Refused to/.test(e));
caso('ninguna violacion de la CSP', csp.length === 0, csp.join(' | '));
const otros = errores.filter(e => !/Content Security Policy|Refused to|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
caso('sin errores de JavaScript', otros.length === 0, otros.join(' | '));

await nav.close(); srv.close();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);

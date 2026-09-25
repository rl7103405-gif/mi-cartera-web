(() => {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const pad = n => String(n).padStart(2, '0');
  const html = document.documentElement;

  // los planes van antes que el formulario: el mensaje de WhatsApp los menciona
  const PLANES = {
    mensual: { monto: '150', per: 'al mes', nota: 'Pago mes a mes. Cancelas cuando quieras.', msg: 'el plan mensual ($150 al mes)' },
    anual: { monto: '1,440', per: 'al año', nota: 'Equivale a $120 al mes: ahorras $360 al año.', msg: 'el plan anual ($1,440 al año)' },
  };
  let plan = 'mensual', planElegido = false;

  // ── el formulario arma el mensaje de WhatsApp (funciona con o sin animación) ──
  const WA = '522216675776';
  const fNombre = $('#f-nombre'), fMsg = $('#f-msg'), fErr = $('#f-error'), fEnviar = $('#f-enviar');
  const fOtra = $('#f-app-otra'), fOtraCampo = $('#f-otra-campo'), fOtraCual = $('#f-otra-cual');
  const limpio = s => s.replace(/\s+/g, ' ').trim();
  // "otra" pregunta cuál: si no, el mensaje decía solo "otra"
  fOtra.addEventListener('change', () => { fOtraCampo.hidden = !fOtra.checked; if (fOtra.checked) fOtraCual.focus(); });
  const armar = () => {
    const nombre = limpio(fNombre.value).slice(0, 60);
    const cual = limpio(fOtraCual.value).slice(0, 60);
    const apps = $$('#f-apps input:checked').map(i => (i === fOtra && cual) ? cual : i.value);
    const msg = limpio(fMsg.value).slice(0, 400);
    let t = `Hola, soy ${nombre || '—'}. Quiero mi cartera.`;
    if (apps.length) t += `\nTengo mi dinero en: ${apps.join(', ')}.`;
    if (planElegido) t += `\nMe interesa ${PLANES[plan].msg}.`;
    if (msg) t += `\nMe gustaría saber: ${msg}`;
    // un carácter pegado roto (surrogate suelto) hace tronar encodeURIComponent
    try { fEnviar.href = `https://wa.me/${WA}?text=${encodeURIComponent(t)}`; }
    catch (e) { fEnviar.href = `https://wa.me/${WA}?text=${encodeURIComponent(t.replace(/[\uD800-\uDFFF]/g, ''))}`; }
    return nombre;
  };
  $('#forma').addEventListener('input', () => { armar(); if (limpio(fNombre.value) && !(fOtra.checked && !limpio(fOtraCual.value))) fErr.hidden = true; });
  // Enter en el nombre hace lo mismo que el botón (antes no hacía nada)
  $('#forma').addEventListener('submit', e => { e.preventDefault(); fEnviar.click(); });
  fEnviar.addEventListener('click', e => {
    if (!armar()) { e.preventDefault(); fErr.textContent = 'Escribe tu nombre para saber quién eres.'; fErr.hidden = false; fNombre.focus(); return; }
    if (fOtra.checked && !limpio(fOtraCual.value)) { e.preventDefault(); fErr.textContent = 'Escribe cuál es tu otro banco o app.'; fErr.hidden = false; fOtraCual.focus(); }
  });
  armar();

  // ── precio: mensual o anual; al pasar a anual, confeti ──────────────
  const pMensual = $('#p-mensual'), pAnual = $('#p-anual');
  // sin worker: por defecto el confeti arranca un worker desde un blob, que la CSP no permite
  const lanzarConfeti = window.confetti ? window.confetti.create(null, { resize: true, useWorker: false }) : null;
  const ponerPlan = (p, festejo) => {
    plan = p; planElegido = true;
    pMensual.setAttribute('aria-pressed', String(p === 'mensual'));
    pAnual.setAttribute('aria-pressed', String(p === 'anual'));
    $('#p-monto').textContent = PLANES[p].monto; $('#p-per').textContent = PLANES[p].per; $('#p-nota').textContent = PLANES[p].nota;
    armar();
    if (festejo && lanzarConfeti && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const k = pAnual.getBoundingClientRect();
      lanzarConfeti({ particleCount: 110, spread: 75, startVelocity: 38, ticks: 200, scalar: 0.95, zIndex: 95,
        origin: { x: (k.left + k.width / 2) / innerWidth, y: (k.top + k.height / 2) / innerHeight },
        colors: ['#a7d8b8', '#e8ebe3', '#d7b36a', '#2f6f4f'] });
    }
  };
  pMensual.addEventListener('click', () => ponerPlan('mensual', false));
  pAnual.addEventListener('click', () => ponerPlan('anual', plan !== 'anual'));
  $('#p-cta').addEventListener('click', () => { planElegido = true; armar(); });

  // ── el visor: cualquier pantalla en grande (funciona con o sin animación) ──
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tactil = () => matchMedia('(hover: none)').matches;
  let lenis = null, capActual = 0;                 // se llenan más abajo si hay movimiento
  const visor = $('#visor'), vScroll = $('#visor-scroll'), vImg = $('#visor-img'), vTxt = $('#visor-txt'), vCerrar = $('#visor-cerrar');
  let vOrigen = null, vLista = null, vIdx = 0;
  const vNav = $('#visor-nav'), vCuenta = $('#visor-cuenta'), vAnt = $('#visor-ant'), vSig = $('#visor-sig');
  // mientras el visor está abierto, lo de atrás no se puede enfocar ni tocar (teclado y lector de pantalla)
  const fondo = [$('header'), $('main'), $('footer')];
  // Con lista (los 5 capítulos o las 18 pantallas) se puede pasar a la anterior y a la siguiente sin salir.
  const mostrar = i => {
    vIdx = (i + vLista.length) % vLista.length;
    const { src, texto } = vLista[vIdx];
    vImg.src = src; vImg.alt = 'Pantalla de Mi Cartera: ' + texto; vTxt.textContent = texto;
    vCuenta.textContent = pad(vIdx + 1) + ' / ' + pad(vLista.length);
    vScroll.scrollTop = 0;
  };
  vAnt.addEventListener('click', e => { e.stopPropagation(); mostrar(vIdx - 1); });
  vSig.addEventListener('click', e => { e.stopPropagation(); mostrar(vIdx + 1); });
  const abrirVisor = (src, texto, origen, lista, idx) => {
    vLista = lista || [{ src, texto }];
    const hay = vLista.length > 1;
    vNav.hidden = !hay; visor.classList.toggle('con-lista', hay);
    mostrar(idx || 0);
    vOrigen = origen || null;
    visor.hidden = false; vScroll.scrollTop = 0;
    fondo.forEach(el => { el.inert = true; });
    html.classList.add('visor-abierto'); lenis && lenis.stop();
    vCerrar.focus({ preventScroll: true });
    if (window.gsap && !reducido) gsap.fromTo('.visor-fig', { opacity: 0, y: 24, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'expo.out', clearProps: 'all' });
  };
  const cerrarVisor = () => {
    if (visor.hidden) return;
    visor.hidden = true; vImg.removeAttribute('src');
    fondo.forEach(el => { el.inert = false; });
    html.classList.remove('visor-abierto'); lenis && lenis.start();
    vOrigen && vOrigen.focus({ preventScroll: true });
  };
  vCerrar.addEventListener('click', e => { e.stopPropagation(); cerrarVisor(); });
  // tocar fuera de la pantalla (y de su nombre, y de las flechas) cierra
  visor.addEventListener('click', e => { if (!e.target.closest('.visor-fig, .visor-nav, .visor-arriba')) cerrarVisor(); });
  addEventListener('keydown', e => {
    if (visor.hidden) return;
    if (e.key === 'Escape') cerrarVisor();
    else if (vLista.length > 1 && e.key === 'ArrowLeft') mostrar(vIdx - 1);
    else if (vLista.length > 1 && e.key === 'ArrowRight') mostrar(vIdx + 1);
  });

  // los 5 capítulos, como lista para el visor (el teléfono grande y los chicos abren la misma)
  const CAPS = $$('.cap').map(c => ({ src: $('.mini-tel img', c).getAttribute('src'), texto: $('h2', c).textContent }));
  // el teléfono: tocarlo abre en grande la pantalla del capítulo que se está viendo
  const tel = $('#telefono');
  const abrirTel = () => abrirVisor(null, null, tel, CAPS, capActual);
  tel.addEventListener('click', abrirTel);
  tel.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirTel(); } });

  // ── las 18 pantallas de la galería (se crean siempre; sin animación quedan en rejilla) ──
  const PANTALLAS = ['Todo tu dinero', 'Dónde está', 'Cuentas y tarjetas', 'Movimientos', 'Seis meses de historia',
    'Suscripciones', 'Las que encuentra sola', 'Categorías', 'Tus inversiones', 'Lo que gana y lo que pierde',
    'Proyección a 30 años', 'El fondo de la universidad', 'El cierre del mes', 'Cómo vas contra ti',
    'A dónde se va', 'Quién te debe', 'Tu calificación', 'Tus metas'];
  const capaCartas = $('#cartas');
  const LISTA = PANTALLAS.map((texto, i) => ({ src: `assets/grandes/${pad(i + 1)}.webp`, texto }));
  const cartas = PANTALLAS.map((nombre, i) => {
    const el = document.createElement('div');
    el.className = 'carta'; el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Ver en grande: ' + nombre);
    el.innerHTML = `<div class="carta-in"><div class="cara frente"><img src="assets/tarjetas/${pad(i + 1)}.webp" alt="" loading="lazy">` +
                   `<span class="etiqueta">${nombre}</span></div>` +
                   `<div class="cara reverso"><span class="mono">${pad(i + 1)}</span><b>${nombre}</b>` +
                   `<small>${tactil() ? 'Tócala otra vez para verla en grande' : 'Haz clic para verla en grande'}</small></div></div>`;
    const abrir = () => abrirVisor(null, null, el, LISTA, i);
    // Con mouse, pasar encima la voltea y el clic la abre. En el carrusel del
    // celular el nombre ya se ve abajo de cada una: un toque la abre, igual que
    // los teléfonos de arriba. Solo en el arco con dedo (tableta) se voltea primero.
    el.addEventListener('click', () => {
      if (!tactil() || !html.classList.contains('fijo')) { abrir(); return; }
      if (el.classList.contains('volteada')) { el.classList.remove('volteada'); abrir(); return; }
      cartas.forEach(c => c.el.classList.remove('volteada'));
      el.classList.add('volteada');
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
    capaCartas.appendChild(el);
    return { el, x: 0, y: 0, r: 0, s: 0.4, o: 0, vx: 0, vy: 0, vr: 0, vs: 0, vo: 0 };
  });

  // ── los teléfonos chicos de cada capítulo (celular): tocarlos los abre en grande ──
  $$('.mini-tel').forEach((b, i) => b.addEventListener('click', () => abrirVisor(null, null, b, CAPS, i)));

  // ── el carrusel (celular): flechas y "3 / 18" ─────────────────────────
  const paso = () => (cartas[0].el.offsetWidth || 150) + 16;
  const galCuenta = $('#gal-cuenta'), galAnt = $('#gal-ant'), galSig = $('#gal-sig');
  const moverCarrusel = dir => capaCartas.scrollBy({ left: dir * paso(), behavior: reducido ? 'auto' : 'smooth' });
  galAnt.addEventListener('click', () => moverCarrusel(-1));
  galSig.addEventListener('click', () => moverCarrusel(1));
  const cuentaCarrusel = () => {
    const i = Math.max(0, Math.min(PANTALLAS.length - 1, Math.round(capaCartas.scrollLeft / paso())));
    galCuenta.textContent = pad(i + 1) + ' / ' + PANTALLAS.length;
    galAnt.disabled = i === 0; galSig.disabled = i === PANTALLAS.length - 1;   // en las orillas no hay a dónde ir
  };
  capaCartas.addEventListener('scroll', cuentaCarrusel, { passive: true });
  cuentaCarrusel();

  // ── menú del celular ──────────────────────────────────────────────────
  const menuBtn = $('#menu-btn'), menuPanel = $('#menu-panel');
  const menu = abrir => {
    menuPanel.hidden = !abrir; menuBtn.setAttribute('aria-expanded', String(abrir));
    menuBtn.setAttribute('aria-label', abrir ? 'Cerrar el menú' : 'Abrir el menú');
  };
  menuBtn.addEventListener('click', () => menu(menuPanel.hidden));
  $$('a', menuPanel).forEach(a => a.addEventListener('click', () => menu(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape' && !menuPanel.hidden) { menu(false); menuBtn.focus(); } });
  addEventListener('scroll', () => { if (!menuPanel.hidden && Math.abs(scrollY - (menu.y ?? scrollY)) > 80) menu(false); menu.y = scrollY; }, { passive: true });

  // ── "siguiente": lleva a la siguiente parte de la página ──────────────
  // Las paradas se calculan al momento (las secciones fijas cambian de alto).
  const arriba = el => el.getBoundingClientRect().top + scrollY;
  let paradas = () => [$('#como'), $('#dentro'), ...$$('.cap'), $('#todo'), $('#distinta'), $('#confianza'), $('#quien'), $('#precio'), $('#preguntas'), $('#forma')]
    .map(el => Math.round(arriba(el) - (el.classList.contains('cap') ? 70 : 0)));
  let irA = y => scrollTo({ top: y, behavior: reducido ? 'auto' : 'smooth' });
  const destinoAncla = id => {
    if (id === 'top') return 0;
    if (id === 'lugar') return Math.max(0, arriba($('#forma')) - 24);   // el formulario completo, con su botón
    const el = document.getElementById(id); if (!el) return null;
    const base = el.parentElement && el.parentElement.classList.contains('pin-spacer') ? el.parentElement : el;
    return Math.round(arriba(base));
  };
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const y = destinoAncla(a.getAttribute('href').slice(1));
    if (y === null) return;
    e.preventDefault(); e.stopImmediatePropagation();
    irA(y);
  }));
  const bSig = $('#siguiente');
  let topeSalto = true;                             // en la forma fija los tramos ya van medidos
  const proxima = () => {
    const y = paradas().sort((a, b) => a - b).find(p => p > scrollY + 12);
    if (y === undefined || !topeSalto) return y;
    // si la parte siguiente está a poco más de una pantalla, directo a ella (sin pasitos de 60 px)
    const tope = scrollY + innerHeight * 0.85;
    return y <= tope + innerHeight * 0.3 ? y : Math.round(tope);
  };
  bSig.addEventListener('click', () => { const y = proxima(); if (y !== undefined) irA(y); });
  let pendiente = false;
  const revisarSig = () => {
    pendiente = false;
    bSig.classList.toggle('oculto', proxima() === undefined);
    bSig.classList.toggle('compacto', scrollY > 40);   // con palabra solo al principio
  };
  addEventListener('scroll', () => { if (!pendiente) { pendiente = true; requestAnimationFrame(revisarSig); } }, { passive: true });
  addEventListener('load', revisarSig);

  // Sin GSAP (CDN caído) o con movimiento reducido: la página queda estática y completa.
  if (!window.gsap || !window.ScrollTrigger || reducido) return;
  html.classList.add('con-mov');
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  // Computadora = la forma fija (teléfono que se queda, arco de tarjetas).
  // Celular = la página baja normal. Si se cruza la frontera (girar una tableta), se recarga.
  const escritorio = matchMedia('(min-width: 861px)');
  const fijo = escritorio.matches;
  if (fijo) { html.classList.add('fijo'); topeSalto = false; }
  escritorio.addEventListener('change', () => location.reload());

  // ── scroll suave ──────────────────────────────────────────────────────
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.085 });          // las anclas las manejamos nosotros (ver destinoAncla)
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    window.__lenis = lenis;
    irA = y => lenis.scrollTo(y, { duration: 1.2 });
  }
  const fino = matchMedia('(pointer: fine)').matches;
  const fmt = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const NS = 'http://www.w3.org/2000/svg';

  // ── vidrio líquido: refracción real donde el navegador la soporta ─────
  // Chrome y Edge aceptan un filtro SVG dentro de backdrop-filter; Safari y
  // Firefox no, y ahí se queda el vidrio esmerilado. Para cada pieza se dibuja
  // un mapa de desplazamiento de su tamaño exacto: en el canto el vidrio jala la
  // imagen hacia adentro (como la orilla de una lente) y, si se pide, aumenta el centro.
  const refracta = !!navigator.userAgentData && CSS.supports('backdrop-filter', 'url(#x)');
  const defsVidrio = $('#filtros-vidrio');
  let nFiltro = 0;
  function mapaVidrio(W, H, radio, bisel, aumento) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const hw = W / 2, hh = H / 2, r = Math.min(radio, hw, hh);
    const sdf = (x, y) => {
      const qx = Math.abs(x - hw) - (hw - r), qy = Math.abs(y - hh) - (hh - r);
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5, dist = -sdf(px, py);
      let dx = 0, dy = 0;
      if (dist > 0 && dist < bisel) {
        let nx = sdf(px + 1, py) - sdf(px - 1, py), ny = sdf(px, py + 1) - sdf(px, py - 1);
        const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
        const t = 1 - dist / bisel, m = t * t * t;   // curva suave: casi nada adentro, fuerte en el canto
        dx = -nx * m; dy = -ny * m;
      }
      if (aumento) { dx -= (px - hw) / hw * aumento; dy -= (py - hh) / hh * aumento; }
      const i = (y * W + x) * 4;
      d[i] = 128 + Math.max(-1, Math.min(1, dx)) * 127;
      d[i + 1] = 128 + Math.max(-1, Math.min(1, dy)) * 127;
      d[i + 2] = 128; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  }
  function hacerVidrio(el, { bisel = 18, fuerza = 40, aumento = 0 } = {}) {
    if (!refracta) return;
    const id = 'vidrio-' + (++nFiltro);
    const construir = () => {
      const W = Math.round(el.offsetWidth), H = Math.round(el.offsetHeight);
      if (W < 4 || H < 4) return;
      const r0 = getComputedStyle(el).borderTopLeftRadius;
      const radio = r0.endsWith('%') ? Math.min(W, H) * parseFloat(r0) / 100 : (parseFloat(r0) || 0);
      let f = document.getElementById(id);
      if (!f) { f = document.createElementNS(NS, 'filter'); f.id = id; defsVidrio.appendChild(f); }
      f.setAttribute('x', 0); f.setAttribute('y', 0); f.setAttribute('width', W); f.setAttribute('height', H);
      f.setAttribute('filterUnits', 'userSpaceOnUse'); f.setAttribute('primitiveUnits', 'userSpaceOnUse');
      f.setAttribute('color-interpolation-filters', 'sRGB');
      f.innerHTML = `<feImage href="${mapaVidrio(W, H, radio, Math.min(bisel, W / 2, H / 2), aumento)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" result="mapa"/>` +
                    `<feDisplacementMap in="SourceGraphic" in2="mapa" scale="${fuerza}" xChannelSelector="R" yChannelSelector="G"/>`;
      el.style.setProperty('--refraccion', `url(#${id})`);
    };
    let espera = 0;
    new ResizeObserver(() => { clearTimeout(espera); espera = setTimeout(construir, 120); }).observe(el);
    construir();
  }

  // ── la órbita ─────────────────────────────────────────────────────────
  // Cada cuenta es una cápsula de vidrio que gira en una elipse inclinada. Al
  // bajar, el radio colapsa (y el giro se acelera, como un patinador que cierra
  // los brazos) hasta fundirse en el centro, donde nace el número.
  const NOMBRES = ['Nu', 'Revolut', 'Cajita Turbo', 'Mercado Pago', 'Klar', 'Tu bolsa', 'Efectivo', 'Cetes'];
  const svg = $('#anillos'), capaChips = $('#chips'), gRayos = $('#rayos'), gChispas = $('#chispas');
  const anA = $('#anilloA'), anB = $('#anilloB');
  const chips = NOMBRES.map((n, i) => {
    const el = document.createElement('div');
    el.className = 'chip vidrio-ligero'; el.innerHTML = '<i></i>' + n;
    capaChips.appendChild(el);
    const rayo = document.createElementNS(NS, 'line'); rayo.setAttribute('class', 'rayo'); gRayos.appendChild(rayo);
    return { el, rayo, fase: (i / NOMBRES.length) * Math.PI * 2, w: 0, h: 0, f: 1 };
  });
  const chispas = [0, 1, 2].map(i => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', 'chispa');
    p.setAttribute('d', 'M0,-5 C.6,-.6 .6,-.6 5,0 C.6,.6 .6,.6 0,5 C-.6,.6 -.6,.6 -5,0 C-.6,-.6 -.6,-.6 0,-5Z');
    gChispas.appendChild(p);
    return { p, fase: i * 2.1, vel: 0.35 + i * 0.12 };
  });
  const orb = { aparece: 0, r: 1, rayos: 0 };
  let W = 0, H = 0, cx = 0, cy = 0, geo = null, ang = 0, heroVisible = true, cajas = [];

  function medir() {
    W = innerWidth; H = innerHeight; cx = W / 2; cy = H / 2;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const movil = W < 760;
    geo = movil
      ? { A: { rx: W / 2 - 54, ry: H * 0.37, tilt: -0.1 }, B: { rx: W * 0.36, ry: H * 0.24, tilt: 0.34 } }
      : { A: { rx: Math.min(W * 0.43, 660), ry: Math.min(W * 0.43, 660) * 0.36, tilt: -0.1 },
          B: { rx: Math.min(W * 0.3, 470), ry: Math.min(W * 0.3, 470) * 0.66, tilt: 0.3 } };
    chips.forEach(c => { c.w = c.el.offsetWidth; c.h = c.el.offsetHeight; });
    // cajas del título, del subtítulo y de las etiquetas de las orillas: un chip
    // que pase por encima se vuelve casi transparente para no tapar el texto
    const centro = $('.hero-centro');
    cajas = ['.hero-eyebrow', '.hero-titulo', '.hero-sub', '.hero-ctas', '.hero-precio'].map(s => {
      const el = $(s, centro), m = 10;
      const x = centro.offsetLeft + el.offsetLeft, y = centro.offsetTop + el.offsetTop;
      return { x1: x - m, y1: y - m, x2: x + el.offsetWidth + m, y2: y + el.offsetHeight + m };
    });
    const base = $('.hero').getBoundingClientRect();
    $$('.vertical').forEach(el => {
      const k = el.getBoundingClientRect();
      if (k.width) cajas.push({ x1: k.left - base.left - 8, y1: k.top - base.top - 8, x2: k.right - base.left + 8, y2: k.bottom - base.top + 8 });
    });
  }
  const tapa = (x, y, w, h) => cajas.some(k => x - w / 2 < k.x2 && x + w / 2 > k.x1 && y - h / 2 < k.y2 && y + h / 2 > k.y1);
  const punto = (e, t, r) => {
    const x = Math.cos(t) * e.rx * r, y = Math.sin(t) * e.ry * r;
    return [cx + x * Math.cos(e.tilt) - y * Math.sin(e.tilt), cy + x * Math.sin(e.tilt) + y * Math.cos(e.tilt)];
  };
  const elipse = (el, e, r) => {
    el.setAttribute('cx', cx); el.setAttribute('cy', cy);
    el.setAttribute('rx', Math.max(0.01, e.rx * r)); el.setAttribute('ry', Math.max(0.01, e.ry * r));
    el.setAttribute('transform', `rotate(${e.tilt * 180 / Math.PI} ${cx} ${cy})`);
  };
  let ultimo = performance.now();
  function pintarOrbita(ahora, dt) {
    if (!heroVisible) return;
    const r = orb.r, ap = orb.aparece;
    ang += dt * 0.09 / Math.max(r, 0.18);           // gira más rápido al cerrarse
    elipse(anA, geo.A, r * (0.9 + 0.1 * ap)); elipse(anB, geo.B, r * (0.9 + 0.1 * ap));
    const opAnillo = ap * Math.min(1, r * 3);
    anA.style.opacity = opAnillo; anB.style.opacity = opAnillo * 0.7;
    chips.forEach((c, i) => {
      const t = c.fase + ang * (i % 2 ? 1.12 : 1);
      const [x, y] = punto(geo.A, t, r);
      const frente = Math.sin(t);                   // abajo = más cerca de quien mira
      const esc = (0.84 + 0.16 * (frente + 1) / 2) * (0.6 + 0.4 * Math.min(1, r * 2));
      const meta = r > 0.8 && tapa(x, y, c.w * esc, c.h * esc) ? 0.1 : 1;
      c.f += (meta - c.f) * Math.min(1, dt * 9);
      const op = ap * (0.5 + 0.5 * (frente + 1) / 2) * Math.min(1, r * 4) * c.f;
      c.el.style.transform = `translate3d(${x - c.w / 2}px,${y - c.h / 2}px,0) scale(${esc})`;
      c.el.style.opacity = op;
      c.el.style.zIndex = frente > 0 ? 4 : 2;
      c.rayo.setAttribute('x1', x); c.rayo.setAttribute('y1', y);
      c.rayo.setAttribute('x2', cx); c.rayo.setAttribute('y2', cy);
      c.rayo.style.opacity = orb.rayos * Math.min(1, r * 4);
    });
    chispas.forEach(s => {
      const [x, y] = punto(geo.B, s.fase + ang * s.vel * 6, r);
      s.p.setAttribute('transform', `translate(${x} ${y}) scale(${0.7 + 0.3 * Math.sin(ahora / 400 + s.fase)})`);
      s.p.style.opacity = opAnillo * (0.55 + 0.45 * Math.sin(ahora / 520 + s.fase * 2));
    });
  }
  medir();
  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }).observe($('.hero'));

  // ── la galería de 18 pantallas: dispersas → en fila → círculo → arco ──
  // Mismo comportamiento que el componente de referencia, hecho con resortes
  // propios: cada propiedad de cada tarjeta persigue su destino con rigidez 40
  // y amortiguamiento 15, así que todo llega suave y sin rebotar.
  const N = cartas.length;
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646;
  const dispersas = cartas.map(() => ({ x: (azar() - 0.5) * 1500, y: (azar() - 0.5) * 1000, r: (azar() - 0.5) * 180, s: 0.6, o: 0 }));
  const gal = { fase: 'dormida', p: 0, morph: 0, giro: 0, mx: 0, pm: 0, visible: false };
  const lerp = (a, b, t) => a + (b - a) * t;
  const resorte = (c, prop, meta, dt) => {
    const v = 'v' + prop;
    c[v] += ((meta - c[prop]) * 40 - c[v] * 15) * dt;
    c[prop] += c[v] * dt;
  };
  function destinos() {
    const Wg = innerWidth, Hg = innerHeight, movil = Wg < 768;
    const cw = movil ? 120 : 150;                  // el ancho de la tarjeta en el CSS (su tamaño en el arco)
    const out = [];
    for (let i = 0; i < N; i++) {
      if (gal.fase === 'dormida' || gal.fase === 'dispersa') { out.push(dispersas[i]); continue; }
      if (gal.fase === 'linea') {
        const paso = cw + 10, esc = Math.min(1, (Wg - 32) / (N * paso));
        out.push({ x: (i * paso - (N - 1) * paso / 2) * esc, y: 0, r: 0, s: esc, o: 1 });
        continue;
      }
      const minD = Math.min(Wg, Hg);
      const radioC = Math.min(minD * 0.35, 350), angC = i / N * Math.PI * 2;
      // en el círculo se achican a lo que cabe (en el arco van a su tamaño completo)
      const escC = Math.min(1, (2 * Math.PI * radioC / N) / (cw + 8));
      const circ = { x: Math.cos(angC) * radioC, y: Math.sin(angC) * radioC, r: angC * 180 / Math.PI + 90, s: escC };
      // En el teléfono el arco es más abierto (radio grande) para que quepan
      // tarjetas grandes sin encimarse; se ven de a tres y el scroll las pasa.
      const radioA = movil ? Math.max(Wg * 2.5, 950) : Math.min(Wg, Hg * 1.5) * 1.1;
      const cima = Math.max(Hg * (movil ? 0.2 : 0.25), galTxtFondo + 18 + 213 / 2 - Hg / 2), centroA = cima + radioA;
      const abre = 130, inicio = -90 - abre / 2, paso = abre / (N - 1);
      // Cuánto del arco cabe en pantalla (a lo alto y a lo ancho), y el recorrido
      // justo para que la primera tarjeta y la última lleguen al centro.
      const cabeAlto = Math.acos(Math.max(-1, 1 - (Hg / 2 - cima + 40) / radioA));
      const cabeAncho = Math.asin(Math.min(1, (Wg / 2 + 20) / radioA));
      const cabe = Math.min(cabeAlto, cabeAncho) * 180 / Math.PI;
      const recorrido = Math.max(0, abre / 2 - cabe * 0.75);
      const angA = inicio + i * paso + (0.5 - gal.pm) * 2 * recorrido;
      const rad = angA * Math.PI / 180;
      const arco = { x: Math.cos(rad) * radioA + gal.mx, y: Math.sin(rad) * radioA + centroA, r: angA + 90, s: 1 };
      const m = gal.morph;
      out.push({ x: lerp(circ.x, arco.x, m), y: lerp(circ.y, arco.y, m), r: lerp(circ.r, arco.r, m), s: lerp(circ.s, arco.s, m), o: 1 });
    }
    return out;
  }
  const galIntro = $('.gal-intro'), galTxt = $('.gal-arco-txt');
  let galTxtFondo = 0;                              // dónde termina el texto de arriba (se mide al cargar y al cambiar tamaño)
  const medirGal = () => { galTxtFondo = galTxt.offsetTop + galTxt.offsetHeight; };
  medirGal(); addEventListener('resize', medirGal); addEventListener('load', medirGal);
  document.fonts && document.fonts.ready.then(medirGal);
  function pintarGaleria(ahora, dt) {
    if (!fijo || !gal.visible) return;              // en el celular es un carrusel normal
    // el avance del scroll también llega con resorte (como el morph del original)
    const metaMorph = gal.fase === 'circulo' ? Math.min(1, gal.p / 0.12) : 0;
    const metaGiro = Math.max(0, Math.min(1, (gal.p - 0.12) / 0.88));
    const suave = 1 - Math.exp(-dt * 5);        // igual de rápido a 60 que a 20 cuadros por segundo
    gal.morph += (metaMorph - gal.morph) * suave;
    gal.pm += (metaGiro - gal.pm) * suave;
    const ds = destinos();
    // Los resortes avanzan en pasos de 1/60 s: en un teléfono que da pocos
    // cuadros por segundo llegan a tiempo en vez de ir en cámara lenta.
    const pasos = Math.max(1, Math.ceil(dt * 60)), h = dt / pasos;
    cartas.forEach((c, i) => {
      const d = ds[i];
      for (let k = 0; k < pasos; k++) {
        resorte(c, 'x', d.x, h); resorte(c, 'y', d.y, h); resorte(c, 'r', d.r, h); resorte(c, 's', d.s, h); resorte(c, 'o', d.o, h);
      }
      c.el.style.transform = `translate3d(${c.x}px,${c.y}px,0) rotate(${c.r}deg) scale(${c.s})`;
      // casi 1 = 1: una opacidad de 0.9999 hace que Safari aplane el giro de la tarjeta
      c.el.style.opacity = c.o > 0.995 ? '1' : Math.max(0, c.o);
    });
    const enCirculo = gal.fase === 'circulo';
    galIntro.style.opacity = enCirculo ? Math.max(0, 1 - gal.morph * 2) : 0;
    const t = Math.max(0, Math.min(1, (gal.morph - 0.8) / 0.2));
    galTxt.style.opacity = t;
    galTxt.style.transform = `translateY(${(1 - t) * 20}px)`;
  }
  let relojes = [];
  const despertar = () => {
    if (gal.fase !== 'dormida') return;
    gal.fase = 'dispersa';
    relojes.push(setTimeout(() => { if (gal.fase === 'dispersa') gal.fase = 'linea'; }, 150));
    relojes.push(setTimeout(() => { gal.fase = 'circulo'; }, 650));
  };
  if (fijo) new IntersectionObserver(([e]) => {
    gal.visible = e.isIntersecting;
    if (e.isIntersecting) despertar();
    else cartas.forEach(c => c.el.classList.remove('volteada'));   // al regresar, todas de frente
  }, { threshold: 0.2 }).observe($('.galeria'));
  // (su ScrollTrigger se crea más abajo, después de los de arriba: los pines se
  // calculan en el orden de la página)
  gal.mxMeta = 0;
  if (fino) addEventListener('pointermove', e => { gal.mxMeta = (e.clientX / innerWidth * 2 - 1) * 100; }, { passive: true });

  // un solo reloj para todo lo que se mueve cuadro por cuadro
  gsap.ticker.add(() => {
    // tope de 0.25 s: si la pestaña estuvo escondida, no brinca de golpe
    const ahora = performance.now(), dt = Math.min(0.25, (ahora - ultimo) / 1000); ultimo = ahora;
    pintarOrbita(ahora, dt);
    gal.mx += (gal.mxMeta - gal.mx) * Math.min(1, dt * 2);
    pintarGaleria(ahora, dt);
  });
  addEventListener('resize', medir);

  // ── entrada: sin cortina; el título sube y las cuentas aparecen, sin detener nada ──
  gsap.timeline({ defaults: { ease: 'expo.out' } })
    .from('.hero-titulo .linea > span', { yPercent: 115, duration: 1.1, stagger: 0.08 }, 0.05)
    .from('.hero-eyebrow > span, .hero-sub > span', { opacity: 0, y: 14, duration: 0.9, stagger: 0.08 }, 0.2)
    .from('.hero-ctas, .hero-precio', { opacity: 0, y: 12, duration: 0.8, clearProps: 'opacity,transform' }, 0.45)
    .from('.nav, .vertical, #siguiente', { opacity: 0, duration: 0.9, clearProps: 'opacity' }, 0.35)
    .to(orb, { aparece: 1, duration: 1.6, ease: 'power2.out' }, 0);

  // ── hero con scroll: el título se va, las cuentas colapsan, nace el número ──
  const numero = $('#numero'), cuenta = { v: 0 };
  const pintarNumero = () => {
    const [ent, dec] = fmt.format(cuenta.v).split('.');
    numero.innerHTML = '<span class="signo">$</span>' + ent + '<span class="cent">.' + dec + '</span>';
  };
  // Tramos cortos: en el celular basta un deslizón para llegar al número. El
  // título aguanta el primer roce del dedo (antes se iba al tocarlo) y el número
  // llega apenas se va el texto, sin una pantalla vacía de por medio.
  const tlHero = gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: fijo ? '+=110%' : '+=70%', scrub: 1, pin: true } });
  tlHero
    .to('.hero-centro', { y: -50, opacity: 0, filter: 'blur(10px)', duration: 0.22, ease: 'power1.in' }, 0.14)
    .to('.hero-capa', { opacity: 0, duration: 0.2 }, 0.1)
    .to(orb, { r: 0, duration: 0.4, ease: 'power2.in' }, 0.08)
    .to(orb, { rayos: 1, duration: 0.14, ease: 'none' }, 0.14)
    .to(orb, { rayos: 0, duration: 0.12, ease: 'none' }, 0.34)
    .fromTo('.destello', { scale: 0.15, opacity: 0 }, { scale: 1.35, opacity: 1, duration: 0.1, ease: 'power2.out' }, 0.38)
    .to('.destello', { scale: 1, opacity: 0.3, duration: 0.2, ease: 'power1.out' }, 0.48)
    .fromTo('.numero-wrap', { opacity: 0, scale: 0.9, filter: 'blur(16px)' },
                            { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.16, ease: 'power2.out' }, 0.38)
    .fromTo(cuenta, { v: 0 }, { v: 204697.58, duration: 0.28, ease: 'power3.out', onUpdate: pintarNumero }, 0.38)
    .to('#ganado', { opacity: 1, duration: 0.1 }, 0.62)
    .to({}, { duration: 0.24 });                     // el número se queda quieto para leerlo

  let stCaps = null, stGal = null, yCap = () => 0;
  if (fijo) {
    // ── el teléfono llega desde abajo y el número se despide ────────────
    gsap.timeline({ scrollTrigger: { trigger: '.dentro', start: 'top bottom', end: 'top top', scrub: 1, invalidateOnRefresh: true,
        onLeave: () => gsap.set('.t-entrada', { clearProps: 'transform' }) } })
      .fromTo('.t-entrada', { y: () => innerHeight * 0.45, rotateX: 26, opacity: 0.2 },
                            { y: 0, rotateX: 0, opacity: 1, ease: 'none', duration: 1 }, 0)
      .to('.numero-in', { y: () => -innerHeight * 0.14, opacity: 0, filter: 'blur(12px)', ease: 'power1.in', duration: 0.55 }, 0);

    // ── capítulos: el teléfono se queda y cambia de pantalla ────────────
    const caps = $$('.cap'), scrs = $$('.scr'), barra = $('#barraCaps'), esc = $('#escaner'), tabs = $$('.cap-tab'), N = caps.length;
    gsap.set(caps.slice(1), { opacity: 0 });
    gsap.set(scrs.slice(1), { opacity: 0 });
    gsap.set(esc, { opacity: 0 });
    const marcar = i => tabs.forEach((t, k) => t.setAttribute('aria-current', String(k === i)));
    // La pestaña activa (y el visor, que abre la pantalla del capítulo actual) lee el
    // tiempo de la línea, no el scroll: con scrub la línea va detrás del scroll.
    const tlCaps = gsap.timeline({
      scrollTrigger: { trigger: '.dentro', start: 'top top', end: () => '+=' + innerHeight * 0.6 * N, scrub: 1, pin: true, invalidateOnRefresh: true },
      onUpdate() {
        barra.style.transform = `scaleX(${tlCaps.progress()})`;
        const i = Math.max(0, Math.min(N - 1, Math.floor(tlCaps.time() - 0.2)));
        if (i !== capActual) { capActual = i; marcar(i); }
      } });
    tlCaps.to({}, { duration: N }, 0);           // el teléfono no gira: plano se lee nítido
    for (let i = 1; i < N; i++) {
      tlCaps
        .to(caps[i - 1], { opacity: 0, y: -24, filter: 'blur(4px)', duration: 0.26, ease: 'power2.in' }, i)
        .fromTo(caps[i], { opacity: 0, y: 28, filter: 'blur(4px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.36, ease: 'power2.out' }, i + 0.26)
        .to(scrs[i - 1], { opacity: 0, scale: 0.97, duration: 0.4, ease: 'power2.in' }, i)
        .fromTo(scrs[i], { opacity: 0, yPercent: 7, scale: 1.03 }, { opacity: 1, yPercent: 0, scale: 1, duration: 0.5, ease: 'power3.out' }, i + 0.12)
        .fromTo(esc, { top: '-6%', opacity: 1 }, { top: '104%', opacity: 0.2, duration: 0.55, ease: 'power1.inOut', immediateRender: false }, i + 0.08)
        .set(esc, { opacity: 0 }, i + 0.64);
    }
    stCaps = tlCaps.scrollTrigger;
    // cada pestaña lleva a donde su capítulo ya se ve completo
    yCap = i => stCaps.start + (stCaps.end - stCaps.start) * Math.min(1, (i + 0.75) / N);
    tabs.forEach(t => t.addEventListener('click', () => irA(yCap(+t.dataset.cap))));

    // ── la galería se fija mientras las tarjetas pasan de círculo a arco ──
    stGal = ScrollTrigger.create({ trigger: '.galeria', start: 'top top', end: () => '+=' + innerHeight * 1.3, pin: true, invalidateOnRefresh: true,
      onUpdate(self) {
        gal.p = self.progress;
        if (self.progress > 0.02 && gal.fase !== 'circulo') { despertar(); relojes.forEach(clearTimeout); gal.fase = 'circulo'; }
      } });
  } else {
    // celular: el número simplemente sube con la página (desvanecerlo dejaba una
    // pantalla vacía), y cada capítulo aparece al llegar
    $$('.cap').forEach(c => c.setAttribute('data-rev', ''));
  }

  // "siguiente" con movimiento: primero el número, luego cada capítulo, la galería y el resto
  paradas = () => {
    const ps = [tlHero.scrollTrigger.end, arriba($('#como'))];
    if (fijo) { for (let i = 0; i < $$('.cap').length; i++) ps.push(yCap(i)); ps.push(stGal.start + (stGal.end - stGal.start) * 0.2); }
    else { $$('.cap').forEach(c => ps.push(arriba(c) - 70)); ps.push(arriba($('.gal-arco-txt')) - 70); }
    [$('#distinta'), $('#confianza'), $('#quien'), $('#precio'), $('#preguntas')].forEach(el => ps.push(arriba(el)));
    ps.push(arriba($('#forma')) - 24);              // termina con el formulario completo a la vista
    return ps.map(Math.round);
  };
  ScrollTrigger.addEventListener('refresh', revisarSig);

  // luz tenue que sigue al mouse (solo en computadora)
  if (fino) {
    const lx = gsap.quickTo('.luz-cursor', 'x', { duration: 0.9, ease: 'power3' });
    const ly = gsap.quickTo('.luz-cursor', 'y', { duration: 0.9, ease: 'power3' });
    const luz = $('.luz-cursor');
    addEventListener('pointermove', e => { lx(e.clientX); ly(e.clientY); luz.style.opacity = 1; }, { passive: true });
  }

  // ── la frase se enciende palabra por palabra ──────────────────────────
  const frase = $('#frase');
  const partir = nodo => {
    [...nodo.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(p => {
          if (!p) return;
          if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
          const s = document.createElement('span'); s.className = 'w'; s.textContent = p; frag.appendChild(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) partir(n);
    });
  };
  partir(frase);
  const palabras = $$('.w', frase);
  gsap.fromTo(palabras, { opacity: 0.13 }, { opacity: 1, stagger: 0.1, ease: 'none',
    scrollTrigger: { trigger: frase, start: 'top 92%', end: 'top 45%', scrub: true,
      onLeave(self) { self.kill(); gsap.set(palabras, { opacity: 1 }); } } });

  // ── apariciones con desenfoque ────────────────────────────────────────
  gsap.set('[data-rev]', { opacity: 0 });
  ScrollTrigger.batch('[data-rev]', { start: 'top 90%', once: true,
    onEnter: lote => gsap.fromTo(lote, { opacity: 0, y: 44, filter: 'blur(10px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.3, ease: 'expo.out', stagger: 0.1, clearProps: 'filter,opacity,transform' }) });


  // ── el nombre gigante del pie sube despacio ───────────────────────────
  gsap.fromTo('.pie-gigante', { yPercent: 45 }, { yPercent: 0, ease: 'none',
    scrollTrigger: { trigger: '.pie', start: 'top bottom', end: 'bottom bottom', scrub: true } });

  // ── barra de progreso + la cápsula se esconde al bajar ────────────────
  const prog = $('.progreso i'), nav = $('#nav');
  let formaVisible = false;
  new IntersectionObserver(([e]) => { formaVisible = e.isIntersecting; if (formaVisible) nav.classList.add('oculta'); }, { threshold: 0.15 }).observe($('#forma'));
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: s => {
    prog.style.transform = `scaleX(${s.progress})`;
    nav.classList.toggle('oculta', formaVisible || (s.direction === 1 && s.scroll() > innerHeight * 0.6));
  } });

  // ── vidrio en las piezas fijas ────────────────────────────────────────
  hacerVidrio(nav, { bisel: 16, fuerza: 36 });
  $$('.liquido.vidrio').forEach(b => hacerVidrio(b, { bisel: 14, fuerza: 30 }));
  hacerVidrio($('#forma'), { bisel: 30, fuerza: 60 });

  addEventListener('load', () => { medir(); ScrollTrigger.refresh(); });
  document.fonts && document.fonts.ready.then(() => { medir(); ScrollTrigger.refresh(); });
})();

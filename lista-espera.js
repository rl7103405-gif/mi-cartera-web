// Lista de espera: guarda un correo en Firestore por la API REST, sin cargar el SDK de Firebase.
// Las reglas (firestore.rules) solo dejan CREAR; nadie puede leer la lista desde fuera.
// El id del documento es ALEATORIO a proposito: si fuera el hash del correo, cualquiera podria preguntarle a la
// base si un correo ya esta anotado (intentar crearlo y ver si "ya existe"). Un correo repetido se limpia al bajar
// la lista; eso es mejor que dejar saber quien se anoto.
(function (raiz) {
  'use strict';

  // Proyecto NUEVO de Firebase (no mi-cartera-b43e0). Se llena con el firebaseConfig que pegue Beto;
  // mientras este vacio, la forma avisa que la lista aun no esta abierta en vez de fallar callada.
  var CONFIG = { projectId: 'fundview-lista', apiKey: 'AIzaSyDFs5GaE8q98ju-Dg4RXiizl6FEEPRKxvs',
    // (27-nov-2026) App Check con reCAPTCHA Enterprise invisible (por puntaje, solo fundview.mx): freno contra bots ahora que la lista
    // invita sin confirmar. La clave del sitio es publica por diseño. Firestore de fundview-lista lo exige solo cuando las metricas lo digan.
    appId: '1:449849119848:web:fa0fe697d1a5fcc63197dd', siteKey: '6LdC-DUuAAAAABWm5o8SPPqgq5-un5eDiia7rxnF' };

  // Token de App Check: reCAPTCHA (cargado al enfocar el correo o al apretar un boton, no al abrir la pagina) -> intercambio -> se guarda en memoria hasta 5 min antes
  // de vencer. Nunca lanza: si algo falla devuelve {} y la escritura sale sin encabezado (mientras no se exija, sigue funcionando; ya exigido,
  // Firestore la rechaza y la forma dice el error de siempre). Tope propio de 4 s para no dejar la forma colgada.
  // Una sola peticion en vuelo (vueloAC): doble clic o precalentado + envio comparten la misma promesa.
  var cacheAC = null, scriptAC = null, vueloAC = null;
  function cargarRecaptcha(doc, key) {
    if (scriptAC) return scriptAC;
    scriptAC = new Promise(function (ok, mal) {
      var listo = function () {
        try { raiz.grecaptcha.enterprise.ready(function () { ok(raiz.grecaptcha.enterprise); }); }
        catch (e) { scriptAC = null; mal(e); }
      };
      var g = raiz.grecaptcha;
      if (g && g.enterprise) return listo();
      var src = 'https://www.google.com/recaptcha/enterprise.js?render=' + encodeURIComponent(key);
      var s = null, etiquetas = doc.getElementsByTagName('script');
      for (var i = 0; i < etiquetas.length; i++) if (etiquetas[i].src === src) { s = etiquetas[i]; break; }
      if (s && s.getAttribute('data-cargado') === '1') return listo();   // ya cargo y aun no hay grecaptcha.enterprise: falla de inmediato
      var alCargar = function () { s.setAttribute('data-cargado', '1'); listo(); };
      var alFallar = function () { scriptAC = null; if (s.parentNode) s.parentNode.removeChild(s); mal(new Error('sin-recaptcha')); };
      if (s) { s.addEventListener('load', alCargar); s.addEventListener('error', alFallar); return; }
      s = doc.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = alCargar;
      s.onerror = alFallar;
      doc.head.appendChild(s);
    });
    return scriptAC;
  }
  function encabezadoAppCheck(opciones) {
    var o = opciones || {};
    var cfg = o.config || CONFIG;
    var ahora = Date.now();
    if (o.appCheck === false || !cfg.appId || !cfg.siteKey) return Promise.resolve({});
    if (cacheAC && cacheAC.vence > ahora) return Promise.resolve({ 'X-Firebase-AppCheck': cacheAC.token });
    if (vueloAC) return vueloAC;
    var trabajo = Promise.resolve().then(function () {
      if (typeof o.appCheck === 'function') return o.appCheck();       // las pruebas inyectan el token
      var doc = raiz.document;
      if (!doc) return null;
      return cargarRecaptcha(doc, cfg.siteKey).then(function (ent) {
        return ent.execute(cfg.siteKey, { action: o.accion || 'lista' });
      }).then(function (rc) {
        var pedir = o.fetch || raiz.fetch;
        var url = 'https://content-firebaseappcheck.googleapis.com/v1/projects/' + cfg.projectId + '/apps/' + cfg.appId +
          ':exchangeRecaptchaEnterpriseToken?key=' + encodeURIComponent(cfg.apiKey);
        return pedir(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recaptchaEnterpriseToken: rc }) });
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (!j || !j.token) return null;
        var ttl = parseFloat(String(j.ttl || '0')) * 1000;
        cacheAC = { token: j.token, vence: Date.now() + Math.max(0, ttl - 300000) };
        return j.token;
      });
    });
    var timerAC = null;
    var limite = new Promise(function (ok) { timerAC = setTimeout(function () { ok('limite'); }, o.esperaAC || 4000); });
    vueloAC = Promise.race([trabajo, limite]).then(function (t) {
      clearTimeout(timerAC); vueloAC = null;
      if (t === 'limite') { scriptAC = null; return {}; }   // gano el tope: el siguiente intento vuelve a cargar reCAPTCHA
      return t ? { 'X-Firebase-AppCheck': t } : {};
    }, function () { clearTimeout(timerAC); vueloAC = null; return {}; });
    return vueloAC;
  }
  // Pide el token por adelantado (sin esperarlo): la pagina lo llama al enfocar el correo, para que al enviar ya este en memoria.
  function precalentarAppCheck(opciones) { encabezadoAppCheck(opciones); }

  var FORMATO = /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+([.][a-z0-9-]+)*[.][a-z]{2,24}$/;

  function normalizar(correo) {
    return String(correo == null ? '' : correo).trim().toLowerCase();
  }

  function esValido(correo) {
    return correo.length >= 6 && correo.length <= 254 && FORMATO.test(correo);
  }

  // 32 bytes al azar en hexadecimal (64 caracteres), de la fuente segura del navegador
  function idAlAzar(cripto) {
    var c = cripto || raiz.crypto;
    if (!c || !c.getRandomValues) throw new Error('sin-cripto');
    var b = c.getRandomValues(new Uint8Array(32));
    return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }

  // Resultado: 'ok' (anotado), 'invalido', 'cerrada' (sin proyecto configurado) o 'error' (red, cuota o
  // regla). Nunca lanza.
  function anotar(correoCrudo, opciones) {
    var o = opciones || {};
    var cfg = o.config || CONFIG;
    var base = o.base || 'https://firestore.googleapis.com';
    var correo = normalizar(correoCrudo);
    if (!esValido(correo)) return Promise.resolve('invalido');
    if (!cfg.projectId || !cfg.apiKey) return Promise.resolve('cerrada');
    return Promise.resolve().then(function () {
      var id = idAlAzar(o.cripto);
      var raizDocs = 'projects/' + cfg.projectId + '/databases/(default)/documents';
      var url = base + '/v1/' + raizDocs + ':commit' + (cfg.apiKey ? '?key=' + encodeURIComponent(cfg.apiKey) : '');
      var cuerpo = {
        writes: [{
          update: {
            name: raizDocs + '/lista_espera/' + id,
            fields: { correo: { stringValue: correo }, acepto: { booleanValue: true } }
          },
          updateTransforms: [{ fieldPath: 'creado', setToServerValue: 'REQUEST_TIME' }],
          currentDocument: { exists: false }
        }]
      };
      return encabezadoAppCheck(o).then(function (ac) {
      var pedir = o.fetch || raiz.fetch;
      // tiempo limite (15 s por defecto; inyectable para las pruebas): si la red no responde, termina en 'error'
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = null;
      var limite = new Promise(function (_, rechazar) {
        timer = setTimeout(function () { if (ctl) ctl.abort(); rechazar(new Error('tiempo')); }, o.espera || 15000);
      });
      var envio = pedir(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, ac),
        body: JSON.stringify(cuerpo),
        signal: ctl ? ctl.signal : undefined
      }).then(function (r) {
        return r.ok ? 'ok' : 'error';
      });
      return Promise.race([envio, limite]).then(
        function (res) { clearTimeout(timer); return res; },
        function (e) { clearTimeout(timer); throw e; }
      );
      });
    }).catch(function () { return 'error'; });
  }

  var api = { anotar: anotar, encabezadoAppCheck: encabezadoAppCheck, precalentarAppCheck: precalentarAppCheck, normalizar: normalizar, esValido: esValido, idAlAzar: idAlAzar, CONFIG: CONFIG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ListaEspera = api;
})(typeof window !== 'undefined' ? window : globalThis);

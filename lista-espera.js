// Lista de espera: guarda un correo en Firestore por la API REST, sin cargar el SDK de Firebase.
// Las reglas (firestore.rules) solo dejan CREAR; nadie puede leer la lista desde fuera.
// El id del documento es ALEATORIO a proposito: si fuera el hash del correo, cualquiera podria preguntarle a la
// base si un correo ya esta anotado (intentar crearlo y ver si "ya existe"). Un correo repetido se limpia al bajar
// la lista; eso es mejor que dejar saber quien se anoto.
(function (raiz) {
  'use strict';

  // Proyecto NUEVO de Firebase (no mi-cartera-b43e0). Se llena con el firebaseConfig que pegue Beto;
  // mientras este vacio, la forma avisa que la lista aun no esta abierta en vez de fallar callada.
  var CONFIG = { projectId: 'fundview-lista', apiKey: 'AIzaSyDFs5GaE8q98ju-Dg4RXiizl6FEEPRKxvs' };

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
      var pedir = o.fetch || raiz.fetch;
      // tiempo limite (15 s por defecto; inyectable para las pruebas): si la red no responde, termina en 'error'
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = null;
      var limite = new Promise(function (_, rechazar) {
        timer = setTimeout(function () { if (ctl) ctl.abort(); rechazar(new Error('tiempo')); }, o.espera || 15000);
      });
      var envio = pedir(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: ctl ? ctl.signal : undefined
      }).then(function (r) {
        return r.ok ? 'ok' : 'error';
      });
      return Promise.race([envio, limite]).then(
        function (res) { clearTimeout(timer); return res; },
        function (e) { clearTimeout(timer); throw e; }
      );
    }).catch(function () { return 'error'; });
  }

  var api = { anotar: anotar, normalizar: normalizar, esValido: esValido, idAlAzar: idAlAzar, CONFIG: CONFIG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ListaEspera = api;
})(typeof window !== 'undefined' ? window : globalThis);

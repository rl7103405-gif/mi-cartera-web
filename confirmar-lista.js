// La respuesta al primer correo de la lista de espera: confirmar o darse de baja. La pagina no lee nada: solo cambia el estado de
// confirmaciones/{token}, y las reglas (firestore.rules) dicen si se puede. El token viaja en el fragmento de la liga (#t=...), que no se le
// manda a GitHub, y nada se hace al abrir la pagina: hay que apretar el boton, porque los escaneres de correo abren las ligas solos.
(function (raiz) {
  'use strict';

  var TOKEN = /^[a-f0-9]{64}$/;

  // {token, accion} o null si la liga no sirve. Una accion que no sea baja es confirmar.
  function leerLiga(fragmento) {
    var p = new URLSearchParams(String(fragmento == null ? '' : fragmento).replace(/^#/, ''));
    var token = p.get('t') || '';
    if (!TOKEN.test(token)) return null;
    return { token: token, accion: p.get('a') === 'baja' ? 'baja' : 'confirmar' };
  }

  // 'ok', 'no' (el enlace vencio, ya no existe o ya no se puede) o 'error' (red o servidor: vale la pena reintentar). Nunca lanza.
  function responder(token, accion, opciones) {
    var o = opciones || {};
    var cfg = o.config || (raiz.ListaEspera && raiz.ListaEspera.CONFIG) || {};
    var base = o.base || 'https://firestore.googleapis.com';
    if (!TOKEN.test(String(token)) || !cfg.projectId || !cfg.apiKey) return Promise.resolve('no');
    return Promise.resolve().then(function () {
      var raizDocs = 'projects/' + cfg.projectId + '/databases/(default)/documents';
      var url = base + '/v1/' + raizDocs + ':commit?key=' + encodeURIComponent(cfg.apiKey);
      var cuerpo = {
        writes: [{
          update: {
            name: raizDocs + '/confirmaciones/' + token,
            fields: { estado: { stringValue: accion === 'baja' ? 'baja' : 'confirmado' } }
          },
          updateMask: { fieldPaths: ['estado'] },
          updateTransforms: [{ fieldPath: 'respondida', setToServerValue: 'REQUEST_TIME' }],
          currentDocument: { exists: true }
        }]
      };
      var pedir = o.fetch || raiz.fetch;
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
        if (r.ok) return 'ok';
        return r.status === 403 || r.status === 404 || r.status === 400 ? 'no' : 'error';
      });
      return Promise.race([envio, limite]).then(
        function (res) { clearTimeout(timer); return res; },
        function (e) { clearTimeout(timer); throw e; }
      );
    }).catch(function () { return 'error'; });
  }

  var TEXTOS = {
    confirmar: { titulo: 'Confirma que sigues interesado', texto: 'Con esto sigues en la lista de espera de Fundview, y te escribimos cuando sea tu turno.', boton: 'Sí, sigo interesado',
      ok: { titulo: 'Listo, sigues en la lista', texto: 'Te escribimos a tu correo cuando sea tu turno.' } },
    baja: { titulo: 'Darte de baja', texto: 'Con esto borramos tu correo de la lista de espera de Fundview y dejamos de escribirte. Si ya tenías una invitación sin usar, también se anula.', boton: 'Sí, darme de baja',
      ok: { titulo: 'Listo, te diste de baja', texto: 'Ya no te vamos a escribir. Tu correo se borra de la lista en la siguiente limpieza. Si cambias de opinión, te puedes volver a anotar.' } }
  };

  function montar(doc, opciones) {
    var d = doc, $ = function (id) { return d.getElementById(id); };
    var liga = leerLiga(raiz.location && raiz.location.hash);
    var aviso = function (titulo, texto) { $('c-titulo').textContent = titulo; $('c-texto').textContent = texto; };
    if (!liga) { $('c-boton').hidden = true; aviso('Este enlace no sirve', 'Abre la liga completa desde el correo que te mandamos. Si sigue sin funcionar, escríbenos a fundviewapp@gmail.com.'); return; }
    var t = TEXTOS[liga.accion];
    aviso(t.titulo, t.texto);
    $('c-boton').textContent = t.boton;
    $('c-boton').addEventListener('click', function () {
      var b = $('c-boton');
      if (b.getAttribute('aria-busy') === 'true') return;
      b.setAttribute('aria-busy', 'true');
      $('c-estado').textContent = 'Guardando…';
      responder(liga.token, liga.accion, opciones).then(function (res) {
        b.removeAttribute('aria-busy');
        $('c-estado').textContent = '';
        if (res === 'ok') { b.hidden = true; aviso(t.ok.titulo, t.ok.texto); }
        else if (res === 'no') { b.hidden = true; aviso('Este enlace ya no se puede usar', 'Puede que haya vencido o que ya lo hayas usado. Si necesitas algo, escríbenos a fundviewapp@gmail.com.'); }
        else { $('c-estado').textContent = 'No se pudo guardar. Revisa tu conexión e inténtalo otra vez.'; }
      });
    });
  }

  var api = { leerLiga: leerLiga, responder: responder, montar: montar, TEXTOS: TEXTOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { raiz.ConfirmarLista = api; if (raiz.document) raiz.document.addEventListener('DOMContentLoaded', function () { montar(raiz.document, raiz.__confirmarOpciones); }); }
})(typeof window !== 'undefined' ? window : globalThis);

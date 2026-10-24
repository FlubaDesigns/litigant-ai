/* Loaded only for public homepage visits, before the application starts. */
(function (env) {
  'use strict';
  const home = url => (url.pathname === '/' || url.pathname === '/index.html') &&
    (!/^#(?:\/|!)/.test(url.hash) || url.hash === '#/');
  const destination = value => new URL(value == null ? env.location.href : String(value), env.location.href);
  function leave(url, replace) {
    if (replace) env.location.replace(url.href); else env.location.assign(url.href);
  }
  // Client routers must not mount an interior page inside the public home shell.
  for (const method of ['pushState', 'replaceState']) {
    const original = env.history[method].bind(env.history);
    env.history[method] = function (state, title, value) {
      const url = destination(value);
      if (url.origin === env.location.origin && !home(url)) { leave(url, method === 'replaceState'); return; }
      return original(state, title, value);
    };
  }
  env.addEventListener('click', event => {
    const anchor = event.target?.closest?.('a[href]');
    if (!anchor || anchor.hasAttribute('download')) return;
    const url = destination(anchor.href);
    if (url.origin !== env.location.origin || home(url)) return;
    // Modified clicks/new tabs already make a document request to the gate.
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (anchor.target && anchor.target !== '_self')) return;
    event.preventDefault(); event.stopImmediatePropagation(); leave(url, false);
  }, true);
  for (const name of ['popstate', 'hashchange']) env.addEventListener(name, event => {
    if (!home(destination(env.location.href))) { event.stopImmediatePropagation(); env.location.reload(); }
  }, true);
})(globalThis);

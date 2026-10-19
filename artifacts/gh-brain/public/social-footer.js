/* Shared footer: only public links returned by the business's Cortex mapping. */
(() => {
  'use strict';
  const script = document.currentScript;
  const site = script && script.dataset.site;
  if (!site || window.__flubaSocialFooter) return;
  window.__flubaSocialFooter = true;
  const api = 'https://us-central1-flubadesigns-25482.cloudfunctions.net/socialFooterApi?site=' + encodeURIComponent(site);
  let links = [], signature = '', busy = false, queued = false;
  const widget = document.createElement('div');
  widget.dataset.socialFooter = site;
  const shadow = widget.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{display:block;color:inherit;width:100%;box-sizing:border-box}nav{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;padding:16px 12px}a{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;box-sizing:border-box;border:1px solid currentColor;border-radius:50%;color:inherit;text-decoration:none;font:700 18px/1 system-ui;background:transparent;transition:transform .15s}a:hover{transform:translateY(-2px)}a:focus-visible{outline:3px solid currentColor;outline-offset:4px}svg{width:22px;height:22px;fill:currentColor}.label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}';
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Follow us');
  shadow.append(style, nav);
  const paths = {
    facebook: 'M14 21v-8h3l.5-4H14V7c0-1 .3-2 2-2h2V1.4C17.6 1.3 16.4 1 15 1c-3 0-5 1.8-5 5v3H7v4h3v8z',
    instagram: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3zm5 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm5-3a1.3 1.3 0 1 1 0 2.6A1.3 1.3 0 0 1 17 6z',
    linkedin: 'M4 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM2 8h4v14H2zm7 0h4v2c1-1.5 2-2.2 4-2.2 4 0 5 2.3 5 6V22h-4v-7c0-2-.3-3.5-2.3-3.5-2 0-2.7 1.5-2.7 3.5v7H9z',
  };
  function publicRoute() { return !/^\/(?:admin|owner|login|signin|account|BlastyBiz-Owner-Access)(?:[/.\-]|$)/i.test(location.pathname); }
  function mount() {
    queued = false;
    if (!publicRoute() || !links.length) { widget.remove(); document.querySelector('footer[data-social-footer-shell]')?.remove(); return; }
    let footer = document.querySelector('footer:not([data-social-footer-shell]), [role="contentinfo"]');
    const shell = document.querySelector('footer[data-social-footer-shell]');
    if (!footer) {
      footer = shell || document.createElement('footer');
      if (!shell) { footer.dataset.socialFooterShell = ''; footer.style.cssText = 'background:#111827;color:#f9fafb;width:100%;clear:both'; document.body.append(footer); }
    }
    if (widget.parentElement !== footer) footer.append(widget);
    if (shell && footer !== shell) shell.remove();
    // Replace existing buttons for the same destination platform, without
    // touching legal links, sharing controls or social links in page content.
    for (const anchor of footer.querySelectorAll('a[href]')) {
      try { if (links.some(link => new URL(link.url).hostname.replace(/^www\./, '') === new URL(anchor.href).hostname.replace(/^www\./, ''))) anchor.hidden = true; } catch { /* Non-URL links remain. */ }
    }
  }
  function queueMount() { if (!queued) { queued = true; requestAnimationFrame(mount); } }
  async function refresh() {
    if (busy || document.visibilityState === 'hidden') return;
    busy = true;
    try {
      const response = await fetch(api, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000) });
      if (!response.ok) return;
      const data = await response.json();
      if (data.site !== site || !Array.isArray(data.links)) return;
      const next = data.links.filter(link => {
        try { const u = new URL(link.url); return u.protocol === 'https:' && !u.username && !u.password && typeof link.label === 'string' && typeof link.platform === 'string'; } catch { return false; }
      }).slice(0, 100);
      const key = JSON.stringify(next);
      if (key !== signature) {
        signature = key; links = next; nav.replaceChildren();
        for (const link of links) {
          const anchor = document.createElement('a');
          anchor.href = link.url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.title = link.label; anchor.setAttribute('aria-label', link.label);
          if (paths[link.platform]) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', paths[link.platform]); svg.append(path); anchor.append(svg);
          } else {
            const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = link.platform === 'x' ? '𝕏' : link.label.split(/\s+/).map(w => w[0]).join('').slice(0, 2); anchor.append(icon);
          }
          const label = document.createElement('span'); label.className = 'label'; label.textContent = link.label; anchor.append(label); nav.append(anchor);
        }
      }
      queueMount();
    } catch { /* Keep the last working buttons during temporary outages. */ }
    finally { busy = false; }
  }
  function start() {
    new MutationObserver(queueMount).observe(document.body, { childList: true, subtree: true });
    void refresh(); setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', () => { queueMount(); if (document.visibilityState === 'visible') void refresh(); });
    window.addEventListener('popstate', queueMount); window.addEventListener('online', refresh);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();

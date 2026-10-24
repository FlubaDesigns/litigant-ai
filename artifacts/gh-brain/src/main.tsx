import { createRoot } from "react-dom/client";

async function boot() {
  let decision: {allowed:boolean;privateVisit:boolean;homepageVisit?:boolean} = { allowed: true, privateVisit: false };
  let entrance: any = null;
  if (import.meta.env.PROD) {
    decision = { allowed: false, privateVisit: false };
    try {
      const response = await fetch('/__workshop/app.json', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Updates in progress');
      const config = await response.json();
      const moduleUrl = '/__workshop/app-access.mjs';
      entrance = await import(/* @vite-ignore */ moduleUrl);
      decision = await entrance.authorizeWorkshop(config);
    } catch { /* The public construction page remains visible. */ }
  }
  if (!decision.allowed) {
    document.getElementById('root')?.removeAttribute('data-workshop-pending');
    document.title = 'Litigant AI · Updates in progress';
    const robots = document.querySelector('meta[name="robots"]');
    robots?.setAttribute('content', 'noindex,nofollow');
    return;
  }
  if (decision.homepageVisit) {
    const guardUrl = '/__workshop/homepage.js';
    await import(/* @vite-ignore */ guardUrl);
  }
  const [{ default: App }, { RootErrorBoundary }] = await Promise.all([
    import('./App'), import('./components/RootErrorBoundary'), import('./index.css'), import('./styles/Master.css'),
  ]);
  document.getElementById('root')?.replaceChildren();
  document.getElementById('root')?.removeAttribute('data-workshop-pending');
  document.querySelectorAll('[data-workshop-style]').forEach(node => node.remove());
  createRoot(document.getElementById('root')!).render(<RootErrorBoundary><App /></RootErrorBoundary>);
  if (decision.privateVisit) {
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/__workshop/private.css'; document.head.append(style);
    const exit = document.createElement('button'); exit.type = 'button'; exit.className = 'workshop-private'; exit.textContent = 'Private view · Exit';
    exit.onclick = () => { entrance.exitWorkshop('litigant-ai'); location.replace(location.pathname + location.search); };
    document.body.append(exit);
  }
}
void boot().catch(() => {
  document.getElementById('root')?.removeAttribute('data-workshop-pending');
  const status = document.getElementById('workshop-status');
  if (status) status.textContent = "We're updating this experience. Please check back.";
});



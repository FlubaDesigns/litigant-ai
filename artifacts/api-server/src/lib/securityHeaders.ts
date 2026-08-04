/**
 * Security response headers middleware for the Litigant AI API server.
 *
 * The API is a pure JSON/SSE backend — it never renders HTML, scripts, or
 * styles. The CSP is therefore maximally restrictive (default-src 'none') so
 * that even if an attacker somehow coaxes a route into returning user-controlled
 * content with the wrong Content-Type, no browser will execute or render it.
 *
 * Applied to both the Replit dev entrypoint (app.ts) and the Cloud Run
 * entrypoint (app-firebase.ts).
 */
import type { Request, Response, NextFunction } from "express";

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Browsers must honour the declared Content-Type — prevents MIME sniffing
  // from turning a JSON response into an executable script.
  res.setHeader("X-Content-Type-Options", "nosniff");

  // No framing of API responses anywhere.
  res.setHeader("X-Frame-Options", "DENY");

  // Force HTTPS for 1 year including subdomains. Cloud Run enforces TLS;
  // Replit dev is behind a TLS-terminating proxy, so this is safe in both envs.
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );

  // Send only the origin (not the full URL with path/query) as the Referer
  // on cross-origin requests, and nothing at all for downgrade scenarios.
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Deny all browser feature APIs — the API server has no UI so these are
  // never legitimately needed, and restricting them limits any injected-content impact.
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
  );

  // Pure-JSON API: nothing should load from this origin as a document, script,
  // style, image, or frame. frame-ancestors 'none' replaces X-Frame-Options for
  // browsers that support CSP Level 2 (all modern browsers).
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'"
  );

  // API responses must never be cached by shared caches (proxies, CDNs) unless
  // the route explicitly sets its own Cache-Control. Individual routes that want
  // caching override this by calling res.setHeader() before body is written.
  if (!res.getHeader("Cache-Control")) {
    res.setHeader("Cache-Control", "no-store");
  }

  next();
}

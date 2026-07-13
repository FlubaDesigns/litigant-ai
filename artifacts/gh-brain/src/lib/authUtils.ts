/**
 * Validates a `next` redirect parameter from a URL query string.
 *
 * Accepts only relative, same-origin paths (must start with "/" but not "//",
 * which browsers interpret as protocol-relative cross-origin URLs).
 * Falls back to "/session" for anything unsafe or absent.
 */
export function safeNext(raw: string | null | undefined): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/session";
}

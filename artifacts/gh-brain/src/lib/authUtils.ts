const DEFAULT_NEXT = "/session";

/** Accept only local paths, including their query and fragment, for auth returns. */
export function safeNext(raw: string | null | undefined): string {
  // Browsers normalize backslashes and strip control characters when parsing URLs.
  // Checking only for a literal "//" therefore leaves protocol-relative escapes.
  if (!raw?.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(raw)) {
    return DEFAULT_NEXT;
  }
  try {
    const url = new URL(raw, "https://auth-return.invalid");
    const path = decodeURIComponent(url.pathname);
    if (url.origin !== "https://auth-return.invalid" || path.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(path)) {
      return DEFAULT_NEXT;
    }
    return raw;
  } catch {
    return DEFAULT_NEXT;
  }
}

/** Carry the validated return destination through every intermediate auth page. */
export function authPath(page: "/sign-in" | "/register" | "/verify-email" | "/forgot-password", next: string): string {
  return `${page}?next=${encodeURIComponent(safeNext(next))}`;
}

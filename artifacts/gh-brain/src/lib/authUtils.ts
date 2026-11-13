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
    // Authentication pages cannot be their own successful return destination.
    if (/^\/(sign-in|register|verify-email|forgot-password)\/?$/i.test(path)) return DEFAULT_NEXT;
    return raw;
  } catch {
    return DEFAULT_NEXT;
  }
}

/** Carry the validated return destination through every intermediate auth page. */
export function authPath(page: "/sign-in" | "/register" | "/verify-email" | "/forgot-password", next: string): string {
  return `${page}?next=${encodeURIComponent(safeNext(next))}`;
}

/** User-facing recovery instructions; never expose raw provider diagnostics. */
export function signInErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case "auth/invalid-credential": case "auth/wrong-password": case "auth/user-not-found":
      return "We couldn't sign you in with those details. Check your email and password, use Forgot password, or choose Continue with Google if that is how you registered.";
    case "auth/popup-closed-by-user": case "auth/cancelled-popup-request":
      return "Google sign-in did not finish. Select Continue with Google and keep the sign-in window open until it completes.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in window. Allow pop-ups for this site, then select Continue with Google again.";
    case "auth/network-request-failed":
      return "We couldn't reach the sign-in service. Check your connection and try again.";
    case "auth/too-many-requests":
      return "Sign-in is temporarily limited after too many attempts. Wait a few minutes, then try again.";
    case "auth/user-disabled":
      return "This account is disabled. Contact support@litigant-ai.com for help.";
    case "auth/account-exists-with-different-credential":
      return "This email uses another sign-in method. Try your email and password, or use Forgot password to recover access.";
    case "auth/unauthorized-domain": case "auth/operation-not-allowed": case "auth/invalid-api-key":
      return "Sign-in is unavailable because of a site configuration problem. Please contact support@litigant-ai.com; changing your password will not fix this.";
    case "auth/web-storage-unsupported":
      return "Your browser is blocking sign-in storage. Allow site storage or try a regular browser window, then sign in again.";
    default:
      // Setup errors are deliberately written for users by our own service.
      if (error instanceof Error && !code && error.message.includes("Retry setup")) return error.message;
      return "Sign-in could not be completed. Please try again. If it keeps failing, contact support@litigant-ai.com and tell us which sign-in method you used.";
  }
}

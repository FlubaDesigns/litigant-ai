/**
 * safeError — safe client-facing error message.
 *
 * In production, never expose raw error messages to clients — they can leak
 * database schema, internal service names, filesystem paths, or stack frames.
 * In development, the raw message is fine since you're the one reading it.
 *
 * Usage:
 *   return res.status(500).json({ error: safeError(err) });
 */
export function safeError(err: unknown): string {
  if (process.env["NODE_ENV"] !== "production") {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
  }
  return "An internal error occurred. Please try again.";
}

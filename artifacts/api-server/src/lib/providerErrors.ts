/** Safe categories only: upstream SDK messages can contain credentials and must not escape. */
export type ProviderFailureKind = "authentication" | "billing_or_quota" | "model_or_parameter" | "timeout" | "empty_response" | "provider_error";
export function providerFailureKind(error: unknown): ProviderFailureKind {
  const value = error as {status?: number; message?: string; name?: string};
  const message = String(value?.message ?? "").toLowerCase();
  if (value?.status === 401 || value?.status === 403 || /authentication|invalid.*api.key|unauthorized/.test(message)) return "authentication";
  if (/credit balance|billing|insufficient_quota|quota.*exceed/.test(message)) return "billing_or_quota";
  if (value?.status === 404 || /model.*not.found|unsupported.parameter/.test(message)) return "model_or_parameter";
  if (/abort|timeout/.test(message)) return "timeout";
  return "provider_error";
}
export class ProviderFailureError extends Error {
  constructor(readonly kind: ProviderFailureKind) { super(`AI provider failure: ${kind}`); this.name="ProviderFailureError"; }
}
export class SessionProviderError extends Error {
  constructor() {
    super("The AI providers could not return an answer; no approved result was produced. Your question has been kept. Try another model in Configure or try again later.");
    this.name="SessionProviderError";
  }
}

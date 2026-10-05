/** Read-only operator check using the same saved keys and registry as AI Studio. */
import { initFirebaseAdmin } from "../src/lib/firebaseAdmin.js";
import { getModelRegistry } from "../src/lib/providerCatalog.js";
import { getAllConfiguredProviders } from "../src/lib/apiKeyStore.js";
import { PROVIDER_BASE_URLS } from "../src/lib/providers/types.js";

// Observe only model-list responses made by the shared checker. Never log request
// headers, credentials, response bodies or upstream error messages.
const request = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const provider = Object.entries(PROVIDER_BASE_URLS).find(([,base]) => new URL(base).origin === url.origin)?.[0];
  const response = await request(input, init);
  if (provider && /\/models(?:\/|$)/.test(url.pathname)) {
    const body = await response.clone().json().catch(() => ({})) as {data?: {id?:unknown}[]; error?: {type?:unknown}};
    const allowedErrors = ["invalid_request_error", "authentication_error", "permission_error", "not_found_error", "rate_limit_error", "api_error", "overloaded_error"];
    console.log(JSON.stringify({
      check: "provider-model-response", provider, status: response.status,
      phase: /\/models\//.test(url.pathname) ? "alias" : "list",
      errorType: allowedErrors.includes(String(body.error?.type)) ? body.error?.type : undefined,
      modelIds: Array.isArray(body.data) ? body.data.map(m => m.id).filter(id => typeof id === "string" && /^[a-zA-Z0-9._/-]{1,160}$/.test(id)) : undefined,
    }));
  }
  return response;
};

initFirebaseAdmin();
for (const entry of await getAllConfiguredProviders()) {
  console.log(JSON.stringify({check:"credential-source",provider:entry.id,source:entry.source,updatedAt:entry.updatedAt,
    defaultEndpoint: !entry.baseUrl || entry.baseUrl === PROVIDER_BASE_URLS[entry.id]}));
}
const registry = await getModelRegistry(true);
for (const provider of registry.providers) {
  console.log(JSON.stringify({
    check: "provider-connection",
    provider: provider.name,
    configured: provider.configured,
    enabled: provider.enabled,
    state: provider.connection.state,
    checkedAt: provider.connection.checkedAt,
    models: provider.models.map(model => ({id: model.id, enabled: model.enabled})),
  }));
}

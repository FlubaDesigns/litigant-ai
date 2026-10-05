/** Read-only operator check using the same saved keys and registry as AI Studio. */
import { initFirebaseAdmin } from "../src/lib/firebaseAdmin.js";
import { getModelRegistry } from "../src/lib/providerCatalog.js";

initFirebaseAdmin();
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

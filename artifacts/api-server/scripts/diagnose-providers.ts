/** Operator-only diagnostic. Never logs credentials, prompts, responses or raw errors. */
import { initFirebaseAdmin } from "../src/lib/firebaseAdmin.js";
import { createProviderAsync, getConfiguredProvidersAsync, DEFAULT_MODELS } from "../src/lib/providers/index.js";
import { getAllSeatBriefs } from "../src/lib/seatBriefs.js";

initFirebaseAdmin();
const configured = await getConfiguredProvidersAsync();
const briefs = await getAllSeatBriefs();
for (const name of configured.filter(id => Object.hasOwn(DEFAULT_MODELS, id))) {
  const provider = await createProviderAsync(name, DEFAULT_MODELS[name]);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  const started = Date.now();
  try {
    let chars = 0;
    for await (const chunk of provider.streamChat([
      {role:"system",content:briefs.orchestrator},
      {role:"user",content:"What is the worst hurricane ever to hit the US coast? Frame this question for a court of one litigant. Keep your opening to two sentences."},
    ],400,controller.signal)) chars += chunk.length;
    console.log(JSON.stringify({check:"provider-response",provider:name,model:provider.model,visibleChars:chars,usage:provider.getLastUsage?.(),elapsedMs:Date.now()-started}));
  } catch (error: any) {
    const message=String(error?.message ?? "").toLowerCase();
    const reason = /credit balance|billing|insufficient_quota|quota.*exceed/.test(message) ? "billing_or_quota"
      : /api.key|authentication|unauthorized|invalid.*key/.test(message) ? "authentication"
      : /model|not.found/.test(message) ? "model_or_parameter"
      : /abort|timeout/.test(message) ? "timeout" : "provider_error";
    const safeCode=typeof error?.code === "string" && /^[a-z_]{1,60}$/.test(error.code) ? error.code : undefined;
    console.log(JSON.stringify({check:"provider-response",provider:name,model:provider.model,status:Number.isInteger(error?.status)?error.status:null,code:safeCode,reason,elapsedMs:Date.now()-started}));
  } finally { clearTimeout(timer); }
}

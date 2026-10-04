/** Operator-only diagnostic/repair. Never logs credentials, prompts, responses or raw errors. */
import { initFirebaseAdmin } from "../src/lib/firebaseAdmin.js";
import { getApiKey, getAllConfiguredProviders, saveApiKey } from "../src/lib/apiKeyStore.js";
import { createProviderAsync, OpenAIProvider, AnthropicProvider, GrokProvider, GeminiProvider, DEFAULT_MODELS } from "../src/lib/providers/index.js";
import { providerFailureKind } from "../src/lib/providerErrors.js";
import type { AIProvider } from "../src/lib/providers/types.js";

initFirebaseAdmin();
const entries = await getAllConfiguredProviders();
const envKeys: Record<string,string> = {openai:"OPENAI_API_KEY",anthropic:"ANTHROPIC_API_KEY",grok:"XAI_API_KEY",gemini:"GEMINI_API_KEY"};
const factories = {openai:OpenAIProvider,anthropic:AnthropicProvider,grok:GrokProvider,gemini:GeminiProvider};
async function probe(provider: AIProvider, source: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    let chars=0;
    for await (const chunk of provider.streamChat([{role:"user",content:"Reply with only the word READY."}],400,controller.signal)) chars+=chunk.length;
    console.log(JSON.stringify({check:"provider-response",provider:provider.name,source,visibleChars:chars,usage:provider.getLastUsage?.()}));
    return chars>0;
  } catch (error: any) {
    console.log(JSON.stringify({check:"provider-response",provider:provider.name,source,status:Number.isInteger(error?.status)?error.status:null,reason:providerFailureKind(error)}));
    return false;
  } finally {clearTimeout(timer);}
}
for (const entry of entries.filter(e=>Object.hasOwn(factories,e.id))) {
  const name=entry.id as keyof typeof factories;
  const active=await getApiKey(name);
  if(!active) continue;
  const Constructor=factories[name];
  const model=DEFAULT_MODELS[name];
  const activeValid=await probe(await createProviderAsync(name,model),entry.source);
  const envKey=process.env[envKeys[name]];
  console.log(JSON.stringify({check:"credential-source",provider:name,source:entry.source,environmentPresent:!!envKey,environmentMatches:envKey===active.key,containsMask:/[•*]{3,}/.test(active.key),needsTrim:active.key.trim()!==active.key}));
  if(!activeValid && envKey && envKey!==active.key) {
    const valid=await probe(new Constructor(model,{key:envKey.trim()}),"deployment-environment");
    if(valid) {
      // Repair only a verified broken override using an already-authorized key from this project's deployment.
      await saveApiKey(name,envKey.trim(),entry.label);
      console.log(JSON.stringify({check:"credential-repair",provider:name,repaired:true}));
    }
  }
}

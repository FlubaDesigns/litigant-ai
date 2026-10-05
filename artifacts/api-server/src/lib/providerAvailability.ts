import { createHash } from "node:crypto";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "./apiKeyStore.js";
import { PROVIDER_BASE_URLS } from "./providers/types.js";

export type ConnectionState = "connected" | "key_rejected" | "rate_limited" | "unavailable" | "not_configured";
export interface ProviderAvailability {
  state: ConnectionState;
  checkedAt: string;
  modelIds: string[];
}
const cache = new Map<string, { fingerprint: string; expiresAt: number; value: ProviderAvailability }>();
const pending = new Map<string, Promise<ProviderAvailability>>();
const TTL_MS = 30_000;

/** Safe status only: never expose upstream response bodies or credential values. */
function failureState(error: unknown): ConnectionState {
  const status = (error as {status?:number})?.status;
  return status === 401 || status === 403 ? "key_rejected" : status === 429 ? "rate_limited" : "unavailable";
}

/** Authenticated, read-only provider check. No paid generation requests. */
export async function getProviderAvailability(provider: string, candidates: string[], refresh = false): Promise<ProviderAvailability> {
  const creds = await getApiKey(provider);
  if (!creds) return {state:"not_configured",checkedAt:new Date().toISOString(),modelIds:[]};
  const baseURL = creds.baseUrl ?? PROVIDER_BASE_URLS[provider];
  if (!baseURL) return {state:"not_configured",checkedAt:new Date().toISOString(),modelIds:[]};
  const fingerprint = createHash("sha256").update(JSON.stringify([creds.key,baseURL,candidates])).digest("hex");
  const previous = cache.get(provider);
  if (!refresh && previous?.fingerprint === fingerprint && previous.expiresAt > Date.now()) return previous.value;
  const requestKey = `${provider}:${fingerprint}`;
  if (pending.has(requestKey)) return pending.get(requestKey)!;
  const check = (async (): Promise<ProviderAvailability> => {
    const checkedAt = new Date().toISOString();
    let value: ProviderAvailability;
    try {
      const signal = AbortSignal.timeout(6000);
      const ids = new Set<string>();
      if (provider === "anthropic") {
        const client = new Anthropic({apiKey:creds.key,baseURL,maxRetries:0,timeout:6000});
        for await (const model of client.models.list({limit:100},{signal})) ids.add(model.id);
        // Anthropic's list uses canonical IDs; resolve our supported aliases via its API.
        await Promise.all(candidates.filter(id => !ids.has(id)).map(async id => {
          try {
            const model = await client.models.retrieve(id,{}, {signal});
            if (ids.has(model.id)) ids.add(id);
          } catch (error) {
            if (![403,404].includes((error as {status?:number})?.status ?? 0)) throw error;
          }
        }));
      } else {
        const client = new OpenAI({apiKey:creds.key,baseURL,maxRetries:0,timeout:6000});
        for await (const model of client.models.list({signal})) ids.add(model.id.replace(/^models\//,""));
      }
      value = {state:"connected",checkedAt,modelIds:candidates.filter(id => ids.has(id))};
    } catch (error) {
      value = {state:failureState(error),checkedAt,modelIds:[]};
    }
    cache.set(provider,{fingerprint,expiresAt:Date.now()+TTL_MS,value});
    return value;
  })();
  pending.set(requestKey,check);
  try { return await check; } finally { pending.delete(requestKey); }
}

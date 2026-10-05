export type { ProviderName } from "@workspace/api-zod/session";
import type { ProviderName } from "@workspace/api-zod/session";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TokenUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  cacheWrite1hTokens?: number;
  estimated?: boolean;
}

export interface AIProvider {
  readonly model?: string;
  name: ProviderName;
  displayName: string;
  streamChat(
    messages: ChatMessage[],
    maxTokens: number,
    signal?: AbortSignal
  ): AsyncIterable<string>;
  /** Returns real token counts from the most recent streamChat call, if available. */
  getLastUsage?(): TokenUsageSnapshot | null;
}

export interface ProviderConfig {
  provider: ProviderName;
  model?: string;
}

/** Shared endpoints for generation and authenticated connection checks. */
export const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  grok: "https://api.x.ai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: "gpt-5",
  anthropic: "claude-haiku-4-5",
  grok: "grok-4.7",
  gemini: "gemini-2.5-pro",
};

export const PROVIDER_DISPLAY_NAMES: Record<ProviderName, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  grok: "xAI Grok",
  gemini: "Google Gemini",
};

/** Discovery is restricted to text models compatible with our session adapters. */
export function isSessionModel(provider: string, id: string): boolean {
  if (/audio|realtime|transcri|tts|image|imagine|embedding|moderation|search|deep-research|multi-agent|live/i.test(id)) return false;
  if (provider === "openai") return /^(gpt-|chatgpt-|o[0-9])/.test(id);
  if (provider === "anthropic") return /^claude-/.test(id);
  if (provider === "grok") return /^grok-/.test(id) && !/^grok-build/.test(id);
  if (provider === "gemini") return /^gemini-/.test(id) && !/omni|robotics|computer-use/.test(id);
  return false;
}
export const PROVIDER_PRICING_URLS: Record<string, string> = {
  openai:"https://developers.openai.com/api/docs/pricing",
  anthropic:"https://platform.claude.com/docs/en/about-claude/pricing",
  grok:"https://docs.x.ai/developers/pricing",
  gemini:"https://ai.google.dev/gemini-api/docs/pricing",
};

export interface ModelPricing {
  sourceUrl?: string;
  verifiedAt?: string;
  note?: string;
  cachedInputPer1k?: number;
  cacheWriteInputPer1k?: number;
  cacheWriteInput1hPer1k?: number;
  scheduledRates?: { effectiveAt: string; input: number; output: number; cachedInput: number };
  longContext?: { threshold: number; inclusive?: boolean; input: number; output: number; cachedInput: number; cacheWriteInput?: number; cacheWriteInput1h?: number };
}
export interface ModelDefinition {
  id: string; label: string; qualityScore: number; inputRatePer1k: number;
  outputRatePer1k: number; multiplier: number; pricing?: ModelPricing; retired?: boolean; unsupportedReason?: string;
}
/** Resolve one model's API rates and markup for every pricing consumer. */
export function resolveModelPrice(model: ModelDefinition, multiplier = model.multiplier, now = Date.now()) {
  const scheduled = model.pricing?.scheduledRates;
  const current = scheduled && now >= Date.parse(scheduled.effectiveAt) ? scheduled : undefined;
  return {input:current?.input ?? model.inputRatePer1k, output:current?.output ?? model.outputRatePer1k, multiplier,
    ...(model.pricing?.cachedInputPer1k !== undefined ? {cachedInput:current?.cachedInput ?? model.pricing.cachedInputPer1k} : {}),
    ...(model.pricing?.cacheWriteInputPer1k !== undefined ? {cacheWriteInput:model.pricing.cacheWriteInputPer1k} : {}),
    ...(model.pricing?.cacheWriteInput1hPer1k !== undefined ? {cacheWriteInput1h:model.pricing.cacheWriteInput1hPer1k} : {}),
    ...(model.pricing?.longContext ? {longContext:model.pricing.longContext} : {}),
    ...(model.pricing?.verifiedAt ? {verifiedAt:model.pricing.verifiedAt} : {}),
  };
}
const verifiedAt = "2026-10-05";
const openaiPricing = (id: string, cachedInputPer1k: number): ModelPricing => ({sourceUrl:`https://developers.openai.com/api/docs/models/${id}`, verifiedAt, cachedInputPer1k});
const claudePricing = (cachedInputPer1k: number): ModelPricing => ({sourceUrl:"https://platform.claude.com/docs/en/about-claude/pricing", verifiedAt, cachedInputPer1k});
const googlePricing = (cachedInputPer1k: number): ModelPricing => ({sourceUrl:"https://ai.google.dev/gemini-api/docs/pricing", verifiedAt, cachedInputPer1k});
const grokPricing = (input:number, output:number, cachedInput:number): ModelPricing => ({
  sourceUrl:PROVIDER_PRICING_URLS.grok, verifiedAt, cachedInputPer1k:cachedInput,
  longContext:{threshold:200000,inclusive:true,input:input*2,output:output*2,cachedInput:cachedInput*2},
});
const legacyGrok: ModelPricing = {sourceUrl:"https://docs.x.ai/developers/models", note:"Legacy rate; current provider catalog does not list this model."};

/** Published Standard text rates (USD / 1M). Conversion happens once here. */
function publishedModel(provider: ProviderName, id: string, label: string, input: number, output: number, cached?: number, extra: Partial<ModelDefinition> = {}, pricing: ModelPricing = {}): ModelDefinition {
  return {id, label, qualityScore:50, multiplier:5, inputRatePer1k:input/1000, outputRatePer1k:output/1000, ...extra,
    pricing:{sourceUrl:PROVIDER_PRICING_URLS[provider], verifiedAt, ...(cached !== undefined ? {cachedInputPer1k:cached/1000} : {}), ...pricing}};
}
const responsesOnly = "Priced; requires the Responses API before use in sessions.";
const completionsOnly = "Priced; requires the legacy Completions API before use in sessions.";
const openaiLongContext = (input:number, output:number, cached:number, writes?:number): ModelPricing => ({
  longContext:{threshold:272000,input:input*2/1000,output:output*1.5/1000,cachedInput:cached*2/1000,
    ...(writes !== undefined ? {cacheWriteInput:writes*2/1000} : {})},
});
const geminiFlashPromotion: ModelPricing = {
  scheduledRates:{effectiveAt:"2027-01-01T00:00:00Z",input:.0015,output:.0075,cachedInput:.00015},
  note:"Promotional Standard rates through Dec 31, 2026; published rates from Jan 1, 2027: $1.50 input, $7.50 output, $0.15 cached input per 1M tokens.",
};

export const PROVIDER_MODELS: Record<ProviderName, ModelDefinition[]> = {
  openai: [
    { id: "gpt-5",       label: "GPT-5",              qualityScore: 90, inputRatePer1k: 0.00125, outputRatePer1k: 0.0100, multiplier: 5, pricing: openaiPricing("gpt-5", 0.000125) },
    { id: "gpt-4o",      label: "GPT-4o",             qualityScore: 78, inputRatePer1k: 0.0025, outputRatePer1k: 0.0100, multiplier: 5, pricing: openaiPricing("gpt-4o", 0.00125) },
    { id: "gpt-4o-mini", label: "GPT-4o Mini",        qualityScore: 38, inputRatePer1k: 0.00015, outputRatePer1k: 0.0006, multiplier: 8, pricing: openaiPricing("gpt-4o-mini", 0.000075) },
    { id: "o3",          label: "o3 (reasoning)",      qualityScore: 96, inputRatePer1k: 0.0020, outputRatePer1k: 0.0080, multiplier: 4, pricing: openaiPricing("o3", 0.0005) },
    { id: "o4-mini",     label: "o4-mini (reasoning)", qualityScore: 68, inputRatePer1k: 0.0011, outputRatePer1k: 0.0044, multiplier: 6, pricing: openaiPricing("o4-mini", 0.000275) },
    publishedModel("openai", "gpt-6-astra", "GPT-6 Astra", 10, 50, 1, {}, {...openaiLongContext(10,50,1,12.5), cacheWriteInputPer1k:0.0125}),
    publishedModel("openai", "gpt-6.1-sol", "GPT-6.1 Sol", 2, 10, 0.1, {}, {...openaiLongContext(2,10,0.1,2.5), cacheWriteInputPer1k:0.0025}),
    publishedModel("openai", "gpt-6-luna", "GPT-6 Luna", 0.1, 0.5, 0.01, {}, {...openaiLongContext(0.1,0.5,0.01,0.125), cacheWriteInputPer1k:0.000125}),
    publishedModel("openai", "gpt-6-sol", "GPT-6 Sol", 2, 10, 0.2, {}, {...openaiLongContext(2,10,0.2,2.5), cacheWriteInputPer1k:0.0025}),
    publishedModel("openai", "gpt-5.6-sol", "GPT-5.6 Sol", 4, 20, 0.4, {}, {...openaiLongContext(4,20,0.4,5), cacheWriteInputPer1k:0.005, note:"Promotional pricing confirmed through at least Nov 21, 2026; recheck the provider source after that date."}),
    publishedModel("openai", "gpt-5.6-terra", "GPT-5.6 Terra", 2, 12, 0.2, {}, {...openaiLongContext(2,12,0.2,2.5), cacheWriteInputPer1k:0.0025}),
    publishedModel("openai", "gpt-5.6-luna", "GPT-5.6 Luna", 0.2, 1.2, 0.02, {}, {...openaiLongContext(0.2,1.2,0.02,0.25), cacheWriteInputPer1k:0.00025}),
    publishedModel("openai", "gpt-5.5", "GPT-5.5", 5, 30, 0.5, {}, {...openaiLongContext(5,30,0.5)}),
    publishedModel("openai", "gpt-5.5-pro", "GPT-5.5-pro", 30, 180, undefined, {unsupportedReason:responsesOnly}, {...openaiLongContext(30,180,30)}),
    publishedModel("openai", "gpt-5.4", "GPT-5.4", 2.5, 15, 0.25, {}, {...openaiLongContext(2.5,15,0.25)}),
    publishedModel("openai", "gpt-5.4-mini", "GPT-5.4-mini", 0.75, 4.5, 0.075, {}, {}),
    publishedModel("openai", "gpt-5.4-nano", "GPT-5.4-nano", 0.2, 1.25, 0.02, {}, {}),
    publishedModel("openai", "gpt-5.4-pro", "GPT-5.4-pro", 30, 180, undefined, {unsupportedReason:responsesOnly}, {...openaiLongContext(30,180,30)}),
    publishedModel("openai", "gpt-5.2", "GPT-5.2", 1.75, 14, 0.175, {}, {}),
    publishedModel("openai", "gpt-5.2-pro", "GPT-5.2-pro", 21, 168, undefined, {unsupportedReason:responsesOnly}, {}),
    publishedModel("openai", "gpt-5.1", "GPT-5.1", 1.25, 10, 0.125, {}, {}),
    publishedModel("openai", "gpt-5-mini", "GPT-5-mini", 0.25, 2, 0.025, {}, {}),
    publishedModel("openai", "gpt-5-nano", "GPT-5-nano", 0.05, 0.4, 0.005, {}, {}),
    publishedModel("openai", "gpt-5-pro", "GPT-5-pro", 15, 120, undefined, {unsupportedReason:responsesOnly}, {}),
    publishedModel("openai", "gpt-4.1", "GPT-4.1", 2, 8, 0.5, {}, {}),
    publishedModel("openai", "gpt-4.1-mini", "GPT-4.1-mini", 0.4, 1.6, 0.1, {}, {}),
    publishedModel("openai", "gpt-4.1-nano", "GPT-4.1-nano", 0.1, 0.4, 0.025, {}, {}),
    publishedModel("openai", "gpt-4o-2024-05-13", "GPT-4o-2024-05-13", 5, 15, undefined, {}, {}),
    publishedModel("openai", "o1", "o1", 15, 60, 7.5, {}, {}),
    publishedModel("openai", "o1-pro", "o1-pro", 150, 600, undefined, {unsupportedReason:responsesOnly}, {}),
    publishedModel("openai", "o3-pro", "o3-pro", 20, 80, undefined, {unsupportedReason:responsesOnly}, {}),
    publishedModel("openai", "o3-mini", "o3-mini", 1.1, 4.4, 0.55, {}, {}),
    publishedModel("openai", "gpt-4-turbo-2024-04-09", "GPT-4-turbo-2024-04-09", 10, 30, undefined, {}, {}),
    publishedModel("openai", "gpt-4-0613", "GPT-4-0613", 30, 60, undefined, {}, {}),
    publishedModel("openai", "gpt-3.5-turbo", "GPT-3.5-turbo", 0.5, 1.5, undefined, {unsupportedReason:"Legacy model; streaming support must be verified before session use."}, {}),
    publishedModel("openai", "gpt-3.5-turbo-0125", "GPT-3.5-turbo-0125", 0.5, 1.5, undefined, {}, {}),
    publishedModel("openai", "gpt-3.5-turbo-1106", "GPT-3.5-turbo-1106", 1, 2, undefined, {}, {}),
    publishedModel("openai", "gpt-3.5-turbo-instruct", "GPT-3.5-turbo-instruct", 1.5, 2, undefined, {unsupportedReason:completionsOnly}, {}),
    publishedModel("openai", "gpt-5.3-codex", "gpt-5.3-codex", 1.75, 14.0, 0.175, {unsupportedReason:responsesOnly}, {sourceUrl:"https://developers.openai.com/api/docs/models/gpt-5.3-codex"}),
    publishedModel("openai", "gpt-5.2-codex", "gpt-5.2-codex", 1.75, 14.0, 0.175, {unsupportedReason:responsesOnly}, {sourceUrl:"https://developers.openai.com/api/docs/models/gpt-5.2-codex"}),
    publishedModel("openai", "gpt-5.1-codex", "gpt-5.1-codex", 1.25, 10.0, 0.125, {unsupportedReason:responsesOnly}, {sourceUrl:"https://developers.openai.com/api/docs/models/gpt-5.1-codex"}),
    publishedModel("openai", "gpt-5.1-codex-max", "gpt-5.1-codex-max", 1.25, 10.0, 0.125, {unsupportedReason:responsesOnly}, {sourceUrl:"https://developers.openai.com/api/docs/models/gpt-5.1-codex-max"}),
    publishedModel("openai", "gpt-5.1-codex-mini", "gpt-5.1-codex-mini", 0.25, 2.0, 0.025, {unsupportedReason:responsesOnly}, {sourceUrl:"https://developers.openai.com/api/docs/models/gpt-5.1-codex-mini"}),
    publishedModel("openai", "gpt-5-codex", "gpt-5-codex", 1.25, 10.0, 0.125, {unsupportedReason:responsesOnly}, {sourceUrl:"https://developers.openai.com/api/docs/models/gpt-5-codex"}),
    publishedModel("openai", "gpt-5-chat-latest", "gpt-5-chat-latest", 1.25, 10.0, 0.125, {unsupportedReason:"Provider marks this model deprecated; use a current model for sessions."}, {sourceUrl:"https://developers.openai.com/api/docs/models/gpt-5-chat-latest"}),
    publishedModel("openai", "gpt-5.1-chat-latest", "gpt-5.1-chat-latest", 1.25, 10.0, 0.125, {unsupportedReason:"Provider marks this model deprecated; use a current model for sessions."}, {sourceUrl:"https://developers.openai.com/api/docs/models/gpt-5.1-chat-latest"}),
    publishedModel("openai", "gpt-5.2-chat-latest", "gpt-5.2-chat-latest", 1.75, 14.0, 0.175, {unsupportedReason:"Provider marks this model deprecated; use a current model for sessions."}, {sourceUrl:"https://developers.openai.com/api/docs/models/gpt-5.2-chat-latest"}),
    publishedModel("openai", "gpt-5.3-chat-latest", "gpt-5.3-chat-latest", 1.75, 14.0, 0.175, {unsupportedReason:"Provider marks this model deprecated; use a current model for sessions."}, {sourceUrl:"https://developers.openai.com/api/docs/models/gpt-5.3-chat-latest"}),
  ],
  anthropic: [
    { id: "claude-opus-4-5",   label: "Claude Opus 4.5",   qualityScore: 92, inputRatePer1k: 0.0050, outputRatePer1k: 0.0250, multiplier: 3, pricing: {...claudePricing(0.0005),cacheWriteInputPer1k:.00625,cacheWriteInput1hPer1k:.01} },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", qualityScore: 80, inputRatePer1k: 0.0030, outputRatePer1k: 0.0150, multiplier: 5, pricing: {...claudePricing(0.0003),cacheWriteInputPer1k:.00375,cacheWriteInput1hPer1k:.006} },
    { id: "claude-haiku-4-5",  label: "Claude Haiku 4.5",  qualityScore: 42, inputRatePer1k: 0.0010, outputRatePer1k: 0.0050, multiplier: 8, pricing: {...claudePricing(0.0001),cacheWriteInputPer1k:.00125,cacheWriteInput1hPer1k:.002} },
    publishedModel("anthropic", "claude-sonnet-5-5", "Claude Sonnet 5.5", 2, 10, 0.2, {}, {cacheWriteInputPer1k:0.0025,cacheWriteInput1hPer1k:0.004}),
    publishedModel("anthropic", "claude-opus-5-5", "Claude Opus 5.5", 4, 20, 0.2, {}, {cacheWriteInputPer1k:0.005,cacheWriteInput1hPer1k:0.008}),
    publishedModel("anthropic", "claude-fable-5-1", "Claude Fable 5.1", 10, 50, 0.25, {}, {cacheWriteInputPer1k:0.0125,cacheWriteInput1hPer1k:0.02}),
    publishedModel("anthropic", "claude-opus-5", "Claude Opus 5", 5, 25, 0.5, {}, {cacheWriteInputPer1k:0.00625,cacheWriteInput1hPer1k:0.01}),
    publishedModel("anthropic", "claude-sonnet-5", "Claude Sonnet 5", 2, 10, 0.2, {}, {cacheWriteInputPer1k:0.0025,cacheWriteInput1hPer1k:0.004}),
    publishedModel("anthropic", "claude-fable-5", "Claude Fable 5", 10, 50, 1, {}, {cacheWriteInputPer1k:0.0125,cacheWriteInput1hPer1k:0.02}),
    publishedModel("anthropic", "claude-opus-4-8", "Claude Opus 4.8", 5, 25, 0.5, {}, {cacheWriteInputPer1k:0.00625,cacheWriteInput1hPer1k:0.01}),
    publishedModel("anthropic", "claude-opus-4-7", "Claude Opus 4.7", 5, 25, 0.5, {}, {cacheWriteInputPer1k:0.00625,cacheWriteInput1hPer1k:0.01}),
    publishedModel("anthropic", "claude-sonnet-4-6", "Claude Sonnet 4.6", 3, 15, 0.3, {}, {cacheWriteInputPer1k:0.00375,cacheWriteInput1hPer1k:0.006}),
    publishedModel("anthropic", "claude-opus-4-6", "Claude Opus 4.6", 5, 25, 0.5, {}, {cacheWriteInputPer1k:0.00625,cacheWriteInput1hPer1k:0.01}),
  ],
  grok: [
    // New scores start neutral; the administrator can rate them in AI Studio.
    { id:"grok-4.7", label:"Grok 4.7", qualityScore:50, inputRatePer1k:.002, outputRatePer1k:.006, multiplier:5, pricing:grokPricing(.002,.006,.0005) },
    { id:"grok-4.6", label:"Grok 4.6", qualityScore:50, inputRatePer1k:.002, outputRatePer1k:.006, multiplier:5, pricing:grokPricing(.002,.006,.0005) },
    { id:"grok-4.5", label:"Grok 4.5", qualityScore:50, inputRatePer1k:.002, outputRatePer1k:.006, multiplier:5, pricing:grokPricing(.002,.006,.0003) },
    { id:"grok-4.3", label:"Grok 4.3", qualityScore:50, inputRatePer1k:.00125, outputRatePer1k:.0025, multiplier:5, pricing:grokPricing(.00125,.0025,.0002) },
    { id:"grok-4.20-0309-reasoning", label:"Grok 4.20 (reasoning)", qualityScore:50, inputRatePer1k:.00125, outputRatePer1k:.0025, multiplier:5, pricing:grokPricing(.00125,.0025,.0002) },
    { id:"grok-4.20-0309-non-reasoning", label:"Grok 4.20 (non-reasoning)", qualityScore:50, inputRatePer1k:.00125, outputRatePer1k:.0025, multiplier:5, pricing:grokPricing(.00125,.0025,.0002) },
    // Retired slug redirects to a different model: https://docs.x.ai/developers/migration/may-15-retirement
    { id: "grok-3", retired: true, label: "Grok 3",      qualityScore: 74, inputRatePer1k: 0.0030, outputRatePer1k: 0.0150, multiplier: 5, pricing: legacyGrok },
    { id: "grok-3-mini", retired:true, label: "Grok 3 Mini", qualityScore: 32, inputRatePer1k: 0.0003, outputRatePer1k: 0.0005, multiplier: 8, pricing: legacyGrok },
    { id: "grok-2", retired:true, label: "Grok 2",      qualityScore: 58, inputRatePer1k: 0.0020, outputRatePer1k: 0.0100, multiplier: 5, pricing: legacyGrok },
  ],
  gemini: [
    { id: "gemini-2.5-pro",   label: "Gemini 2.5 Pro",   qualityScore: 84, inputRatePer1k: 0.00125, outputRatePer1k: 0.0100, multiplier: 5, pricing: {...googlePricing(0.000125), longContext:{threshold:200000,input:0.0025,output:0.015,cachedInput:0.00025}} },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", qualityScore: 48, inputRatePer1k: 0.0003, outputRatePer1k: 0.0025, multiplier: 10, pricing: googlePricing(0.00003) },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", qualityScore: 28, inputRatePer1k: 0.00010, outputRatePer1k: 0.0004, multiplier: 10, pricing: {sourceUrl:"https://ai.google.dev/gemini-api/docs/pricing", note:"Legacy rate; current provider catalog does not list this model."} },
    publishedModel("gemini", "gemini-3.8-flash", "Gemini 3.8 Flash", 0.75, 3.75, 0.075, {}, geminiFlashPromotion),
    publishedModel("gemini", "gemini-3.7-flash", "Gemini 3.7 Flash", 0.75, 3.75, 0.075, {}, geminiFlashPromotion),
    publishedModel("gemini", "gemini-3.6-flash", "Gemini 3.6 Flash", 0.75, 3.75, 0.075, {}, geminiFlashPromotion),
    publishedModel("gemini", "gemini-3.5-flash", "Gemini 3.5 Flash", 1.5, 9, 0.15, {}, {}),
    publishedModel("gemini", "gemini-3.5-flash-lite", "Gemini 3.5 flash lite", 0.3, 2.5, 0.03, {}, {}),
    publishedModel("gemini", "gemini-3.1-flash-lite", "Gemini 3.1 flash lite", 0.25, 1.5, 0.025, {}, {}),
    publishedModel("gemini", "gemini-3-flash-preview", "Gemini 3 flash preview", 0.5, 3, 0.05, {}, {}),
    publishedModel("gemini", "gemini-3.1-pro-preview", "Gemini 3.1 pro preview", 2, 12, 0.2, {}, {longContext:{threshold:200000,input:.004,output:.018,cachedInput:.0004}}),
    publishedModel("gemini", "gemini-3.1-pro-preview-customtools", "Gemini 3.1 pro preview customtools", 2, 12, 0.2, {}, {longContext:{threshold:200000,input:.004,output:.018,cachedInput:.0004}}),
    publishedModel("gemini", "gemini-2.5-flash-lite", "Gemini 2.5 flash lite", 0.1, 0.4, 0.01, {}, {}),
    publishedModel("gemini", "gemini-3.1-flash-lite-preview", "Gemini 3.1 Flash Lite Preview", .25, 1.5, .025, {retired:true}, {note:"Shut down May 25, 2026; use gemini-3.1-flash-lite.",sourceUrl:"https://ai.google.dev/gemini-api/docs/changelog"}),
  ],
};

// Exact snapshot mappings from the provider model pages; never infer rates from a name prefix.
const openaiSnapshots: Record<string,string> = {
  "gpt-5.5-2026-04-23": "gpt-5.5",
  "gpt-5.5-pro-2026-04-23": "gpt-5.5-pro",
  "gpt-5.4-2026-03-05": "gpt-5.4",
  "gpt-5.4-pro-2026-03-05": "gpt-5.4-pro",
  "gpt-5.4-mini-2026-03-17": "gpt-5.4-mini",
  "gpt-5.4-nano-2026-03-17": "gpt-5.4-nano",
  "gpt-5.2-2025-12-11": "gpt-5.2",
  "gpt-5.2-pro-2025-12-11": "gpt-5.2-pro",
  "gpt-5.1-2025-11-13": "gpt-5.1",
  "gpt-5-mini-2025-08-07": "gpt-5-mini",
  "gpt-5-nano-2025-08-07": "gpt-5-nano",
  "gpt-5-pro-2025-10-06": "gpt-5-pro",
  "gpt-4.1-2025-04-14": "gpt-4.1",
  "gpt-4.1-mini-2025-04-14": "gpt-4.1-mini",
  "gpt-4.1-nano-2025-04-14": "gpt-4.1-nano",
  "o1-2024-12-17": "o1",
  "o1-pro-2025-03-19": "o1-pro",
  "o3-mini-2025-01-31": "o3-mini",
  "gpt-4-turbo": "gpt-4-turbo-2024-04-09",
  "gpt-4": "gpt-4-0613",
  "gpt-5-2025-08-07": "gpt-5",
  "gpt-4o-2024-11-20": "gpt-4o",
  "gpt-4o-2024-08-06": "gpt-4o",
  "gpt-4o-mini-2024-07-18": "gpt-4o-mini",
  "o3-2025-04-16": "o3",
  "o4-mini-2025-04-16": "o4-mini"
};
for (const [id, baseId] of Object.entries(openaiSnapshots)) {
  const base = PROVIDER_MODELS.openai.find(m => m.id === baseId)!;
  PROVIDER_MODELS.openai.push({...base, id, label:id, pricing:{...base.pricing,sourceUrl:`https://developers.openai.com/api/docs/models/${baseId}`}});
}

/**
 * Default quality scores extracted from PROVIDER_MODELS for easy lookup.
 * Admins can override these via Firestore (system_config/modelScores).
 */
export const DEFAULT_QUALITY_SCORES: Record<string, number> = Object.fromEntries(
  Object.values(PROVIDER_MODELS).flat().map((m) => [m.id, m.qualityScore])
);

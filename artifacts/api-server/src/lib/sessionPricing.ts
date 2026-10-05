import { CourtConfigSchema, resolveModelByIntelligence, type CourtConfig, type SeatAssignment } from "@workspace/api-zod/session";
import { getProviderCatalog } from "./providerCatalog.js";
import { CREDIT_VALUE_USD, estimateSessionCredits, creditsForTokens } from "./creditEngine.js";

export interface CallUsage {
  provider: string; model: string; inputTokens: number; outputTokens: number;
  seat?: string; usageSource?: "provider" | "estimated"; cachedInputTokens?: number;
  costUSD?: number; rateVerifiedAt?: string;
}
export interface PriceRate {
  input: number; output: number; multiplier: number; cachedInput?: number;
  verifiedAt?: string;
  longContext?: { threshold: number; input: number; output: number; cachedInput: number };
}
/** Standard text API cost; excludes account discounts, taxes and invoice adjustments. */
export function callCostUSD(call: CallUsage, rate: PriceRate): number {
  const tier = rate.longContext && call.inputTokens > rate.longContext.threshold ? rate.longContext : rate;
  const cached = Math.max(0, Math.min(call.inputTokens, call.cachedInputTokens ?? 0));
  return ((call.inputTokens - cached) * tier.input + cached * (tier.cachedInput ?? tier.input) + call.outputTokens * tier.output) / 1000;
}
export function annotateCalls(calls: CallUsage[], rates: Record<string, PriceRate>): CallUsage[] {
  return calls.map(call => {
    const rate = rates[call.model];
    if (!rate) throw new Error(`Missing price for model ${call.model}`);
    return {...call, costUSD:callCostUSD(call, rate), ...(rate.verifiedAt ? {rateVerifiedAt:rate.verifiedAt} : {})};
  });
}
export function priceCalls(calls: CallUsage[], rates: Record<string, PriceRate>): number {
  const dollars = calls.reduce((sum, call) => {
    const rate = rates[call.model];
    if (!rate) throw new Error(`Missing price for model ${call.model}`);
    return sum + callCostUSD(call, rate) * rate.multiplier;
  }, 0);
  return dollars > 0 ? Math.ceil(dollars / CREDIT_VALUE_USD) : 0;
}

/** One accepted config and immutable price snapshot for quote, cap and settlement. */
export async function prepareSession(input: unknown, pipelineOnly = false) {
  const config = CourtConfigSchema.parse(input);
  const catalog = await getProviderCatalog();
  if (config.provider && !catalog.providers.some(p => p.name === config.provider)) throw new Error(`Provider ${config.provider} is disabled or unavailable.`);
  const providers = catalog.providers.filter(p => p.models.length > 0).map(p => ({...p, defaultModel: p.models.some(m => m.id === p.defaultModel) ? p.defaultModel : p.models[0]!.id}));
  if (!providers.length) throw new Error("No enabled AI provider is available.");
  const defaultProvider = providers.find(p => p.name === config.provider) ?? providers[0]!;
  function resolve(seat?: SeatAssignment, global = false) {
    const own = global || seat?.useMasterSettings === false || (seat?.useMasterSettings === undefined && !!seat?.model);
    const level = global ? config.intelligenceLevel : own ? seat?.intelligenceLevel : config.intelligenceLevel;
    const selected = level === undefined ? null : resolveModelByIntelligence(level, own && !global ? seat?.provider ?? "auto" : "auto", providers);
    const providerId = selected?.provider ?? (own && seat?.provider && seat.provider !== "auto" ? seat.provider : config.provider ?? defaultProvider.name);
    const provider = providers.find(p => p.name === providerId);
    if (!provider) throw new Error(`Provider ${providerId} is disabled or unavailable.`);
    const model = selected?.model ?? (own ? seat?.model : undefined) ?? (providerId === config.provider ? config.model : undefined) ?? provider.defaultModel;
    if (!provider.models.some(m => m.id === model)) throw new Error(`Model ${model} is disabled or unavailable.`);
    return { ...seat, provider: providerId, model };
  }
  const globalSeat = resolve({provider: defaultProvider.name, model: config.model}, true);
  config.provider = globalSeat.provider as CourtConfig["provider"];
  config.model = globalSeat.model;
  const sm = config.seatMap;
  config.seatMap = {
    orchestrator: resolve(sm?.orchestrator), moderator: resolve(sm?.moderator),
    architect: resolve(sm?.architect), builder: resolve(sm?.builder), auditor: resolve(sm?.auditor),
    litigants: Array.from({length:config.litigantCount}, (_, i) => resolve(sm?.litigants[i])),
  };
  // Include enabled backup models so failover uses the same price snapshot.
  const rates: Record<string, PriceRate> = {};
  for (const p of providers) for (const m of p.models) rates[m.id] = {input:m.creditInfo.inputRatePer1k, output:m.creditInfo.outputRatePer1k, multiplier:m.creditInfo.multiplier,
    ...(m.pricing?.cachedInputPer1k !== undefined ? {cachedInput:m.pricing.cachedInputPer1k} : {}),
    ...(m.pricing?.verifiedAt ? {verifiedAt:m.pricing.verifiedAt} : {}),
    ...(m.pricing?.longContext ? {longContext:m.pricing.longContext} : {}),
  };
  const seats = [config.seatMap.orchestrator, config.seatMap.moderator, config.seatMap.architect, config.seatMap.builder, config.seatMap.auditor, ...config.seatMap.litigants];
  // Conservative reservation uses the most expensive selected model. Settlement
  // uses the actual model of EVERY call and refunds any unused reservation.
  const estimates = seats.map(seat => {
    const model = providers.find(p => p.name === seat.provider)!.models.find(m => m.id === seat.model)!;
    const price = rates[model.id]!;
    const fixed = model.creditInfo.fixedStagePrior;
    return pipelineOnly ? creditsForTokens(price, fixed.input, fixed.output) : estimateSessionCredits(config, price, fixed);
  });
  const estimatedCredits = Math.min(config.maxCredits, Math.max(...estimates));
  return { config, rates, estimatedCredits, enabledProviders: providers.map(p => p.name), fallbackModels: Object.fromEntries(providers.map(p => [p.name, p.defaultModel])) };
}

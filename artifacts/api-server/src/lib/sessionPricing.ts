import { CourtConfigSchema, resolveModelByIntelligence, type CourtConfig, type SeatAssignment } from "@workspace/api-zod/session";
import { getProviderCatalog } from "./providerCatalog.js";
import { getMultiplierOverrides } from "./pricingConfig.js";
import { getModelRate, CREDIT_VALUE_USD, estimateSessionCreditsCalibrated, estimateFixedPipelineCost, getModelMultiplier } from "./creditEngine.js";

export interface CallUsage { provider: string; model: string; inputTokens: number; outputTokens: number; }
export interface PriceRate { input: number; output: number; multiplier: number; }
export function priceCalls(calls: CallUsage[], rates: Record<string, PriceRate>): number {
  const dollars = calls.reduce((sum, call) => {
    const rate = rates[call.model];
    if (!rate) throw new Error(`Missing price for model ${call.model}`);
    return sum + (call.inputTokens * rate.input + call.outputTokens * rate.output) / 1000 * rate.multiplier;
  }, 0);
  return dollars > 0 ? Math.ceil(dollars / CREDIT_VALUE_USD) : 0;
}

/** One accepted config and immutable price snapshot for quote, cap and settlement. */
export async function prepareSession(input: unknown, pipelineOnly = false) {
  const config = CourtConfigSchema.parse(input);
  const [catalog, multipliers] = await Promise.all([getProviderCatalog(), getMultiplierOverrides()]);
  const providers = catalog.providers.filter(p => p.models.length > 0).map(p => ({...p, defaultModel: p.models.some(m => m.id === p.defaultModel) ? p.defaultModel : p.models[0]!.id}));
  if (!providers.length) throw new Error("No enabled AI provider is available.");
  const defaultProvider = providers.find(p => p.name === config.provider) ?? providers[0]!;
  function resolve(seat?: SeatAssignment) {
    const own = seat?.useMasterSettings === false;
    const level = own ? seat?.intelligenceLevel : config.intelligenceLevel;
    const selected = level === undefined ? null : resolveModelByIntelligence(level, own ? seat?.provider ?? "auto" : "auto", providers);
    const providerId = selected?.provider ?? (seat?.provider && seat.provider !== "auto" ? seat.provider : defaultProvider.name);
    const provider = providers.find(p => p.name === providerId);
    if (!provider) throw new Error(`Provider ${providerId} is disabled or unavailable.`);
    const model = selected?.model ?? seat?.model ?? (providerId === config.provider ? config.model : undefined) ?? provider.defaultModel;
    if (!provider.models.some(m => m.id === model)) throw new Error(`Model ${model} is disabled or unavailable.`);
    return { ...seat, provider: providerId, model };
  }
  const globalSeat = resolve({provider: defaultProvider.name, model: config.model});
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
  for (const p of providers) for (const m of p.models) rates[m.id] = { ...getModelRate(m.id), multiplier: multipliers[m.id] ?? 5 };
  const seats = [config.seatMap.orchestrator, config.seatMap.moderator, config.seatMap.architect, config.seatMap.builder, config.seatMap.auditor, ...config.seatMap.litigants];
  // Conservative reservation uses the most expensive selected model. Settlement
  // uses the actual model of EVERY call and refunds any unused reservation.
  const estimates = await Promise.all(seats.map(async seat => {
    const base = pipelineOnly ? estimateFixedPipelineCost(seat.model) : await estimateSessionCreditsCalibrated({...config, model:seat.model});
    return Math.ceil(base * rates[seat.model!].multiplier / getModelMultiplier(seat.model!));
  }));
  const estimatedCredits = Math.min(config.maxCredits, Math.max(...estimates));
  return { config, rates, estimatedCredits, enabledProviders: providers.map(p => p.name), fallbackModels: Object.fromEntries(providers.map(p => [p.name, p.defaultModel])) };
}

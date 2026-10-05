import { z } from "zod";
import { getProviderAvailability } from "./providerAvailability.js";
import { resolveModelPrice, isSessionModel, PROVIDER_PRICING_URLS, type ModelDefinition } from "./providers/types.js";
import { getMultiplierOverrides, MultiplierSchema } from "./pricingConfig.js";
import { PROVIDER_DISPLAY_NAMES, PROVIDER_MODELS, DEFAULT_MODELS } from "./providers/index.js";
import { CREDIT_VALUE_USD, getCalibratedFixedStageTokens, getModelCreditInfo } from "./creditEngine.js";
import { getFirestoreDb } from "./firebaseAdmin.js";

const isSafeId = (id: string) => !["__proto__", "prototype", "constructor", "updatedAt"].includes(id);
const ModelSchema = z.object({
  id: z.string().trim().min(1).max(200).refine(isSafeId, "Reserved model ID"),
  label: z.string().trim().min(1).max(200),
  inputRatePer1k: z.number().finite().nonnegative(),
  outputRatePer1k: z.number().finite().nonnegative(),
  multiplier: MultiplierSchema,
  qualityScore: z.number().finite().min(0).max(100).default(50),
});
export const CustomProviderSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,99}$/).refine(id => id !== "auto" && isSafeId(id), "Reserved provider ID"),
  label: z.string().trim().min(1).max(200),
  models: z.array(ModelSchema).min(1).max(100),
});
export type CustomProviderDefinition = z.infer<typeof CustomProviderSchema>;

/** Model IDs are unique because saved overrides, scores and run snapshots use them as keys. */
export function validateCustomProviders(custom: CustomProviderDefinition[]): void {
  const providers = new Set(Object.keys(PROVIDER_MODELS));
  const models = new Set(Object.values(PROVIDER_MODELS).flat().map(m => m.id));
  for (const p of custom) {
    if (providers.has(p.id)) throw new Error(`Provider "${p.id}" already exists`);
    providers.add(p.id);
    for (const m of p.models) {
      if (models.has(m.id)) throw new Error(`Model "${m.id}" already exists; model IDs must be unique`);
      models.add(m.id);
    }
  }
}

/** One verified catalog for Admin, selection, quotes and execution.
 * Configuration reads fail closed so a failed read cannot enable disabled models or change prices.
 */
export async function getModelRegistry(refreshAvailability = false) {
  const db = getFirestoreDb();
  const [studio, scores, overrides, fixed] = await Promise.all([
    db?.collection("system_config").doc("aiStudio").get(),
    db?.collection("system_config").doc("modelScores").get(),
    getMultiplierOverrides(),
    getCalibratedFixedStageTokens(),
  ]);
  const config = studio?.data() ?? {};
  const disabledProviders = z.array(z.string()).parse(config.disabledProviders ?? []);
  const disabledModels = z.array(z.string()).parse(config.disabledModels ?? []);
  const customProviders = z.array(CustomProviderSchema).parse(config.customProviders ?? []);
  validateCustomProviders(customProviders);
  const {updatedAt: _updatedAt, ...scoreValues} = scores?.data() ?? {};
  const modelScores = z.record(z.string(), z.number().finite().min(0).max(100)).parse(scoreValues);
  const definitions = [
    ...Object.entries(PROVIDER_MODELS).map(([id, models]) => ({id, label:PROVIDER_DISPLAY_NAMES[id]!, defaultModel:DEFAULT_MODELS[id]!, models, custom:false})),
    ...customProviders.map(p => ({...p, defaultModel:p.models[0]!.id, custom:true})),
  ];
  const providers = await Promise.all(definitions.map(async p => {
    const candidates = p.models.filter((m: ModelDefinition) => !m.retired);
    const connection = await getProviderAvailability(p.id, candidates.map(m => m.id), refreshAvailability);
    return {
      name:p.id, displayName:p.label, defaultModel:p.defaultModel, custom:p.custom,
      discoveredModels:(connection.discoveredModels ?? []).filter(m => isSessionModel(p.id, m.id) && !p.models.some(known => known.id === m.id)),
      pricingUrl:PROVIDER_PRICING_URLS[p.id],
      configured:connection.state !== "not_configured", connection, enabled:!disabledProviders.includes(p.id),
      models:candidates.filter(m => connection.modelIds.includes(m.id)).map((m: ModelDefinition) => {
        const multiplier = MultiplierSchema.parse(overrides[m.id] ?? m.multiplier);
        const price = resolveModelPrice(m, multiplier);
        return {
          id:m.id, label:m.label, qualityScore:modelScores[m.id] ?? m.qualityScore, defaultQualityScore:m.qualityScore,
          unsupportedReason:m.unsupportedReason, enabled:!disabledModels.includes(m.id), defaultMultiplier:m.multiplier,
          pricing:m.pricing ? {...m.pricing, ...(price.cachedInput !== undefined ? {cachedInputPer1k:price.cachedInput} : {})} : {note:"Custom rate entered by administrator."},
          price, creditInfo:getModelCreditInfo(m.id, price, fixed),
        };
      }),
    };
  }));
  return {creditValueUsd:CREDIT_VALUE_USD, providers, disabledProviders, customProviders};
}

export async function getProviderCatalog() {
  const registry = await getModelRegistry();
  const providers = registry.providers.filter(p => p.configured && p.enabled).map(p => {
    const models = p.models.filter(m => m.enabled && !m.unsupportedReason);
    const {discoveredModels:_discovered, pricingUrl:_pricingUrl, connection:{discoveredModels:_listed, ...connection}, ...publicProvider} = p;
    return {...publicProvider, connection, models, defaultModel:models.some(m => m.id === p.defaultModel) ? p.defaultModel : models[0]?.id ?? ""};
  }).filter(p => p.models.length > 0);
  return {configured:providers.map(p => p.name), creditValueUsd:registry.creditValueUsd, providers};
}

export async function getAdminPricingTable(refreshAvailability = false) {
  const registry = await getModelRegistry(refreshAvailability);
  return {
    creditValueUsd:registry.creditValueUsd,
    providers:registry.providers.map(p => ({
      id:p.name, label:p.displayName, enabled:p.enabled, modelCount:p.models.length,
      connection:{state:p.connection.state, checkedAt:p.connection.checkedAt},
    })),
    models:registry.providers.flatMap(p => p.models.map(m => ({
      model:m.id, provider:p.name, providerLabel:p.displayName, label:m.label, pricing:m.pricing,
      available:p.configured && p.enabled && m.enabled && !m.unsupportedReason,
      inputRatePer1k:m.creditInfo.inputRatePer1k, outputRatePer1k:m.creditInfo.outputRatePer1k,
      defaultMultiplier:m.defaultMultiplier, effectiveMultiplier:m.creditInfo.multiplier,
      isOverridden:m.defaultMultiplier !== m.creditInfo.multiplier,
      exampleCredits:m.creditInfo.exampleSessionCredits,
    }))),
  };
}

export async function getAiStudioModels() {
  const registry = await getModelRegistry(true);
  return {
    disabledProviders:registry.disabledProviders, customProviders:registry.customProviders,
    providers:registry.providers.filter(p => p.configured).map(p => ({id:p.name,label:p.displayName,custom:p.custom,enabled:p.enabled,
      discoveredModels:p.discoveredModels, pricingUrl:p.pricingUrl,
      connection:{state:p.connection.state,checkedAt:p.connection.checkedAt},
    })),
    models:registry.providers.flatMap(p => p.models.map(m => ({
      id:m.id, label:m.label, provider:p.name, providerLabel:p.displayName, pricing:m.pricing, unsupportedReason:m.unsupportedReason,
      inputRatePer1k:m.creditInfo.inputRatePer1k, outputRatePer1k:m.creditInfo.outputRatePer1k,
      multiplier:m.creditInfo.multiplier,
      userInputPer1k:m.creditInfo.inputRatePer1k * m.creditInfo.multiplier,
      userOutputPer1k:m.creditInfo.outputRatePer1k * m.creditInfo.multiplier,
      exampleCredits:m.creditInfo.exampleSessionCredits, qualityScore:m.qualityScore,
      enabled:m.enabled, available:p.configured && p.enabled && m.enabled && !m.unsupportedReason, custom:p.custom,
    }))),
  };
}

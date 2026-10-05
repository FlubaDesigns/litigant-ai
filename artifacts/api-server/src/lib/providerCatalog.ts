import { z } from "zod";
import type { ModelDefinition } from "./providers/types.js";
import { getMultiplierOverrides } from "./pricingConfig.js";
import { getConfiguredProvidersAsync, PROVIDER_DISPLAY_NAMES, PROVIDER_MODELS, DEFAULT_MODELS } from "./providers/index.js";
import { CREDIT_VALUE_USD, getCalibratedFixedStageTokens, getModelCreditInfo } from "./creditEngine.js";
import { getFirestoreDb } from "./firebaseAdmin.js";

const isSafeId = (id: string) => !["__proto__", "prototype", "constructor", "updatedAt"].includes(id);
const ModelSchema = z.object({
  id: z.string().trim().min(1).max(200).refine(isSafeId, "Reserved model ID"),
  label: z.string().trim().min(1).max(200),
  inputRatePer1k: z.number().finite().nonnegative(),
  outputRatePer1k: z.number().finite().nonnegative(),
  multiplier: z.number().finite().min(1).max(100),
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

/** One resolved catalog. Admin sees all definitions; execution selects available entries below.
 * Configuration reads fail closed so a failed read cannot enable disabled models or change prices.
 */
export async function getModelRegistry() {
  const db = getFirestoreDb();
  const [configured, studio, scores, overrides, fixed] = await Promise.all([
    getConfiguredProvidersAsync(),
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
  const providers = definitions.map(p => ({
    name:p.id, displayName:p.label, defaultModel:p.defaultModel, custom:p.custom,
    configured:configured.includes(p.id), enabled:!disabledProviders.includes(p.id),
    models:p.models.map((m: ModelDefinition) => {
      const multiplier = z.number().finite().min(1).max(100).parse(overrides[m.id] ?? m.multiplier);
      const price = {input:m.inputRatePer1k, output:m.outputRatePer1k, multiplier};
      return {
        id:m.id, label:m.label, qualityScore:modelScores[m.id] ?? m.qualityScore, defaultQualityScore:m.qualityScore,
        enabled:!disabledModels.includes(m.id), defaultMultiplier:m.multiplier,
        pricing:m.pricing ?? {note:"Custom rate entered by administrator."},
        creditInfo:getModelCreditInfo(m.id, price, fixed),
      };
    }),
  }));
  return {creditValueUsd:CREDIT_VALUE_USD, providers, disabledProviders, customProviders};
}

export async function getProviderCatalog() {
  const registry = await getModelRegistry();
  const providers = registry.providers.filter(p => p.configured && p.enabled).map(p => {
    const models = p.models.filter(m => m.enabled);
    return {...p, models, defaultModel:models.some(m => m.id === p.defaultModel) ? p.defaultModel : models[0]?.id ?? ""};
  }).filter(p => p.models.length > 0);
  return {configured:providers.map(p => p.name), creditValueUsd:registry.creditValueUsd, providers};
}

export async function getAdminPricingTable() {
  const registry = await getModelRegistry();
  return {
    creditValueUsd:registry.creditValueUsd,
    models:registry.providers.flatMap(p => p.models.map(m => ({
      model:m.id, provider:p.name, label:m.label,
      inputRatePer1k:m.creditInfo.inputRatePer1k, outputRatePer1k:m.creditInfo.outputRatePer1k,
      defaultMultiplier:m.defaultMultiplier, effectiveMultiplier:m.creditInfo.multiplier,
      isOverridden:m.defaultMultiplier !== m.creditInfo.multiplier,
      exampleCredits:m.creditInfo.exampleSessionCredits,
    }))),
  };
}

export async function getAiStudioModels() {
  const registry = await getModelRegistry();
  return {
    disabledProviders:registry.disabledProviders, customProviders:registry.customProviders,
    models:registry.providers.flatMap(p => p.models.map(m => ({
      id:m.id, label:m.label, provider:p.name, providerLabel:p.displayName, pricing:m.pricing,
      inputRatePer1k:m.creditInfo.inputRatePer1k, outputRatePer1k:m.creditInfo.outputRatePer1k,
      multiplier:m.creditInfo.multiplier,
      userInputPer1k:m.creditInfo.inputRatePer1k * m.creditInfo.multiplier,
      userOutputPer1k:m.creditInfo.outputRatePer1k * m.creditInfo.multiplier,
      exampleCredits:m.creditInfo.exampleSessionCredits, qualityScore:m.qualityScore,
      enabled:m.enabled, available:p.configured && p.enabled && m.enabled, custom:p.custom,
    }))),
  };
}

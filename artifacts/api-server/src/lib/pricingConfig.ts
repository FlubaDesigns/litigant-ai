/**
 * Pricing Config — Firestore-backed, live-adjustable multipliers.
 *
 * Admins can override any model's markup multiplier at runtime via
 * Admin → Pricing (or PUT /admin/pricing/:model) without redeploying.
 * Changes propagate within 60 seconds (CACHE_TTL_MS).
 *
 * ## Priority
 *   Firestore override  →  MODEL_MULTIPLIERS hardcoded default
 *
 * ## Firestore location
 *   Collection: config
 *   Document:   pricing
 *   Shape:      { multipliers: { "gpt-4o": 7, "claude-opus-4-5": 4 }, updatedAt }
 *
 * ## Key distinction vs creditEngine.ts
 *   creditEngine.ts functions (calculateActualCredits, usdToCredits) use the
 *   HARDCODED multiplier — fast, no async, suitable for pre-run estimates.
 *
 *   calculateLiveCredits() here uses the FIRESTORE multiplier — async, used
 *   for post-run settlement so admin overrides are always reflected in
 *   what the user is actually charged.
 *
 * See docs/credits.md §4 for the full multiplier reference.
 */
import { getFirestoreDb } from "./firebaseAdmin.js";
import { MODEL_MULTIPLIERS, MODEL_RATES, CREDIT_VALUE_USD, getCalibratedFixedStageTokens, type ModelRate } from "./creditEngine.js";
import { FieldValue } from "firebase-admin/firestore";

interface PricingDoc {
  multipliers?: Record<string, number>;
  updatedAt?: unknown;
}

// ── In-memory cache ───────────────────────────────────────────────────────────
let _cache: PricingDoc | null = null;
let _cacheExpiry = 0;

/**
 * Cache TTL in milliseconds.
 * After a multiplier write, the cache is immediately invalidated
 * (invalidateMultiplierCache) so the next request picks up the change
 * rather than waiting the full TTL.
 */
const CACHE_TTL_MS = 60_000;

/**
 * Force-clears the in-memory multiplier cache.
 * Called automatically after every PUT or DELETE to /admin/pricing/:model
 * so changes take effect on the very next request rather than after TTL expiry.
 */
export function invalidateMultiplierCache(): void {
  _cache = null;
  _cacheExpiry = 0;
}

/**
 * Returns the merged multiplier table: hardcoded defaults overridden by
 * any admin-set Firestore values.
 *
 * Reads Firestore at most once per 60 seconds (cached in memory).
 * Falls back to hardcoded defaults if Firebase is not configured or on error.
 */
export async function getMultiplierOverrides(): Promise<Record<string, number>> {
  const now = Date.now();
  if (_cache !== null && now < _cacheExpiry) {
    return { ...MODEL_MULTIPLIERS, ...(_cache.multipliers ?? {}) };
  }

  const db = getFirestoreDb();
  if (!db) return { ...MODEL_MULTIPLIERS };

  try {
    const doc = await db.collection("config").doc("pricing").get();
    _cache = doc.exists ? (doc.data() as PricingDoc) : {};
    _cacheExpiry = now + CACHE_TTL_MS;
    return { ...MODEL_MULTIPLIERS, ...(_cache.multipliers ?? {}) };
  } catch {
    // Non-fatal: fall back to hardcoded defaults if Firestore is unreachable
    return { ...MODEL_MULTIPLIERS };
  }
}

/**
 * Returns the effective multiplier for a single model.
 *
 * Checks for a Firestore admin override first; falls back to the hardcoded
 * default; falls back to 5 if neither exists (unknown model).
 */
export async function getEffectiveMultiplier(model: string): Promise<number> {
  const overrides = await getMultiplierOverrides();
  return overrides[model] ?? MODEL_MULTIPLIERS[model] ?? 5;
}

/**
 * Calculates the POST-RUN credit charge using real token counts and the
 * LIVE (Firestore-backed) multiplier.
 *
 * This is the authoritative settlement function — called in brain.ts after
 * the session completes, before writing the reconciliation ledger entry.
 * Always use this (not calculateActualCredits from creditEngine.ts) for
 * settlement so that admin multiplier overrides are always reflected.
 *
 * Formula: ceil( (in/1K × inRate + out/1K × outRate) × liveMultiplier / $0.01 )
 *
 * @param model - AI model ID used in the session.
 * @param inputTokens - Total prompt tokens (tracked in brainEngine.ts).
 * @param outputTokens - Total completion tokens (tracked in brainEngine.ts).
 */
export async function calculateLiveCredits(
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<number> {
  const multiplier = await getEffectiveMultiplier(model);
  const rate: ModelRate = MODEL_RATES[model] ?? { input: 0.003, output: 0.015 };
  const costUSD = (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output;
  return Math.max(1, Math.ceil((costUSD * multiplier) / CREDIT_VALUE_USD));
}

// ── Admin pricing table ───────────────────────────────────────────────────────

/**
 * Metadata used to render the admin pricing table.
 * Kept in pricingConfig.ts (not creditEngine.ts) to avoid bloating the
 * engine with display-only data.
 */
const MODEL_META: Record<string, { provider: string; label: string }> = {
  "gpt-4o":            { provider: "openai",    label: "GPT-4o" },
  "gpt-4o-mini":       { provider: "openai",    label: "GPT-4o Mini" },
  "o3":                { provider: "openai",    label: "o3 (reasoning)" },
  "o4-mini":           { provider: "openai",    label: "o4-mini (reasoning)" },
  "claude-opus-4-5":   { provider: "anthropic", label: "Claude Opus 4.5" },
  "claude-sonnet-4-5": { provider: "anthropic", label: "Claude Sonnet 4.5" },
  "claude-haiku-4-5":  { provider: "anthropic", label: "Claude Haiku 4.5" },
  "grok-3":            { provider: "grok",      label: "Grok 3" },
  "grok-3-mini":       { provider: "grok",      label: "Grok 3 Mini" },
  "grok-2":            { provider: "grok",      label: "Grok 2" },
  "gemini-2.5-pro":    { provider: "gemini",    label: "Gemini 2.5 Pro" },
  "gemini-2.5-flash":  { provider: "gemini",    label: "Gemini 2.5 Flash" },
  "gemini-2.0-flash":  { provider: "gemini",    label: "Gemini 2.0 Flash" },
};

/**
 * Builds the full pricing table for the Admin → Pricing tab.
 *
 * The "example" columns use a representative default session:
 *   3 litigants, 2 rounds, balanced response mode
 *   → ~13 000 input tokens, ~5 600 output tokens
 *
 * Returns creditValueUsd so the frontend can compute example cost-in-USD
 * without hardcoding $0.01.
 */
export async function getAdminPricingTable(): Promise<{
  creditValueUsd: number;
  models: {
    model: string;
    provider: string;
    label: string;
    inputRatePer1k: number;
    outputRatePer1k: number;
    defaultMultiplier: number;
    effectiveMultiplier: number;
    isOverridden: boolean;
    exampleCostUsd: number;
    exampleCredits: number;
  }[];
}> {
  const overrides = await getMultiplierOverrides();

  // Representative default session: 3 litigants, 2 rounds, balanced (600 tokens/turn).
  // Variable part is computed from the same formula as estimateSessionCredits().
  // Fixed part comes from getCalibratedFixedStageTokens() — real observed averages
  // from the last 50 sessions, or FIXED_STAGE_PRIOR until enough data accumulates.
  const EXAMPLE_LITIGANTS = 3, EXAMPLE_ROUNDS = 2, TOKENS_PER_TURN = 600;
  const variableOutput = 400 + EXAMPLE_LITIGANTS * EXAMPLE_ROUNDS * TOKENS_PER_TURN;
  const variableInput  = Math.ceil(
    EXAMPLE_LITIGANTS * EXAMPLE_ROUNDS *
    (600 + TOKENS_PER_TURN * EXAMPLE_LITIGANTS * 0.85 * (EXAMPLE_ROUNDS / 2))
  );
  const exampleFixed   = await getCalibratedFixedStageTokens();
  const EXAMPLE_INPUT  = variableInput  + exampleFixed.input;
  const EXAMPLE_OUTPUT = variableOutput + exampleFixed.output;

  const models = Object.entries(MODEL_RATES).map(([model, rate]) => {
    const defaultMultiplier   = MODEL_MULTIPLIERS[model] ?? 5;
    const effectiveMultiplier = overrides[model] ?? defaultMultiplier;
    const exampleCostUsd =
      (EXAMPLE_INPUT / 1000) * rate.input + (EXAMPLE_OUTPUT / 1000) * rate.output;
    const exampleCredits = Math.max(
      1,
      Math.ceil((exampleCostUsd * effectiveMultiplier) / CREDIT_VALUE_USD)
    );
    const meta = MODEL_META[model] ?? { provider: "unknown", label: model };

    return {
      model,
      provider:           meta.provider,
      label:              meta.label,
      inputRatePer1k:     rate.input,
      outputRatePer1k:    rate.output,
      defaultMultiplier,
      effectiveMultiplier,
      // isOverridden: only true when the Firestore value differs from the hardcoded default.
      // A value equal to the default is not counted as an override (user might have
      // set it back manually).
      isOverridden:
        overrides[model] !== undefined &&
        overrides[model] !== defaultMultiplier,
      exampleCostUsd: Math.round(exampleCostUsd * 10000) / 10000,
      exampleCredits,
    };
  });

  return { creditValueUsd: CREDIT_VALUE_USD, models };
}

// ── Admin write operations ────────────────────────────────────────────────────

/**
 * Saves a multiplier override to Firestore and immediately invalidates
 * the in-memory cache so the change takes effect on the next request.
 *
 * Uses merge:true so other overrides in the same document are untouched.
 *
 * @param model - Model ID (must match a key in MODEL_RATES).
 * @param multiplier - New multiplier. Must be validated (1–100) before calling.
 */
export async function saveMultiplierOverride(model: string, multiplier: number): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured");

  await db.collection("config").doc("pricing").set(
    { multipliers: { [model]: multiplier }, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  invalidateMultiplierCache();
}

/**
 * Removes a model's Firestore override, restoring its hardcoded default.
 *
 * Reads the document, deletes the key, and writes the full multipliers map
 * back (rather than using FieldValue.delete() on a nested key, which requires
 * knowing the full path at write time).
 */
export async function resetMultiplierToDefault(model: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured");

  const ref = db.collection("config").doc("pricing");
  const doc = await ref.get();
  if (!doc.exists) return;

  const data      = doc.data() as PricingDoc;
  const multipliers = { ...(data.multipliers ?? {}) };
  delete multipliers[model];

  await ref.set({ multipliers, updatedAt: FieldValue.serverTimestamp() });
  invalidateMultiplierCache();
}

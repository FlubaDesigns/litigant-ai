/**
 * API Key Store — Firestore-backed, server-side only.
 * Keys are never sent to the client. The admin UI only sees masked versions.
 *
 * Priority: Firestore override → environment variable → not configured
 *
 * Firestore shape: config/apiKeys → {
 *   providers: {
 *     "openai":   { key: "sk-...", baseUrl?: string, label: "OpenAI", maskedKey: "sk-...xxxx", updatedAt: ... },
 *     "my-gpt":   { key: "...",    baseUrl: "https://api.mygpt.com/v1", label: "MyGPT", ... },
 *   }
 * }
 */
import { getFirestoreDb } from "./firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

export interface StoredProvider {
  key: string;
  baseUrl?: string;
  label: string;
  maskedKey: string;
  updatedAt?: unknown;
}

export interface ProviderKeyInfo {
  id: string;
  label: string;
  maskedKey: string;
  baseUrl?: string;
  source: "firestore" | "env";
  updatedAt?: string;
}

// ── Env var fallback map ──────────────────────────────────────────────────────
const ENV_KEY_MAP: Record<string, string> = {
  openai:    "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  grok:      "XAI_API_KEY",
  gemini:    "GEMINI_API_KEY",
};

const ENV_BASE_URL_MAP: Record<string, string | undefined> = {
  openai:    process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
  anthropic: undefined,
  grok:      "https://api.x.ai/v1",
  gemini:    "https://generativelanguage.googleapis.com/v1beta/openai",
};

const ENV_LABEL_MAP: Record<string, string> = {
  openai:    "OpenAI",
  anthropic: "Anthropic (Claude)",
  grok:      "xAI Grok",
  gemini:    "Google Gemini",
};

// ── In-memory cache ───────────────────────────────────────────────────────────
let _cache: Record<string, StoredProvider> | null = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

export function invalidateApiKeyCache(): void {
  _cache = null;
  _cacheExpiry = 0;
}

async function loadFromFirestore(): Promise<Record<string, StoredProvider>> {
  const now = Date.now();
  if (_cache !== null && now < _cacheExpiry) return _cache;

  const db = getFirestoreDb();
  if (!db) {
    _cache = {};
    _cacheExpiry = now + CACHE_TTL_MS;
    return _cache;
  }

  try {
    const doc = await db.collection("config").doc("apiKeys").get();
    _cache = (doc.data()?.providers as Record<string, StoredProvider>) ?? {};
    _cacheExpiry = now + CACHE_TTL_MS;
    return _cache;
  } catch {
    _cache = {};
    _cacheExpiry = now + CACHE_TTL_MS;
    return _cache;
  }
}

/** Returns the API key for a provider — Firestore first, env var fallback */
export async function getApiKey(providerId: string): Promise<{ key: string; baseUrl?: string } | null> {
  const stored = await loadFromFirestore();

  if (stored[providerId]?.key) {
    return { key: stored[providerId]!.key, baseUrl: stored[providerId]!.baseUrl };
  }

  // Replit proxy for OpenAI
  if (
    providerId === "openai" &&
    process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] &&
    process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]
  ) {
    return {
      key: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]!,
      baseUrl: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
    };
  }

  const envVar = ENV_KEY_MAP[providerId];
  if (envVar && process.env[envVar]) {
    return { key: process.env[envVar]!, baseUrl: ENV_BASE_URL_MAP[providerId] };
  }

  return null;
}

/** Returns all configured providers (for /providers endpoint + admin UI) */
export async function getAllConfiguredProviders(): Promise<ProviderKeyInfo[]> {
  const stored = await loadFromFirestore();
  const result: ProviderKeyInfo[] = [];
  const seen = new Set<string>();

  // Firestore-stored providers first
  for (const [id, info] of Object.entries(stored)) {
    if (!info.key) continue;
    seen.add(id);
    result.push({
      id,
      label: info.label,
      maskedKey: info.maskedKey,
      baseUrl: info.baseUrl,
      source: "firestore",
      updatedAt: info.updatedAt
        ? new Date((info.updatedAt as any).toDate?.() ?? info.updatedAt).toISOString()
        : undefined,
    });
  }

  // Env-var providers not already in Firestore
  // Replit proxy for OpenAI
  if (
    !seen.has("openai") &&
    process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] &&
    process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]
  ) {
    seen.add("openai");
    result.push({
      id: "openai",
      label: "OpenAI (Replit proxy)",
      maskedKey: maskKey(process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]!),
      baseUrl: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
      source: "env",
    });
  }

  for (const [id, envVar] of Object.entries(ENV_KEY_MAP)) {
    if (seen.has(id)) continue;
    const val = process.env[envVar];
    if (!val) continue;
    result.push({
      id,
      label: ENV_LABEL_MAP[id] ?? id,
      maskedKey: maskKey(val),
      baseUrl: ENV_BASE_URL_MAP[id],
      source: "env",
    });
  }

  return result;
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 6) + "••••••••" + key.slice(-4);
}

/** Save or update a provider's API key in Firestore */
export async function saveApiKey(
  providerId: string,
  key: string,
  label: string,
  baseUrl?: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured");

  const sanitizedId = providerId.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

  await db.collection("config").doc("apiKeys").set(
    {
      providers: {
        [sanitizedId]: {
          key,
          label,
          baseUrl: baseUrl ?? null,
          maskedKey: maskKey(key),
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
    },
    { merge: true }
  );

  invalidateApiKeyCache();
}

/** Remove a provider's Firestore key (env var fallback still applies) */
export async function deleteApiKey(providerId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured");

  const doc = await db.collection("config").doc("apiKeys").get();
  if (!doc.exists) return;

  const data = doc.data() as { providers?: Record<string, unknown> };
  const providers = { ...(data.providers ?? {}) };
  delete providers[providerId];

  await db
    .collection("config")
    .doc("apiKeys")
    .set({ providers, updatedAt: FieldValue.serverTimestamp() });

  invalidateApiKeyCache();
}

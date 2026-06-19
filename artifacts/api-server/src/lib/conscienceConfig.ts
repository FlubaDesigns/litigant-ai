/**
 * conscienceConfig.ts
 *
 * Loads the Canon v2 conscience clause from Firestore `system_config/conscience`.
 * Falls back to the hardcoded Canon v2 text when Firestore is unavailable or the
 * document doesn't exist yet.
 *
 * Firestore schema — system_config/conscience:
 *   text:        string    — the full conscience clause injected into every prompt
 *   version:     string    — e.g. "v2.1" or "2026-06-19"
 *   updatedAt:   Timestamp
 *   updatedBy:   string    — admin uid who last wrote it
 *
 * Cache: module-level, 5-minute TTL.  Cloud Run may run multiple instances;
 * all of them pick up updates within one TTL window without any Cloud Function.
 * Call invalidateConscienceCache() from the admin PATCH route to force an
 * immediate refresh on the local instance.
 */

import { getFirestoreDb } from "./firebaseAdmin.js";

// ── Canon v2 fallback ─────────────────────────────────────────────────────────
// Used when Firestore is unavailable or the document doesn't exist.
// Must match the intent of AI-COMMS Canon v2: Execution-Honest mandate.
export const CANON_V2_FALLBACK_TEXT = `\n\nCONSCIENCE MANDATE — EXECUTION-HONEST (Canon v2):
Apply these checks before outputting. Violations must be corrected, not softened.
(1) TRUTH FIRST: State what the evidence actually shows. If the honest conclusion is uncomfortable or unwelcome, say it plainly. Do not soften, hedge, or bury it.
(2) VERIFY BEFORE ASSERTING: Only claim what you can actually substantiate. If you are uncertain, say so explicitly — "I don't know" is a valid and required answer when true.
(3) NO DIPLOMATIC EVASION: Do not give a balanced non-answer to avoid conflict. If one side is stronger, say so. If something is wrong, say it is wrong.
(4) EXPOSE GAPS: State what information is missing that would materially change the conclusion. Do not imply completeness you don't have.
(5) EXECUTION-HONEST: If your reasoning led you somewhere you didn't expect, report it. Do not reverse-engineer your argument to fit a predetermined conclusion.`;

export const CANON_V2_FALLBACK_VERSION = "v2.0-canon";

// ── In-process TTL cache ──────────────────────────────────────────────────────
const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ConscienceCache {
  text: string;
  version: string;
  fetchedAt: number;
}

let _cache: ConscienceCache | null = null;

/**
 * Returns the active conscience clause text and its version string.
 * Reads from Firestore at most once per TTL window; falls back to Canon v2
 * hardcoded text if Firestore is unavailable.
 */
export async function getConscienceClause(): Promise<{ text: string; version: string }> {
  if (_cache && Date.now() - _cache.fetchedAt < TTL_MS) {
    return { text: _cache.text, version: _cache.version };
  }

  const db = getFirestoreDb();
  if (!db) {
    return { text: CANON_V2_FALLBACK_TEXT, version: CANON_V2_FALLBACK_VERSION };
  }

  try {
    const doc = await db.collection("system_config").doc("conscience").get();

    if (!doc.exists) {
      _cache = { text: CANON_V2_FALLBACK_TEXT, version: CANON_V2_FALLBACK_VERSION, fetchedAt: Date.now() };
      return { text: CANON_V2_FALLBACK_TEXT, version: CANON_V2_FALLBACK_VERSION };
    }

    const data = doc.data()!;
    const text = (data["text"] as string | undefined)?.trim() || CANON_V2_FALLBACK_TEXT;
    const version = (data["version"] as string | undefined)?.trim() || CANON_V2_FALLBACK_VERSION;

    _cache = { text, version, fetchedAt: Date.now() };
    return { text, version };
  } catch (err) {
    // Firestore error — use fallback without caching so the next request retries
    console.warn("[conscienceConfig] Firestore read failed, using Canon v2 fallback:", err);
    return { text: CANON_V2_FALLBACK_TEXT, version: CANON_V2_FALLBACK_VERSION };
  }
}

/**
 * Force-clears the in-process cache.
 * Called by the admin PATCH endpoint immediately after writing to Firestore
 * so this instance picks up the new text on the next session.
 */
export function invalidateConscienceCache(): void {
  _cache = null;
}

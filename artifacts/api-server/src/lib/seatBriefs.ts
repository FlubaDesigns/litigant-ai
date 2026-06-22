/**
 * seatBriefs.ts
 *
 * Loads the per-seat role brief for each courtroom seat from:
 *   1. Firestore `system_config/seat_briefs` (admin-editable at runtime)
 *   2. Falls back to the bundled markdown files in `../seats/*.md`
 *
 * Firestore document shape — system_config/seat_briefs:
 *   orchestrator: string  — full markdown brief
 *   moderator:    string
 *   architect:    string
 *   builder:      string
 *   auditor:      string
 *   litigant:     string  — shared base brief for all litigant seats
 *   updatedAt:    Timestamp
 *   updatedBy:    string  — admin uid
 *
 * Cache: module-level, 5-minute TTL. Call invalidateSeatBriefsCache() from
 * the admin PATCH route to force an immediate refresh on the local instance.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getFirestoreDb } from "./firebaseAdmin.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEATS_DIR = join(__dirname, "../seats");

export type SeatId = "orchestrator" | "moderator" | "architect" | "builder" | "auditor" | "litigant";

export const SEAT_IDS: SeatId[] = [
  "orchestrator",
  "moderator",
  "architect",
  "builder",
  "auditor",
  "litigant",
];

// ── File fallbacks — read once at startup ─────────────────────────────────────
function loadFileFallback(seatId: SeatId): string {
  try {
    return readFileSync(join(SEATS_DIR, `${seatId}.md`), "utf8").trim();
  } catch {
    return `You are the ${seatId}. Perform your role faithfully.`;
  }
}

const FILE_FALLBACKS: Record<SeatId, string> = {
  orchestrator: loadFileFallback("orchestrator"),
  moderator:    loadFileFallback("moderator"),
  architect:    loadFileFallback("architect"),
  builder:      loadFileFallback("builder"),
  auditor:      loadFileFallback("auditor"),
  litigant:     loadFileFallback("litigant"),
};

// ── In-process TTL cache ──────────────────────────────────────────────────────
const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface BriefsCache {
  briefs: Record<SeatId, string>;
  fetchedAt: number;
}

let _cache: BriefsCache | null = null;

/**
 * Returns all seat briefs. Reads from Firestore at most once per TTL window;
 * merges with file fallbacks so missing Firestore keys still get a brief.
 */
export async function getAllSeatBriefs(): Promise<Record<SeatId, string>> {
  if (_cache && Date.now() - _cache.fetchedAt < TTL_MS) {
    return _cache.briefs;
  }

  const db = getFirestoreDb();
  if (!db) {
    return { ...FILE_FALLBACKS };
  }

  try {
    const doc = await db.collection("system_config").doc("seat_briefs").get();
    const data = doc.exists ? (doc.data() ?? {}) : {};

    const briefs = { ...FILE_FALLBACKS };
    for (const id of SEAT_IDS) {
      const override = (data[id] as string | undefined)?.trim();
      if (override) briefs[id] = override;
    }

    _cache = { briefs, fetchedAt: Date.now() };
    return briefs;
  } catch (err) {
    console.warn("[seatBriefs] Firestore read failed, using file fallbacks:", err);
    return { ...FILE_FALLBACKS };
  }
}

/**
 * Returns a single seat brief by id.
 */
export async function getSeatBrief(seatId: SeatId): Promise<string> {
  const all = await getAllSeatBriefs();
  return all[seatId] ?? FILE_FALLBACKS[seatId];
}

/**
 * Force-clears the in-process cache.
 * Called by the admin PATCH endpoint after writing to Firestore.
 */
export function invalidateSeatBriefsCache(): void {
  _cache = null;
}

/**
 * Returns the raw file content for a seat (not the Firestore override).
 * Used by the admin UI to display the "factory default" text.
 */
export function getSeatBriefFileDefault(seatId: SeatId): string {
  return FILE_FALLBACKS[seatId];
}

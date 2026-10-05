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
 * Read once when a run starts; no per-instance cache or background polling.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getFirestoreDb } from "./firebaseAdmin.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEATS_DIR = existsSync(join(__dirname, "seats")) ? join(__dirname, "seats") : join(__dirname, "../seats");

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

/** One persisted snapshot for both the editor and the execution engine. */
export async function getSeatBriefsConfig() {
  const db = getFirestoreDb();
  const doc = db ? await db.collection("system_config").doc("seat_briefs").get() : null;
  const data = doc?.exists ? (doc.data() ?? {}) : {};
  const overrides: Partial<Record<SeatId, string>> = {};
  for (const id of SEAT_IDS) {
    if (typeof data[id] === "string" && data[id].trim()) overrides[id] = data[id];
  }
  return {
    active: { ...FILE_FALLBACKS, ...overrides },
    defaults: { ...FILE_FALLBACKS },
    overrides,
    seatIds: SEAT_IDS,
  };
}

/** Reads the saved rules at run start. Read failures must not replace them with defaults. */
export async function getAllSeatBriefs(): Promise<Record<SeatId, string>> {
  return (await getSeatBriefsConfig()).active;
}

export async function getSeatBrief(seatId: SeatId): Promise<string> {
  return (await getAllSeatBriefs())[seatId];
}

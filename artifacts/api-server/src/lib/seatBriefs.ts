import { ConfigurationUnavailableError } from "./configurationError.js";
/**
 * seatBriefs.ts
 *
 * Loads the per-seat role brief for each courtroom seat from:
 *   1. Firestore `system_config/seat_briefs` (admin-editable at runtime)
 *   2. Uses `../seats/*.md` as the declared defaults when no override exists
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

// ── Bundled defaults — required files; never invent a replacement role ─────────────────────────────────────
function loadFileDefault(seatId: SeatId): string {
  try {
    const text = readFileSync(join(SEATS_DIR, `${seatId}.md`), "utf8").trim();
    if (!text) throw new Error("Empty seat instructions");
    return text;
  } catch {
    throw new ConfigurationUnavailableError(`Bundled ${seatId} instructions`);
  }
}

function fileDefaults(): Record<SeatId, string> {
  return Object.fromEntries(SEAT_IDS.map(id => [id, loadFileDefault(id)])) as Record<SeatId, string>;
}

/** One persisted snapshot for both the editor and the execution engine. */
export async function getSeatBriefsConfig() {
  const db = getFirestoreDb();
  if (!db) throw new ConfigurationUnavailableError("Saved seat instructions");
  const doc = await db.collection("system_config").doc("seat_briefs").get();
  const defaults = fileDefaults();
  const data = doc?.exists ? (doc.data() ?? {}) : {};
  const overrides: Partial<Record<SeatId, string>> = {};
  for (const id of SEAT_IDS) {
    if (Object.hasOwn(data, id)) {
      if (typeof data[id] !== "string" || !data[id].trim()) throw new ConfigurationUnavailableError(`Saved ${id} instructions`);
      overrides[id] = data[id];
    }
  }
  return {
    active: { ...defaults, ...overrides },
    defaults: { ...defaults },
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

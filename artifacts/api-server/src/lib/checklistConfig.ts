/**
 * Setup Checklist — Firestore-backed checkable to-do list surfaced in
 * Admin → Setup Checklist.
 *
 * Two sections:
 *   "agent" — code-level fixes/audit follow-ups the engineering agent owns.
 *   "owner" — manual, non-code actions only the product owner can do
 *             (secrets, third-party accounts, business/product decisions,
 *             legal content, deployment).
 *
 * Only the checked/unchecked state is persisted (Firestore, keyed by item
 * id) — item text lives in code (DEFAULT_CHECKLIST_ITEMS below) so it can
 * evolve without a migration. Unknown ids in the stored state (e.g. after
 * an item is removed from code) are ignored; new items default to
 * unchecked until explicitly checked.
 *
 * Firestore location: system_config/checklist_state — { [itemId]: boolean }
 */
import { getFirestoreDb } from "./firebaseAdmin.js";

export type ChecklistSection = "agent" | "owner";

export interface ChecklistItemDef {
  id: string;
  section: ChecklistSection;
  text: string;
  note?: string;
  steps?: string[];
  recurring?: boolean;
}

export interface ChecklistItem extends ChecklistItemDef {
  checked: boolean;
}

// Current launch acceptance checks. Versioned IDs keep old completion flags
// from marking new checks as verified.
export const DEFAULT_CHECKLIST_ITEMS: ChecklistItemDef[] = [
  {id:"launch-feedback-boundary-v2",section:"agent",text:"Verify authenticated feedback and deployed Firestore denial",note:"API validation/throttling and the Firestore rule must both be deployed. Test anonymous and cross-account rejection."},
  {id:"launch-document-limits-v2",section:"agent",text:"Verify document rate limits and worker termination",note:"Admin Limits controls hourly requests and extraction timeout; verify real PDF/DOCX extraction and timeout behavior."},
  {id:"launch-readiness-v2",section:"agent",text:"Verify readiness and failure reporting",note:"/api/health checks database readiness; /api/live checks only the process. Admin health reports degraded when recent failures exist."},
  {id:"launch-credit-retry-v2",section:"agent",text:"Verify duplicate adjustment protection",note:"Retry the same request ID and confirm one ledger entry. Different details with that ID must be rejected."},
  {id:"launch-fluba-connections-v2",section:"owner",text:"Verify centralized Fluba provider connections",note:"Manage provider keys in Fluba. Check Litigant AI connections in AI Studio. Do not create duplicate provider keys or deploy directly from Cloud Run.",recurring:true},
  {id:"launch-customer-journey-v2",section:"owner",text:"Verify signup, email, session, save and export on the approved production release",note:"Record the tested release, account, delivery evidence and session result. A build or health response does not establish this."},
  {id:"launch-payment-journey-v2",section:"owner",text:"Verify checkout, webhook credit delivery and payment exception coverage",note:"Use an explicitly approved test payment and retain its matching ledger entry. Assign an operator for refunds and disputes; see the payment reconciliation procedure."},
  {id:"launch-quality-evidence-v2",section:"owner",text:"Review representative AI answers with the seat rubrics",note:"AI Studio records human-reviewed samples with evidence. Sample scores and model selection weights are not calibrated answer-accuracy probabilities. Record a representative evaluation before making reliability claims.",recurring:true},
  {id:"launch-recovery-v2",section:"owner",text:"Verify monitoring, backup restoration and support ownership",note:"Record current production alert delivery and a successful restore exercise. Source inspection alone cannot verify these operational settings.",recurring:true},
];

interface ChecklistStateDoc {
  [itemId: string]: boolean;
}

let _cache: ChecklistStateDoc | null = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

async function readState(): Promise<ChecklistStateDoc> {
  if (_cache && Date.now() < _cacheExpiry) return _cache;

  const db = getFirestoreDb();
  if (!db) return {};

  try {
    const doc = await db.collection("system_config").doc("checklist_state").get();
    const state = (doc.exists ? (doc.data() as ChecklistStateDoc) : {}) ?? {};
    _cache = state;
    _cacheExpiry = Date.now() + CACHE_TTL_MS;
    return state;
  } catch (err) {
    console.warn("[checklistConfig] Firestore read failed:", err);
    return {};
  }
}

export async function getChecklist(): Promise<ChecklistItem[]> {
  const state = await readState();
  return DEFAULT_CHECKLIST_ITEMS.map((item) => ({
    ...item,
    checked: state[item.id] === true,
  }));
}

export async function setChecklistItemChecked(itemId: string, checked: boolean): Promise<void> {
  if (!DEFAULT_CHECKLIST_ITEMS.some((i) => i.id === itemId)) {
    throw new Error(`Unknown checklist item id: ${itemId}`);
  }

  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore not configured");

  await db.collection("system_config").doc("checklist_state").set(
    { [itemId]: checked },
    { merge: true }
  );

  _cache = null; // invalidate — next read picks up the write immediately
}

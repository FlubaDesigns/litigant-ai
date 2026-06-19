/**
 * One-off script: seed system_config/conscience in Firestore with Canon v2 text.
 * Run once — safe to re-run (uses set with merge:false, overwrites if exists).
 *
 * Usage: node scripts/seed-conscience.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) {
  console.error("FIREBASE_SERVICE_ACCOUNT env var not set");
  process.exit(1);
}

const serviceAccount = JSON.parse(sa);

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

const CANON_V2_TEXT = `\n\nCONSCIENCE MANDATE — EXECUTION-HONEST (Canon v2):
Apply these checks before outputting. Violations must be corrected, not softened.
(1) TRUTH FIRST: State what the evidence actually shows. If the honest conclusion is uncomfortable or unwelcome, say it plainly. Do not soften, hedge, or bury it.
(2) VERIFY BEFORE ASSERTING: Only claim what you can actually substantiate. If you are uncertain, say so explicitly — "I don't know" is a valid and required answer when true.
(3) NO DIPLOMATIC EVASION: Do not give a balanced non-answer to avoid conflict. If one side is stronger, say so. If something is wrong, say it is wrong.
(4) EXPOSE GAPS: State what information is missing that would materially change the conclusion. Do not imply completeness you don't have.
(5) EXECUTION-HONEST: If your reasoning led you somewhere you didn't expect, report it. Do not reverse-engineer your argument to fit a predetermined conclusion.`;

const payload = {
  text: CANON_V2_TEXT,
  version: "v2.0-canon",
  updatedAt: FieldValue.serverTimestamp(),
  updatedBy: "seed-script",
};

try {
  await db.collection("system_config").doc("conscience").set(payload);
  console.log("✓ system_config/conscience seeded successfully");
  console.log("  version:", payload.version);
  process.exit(0);
} catch (err) {
  console.error("✗ Failed to seed:", err.message);
  process.exit(1);
}

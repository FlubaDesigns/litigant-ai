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
}

export interface ChecklistItem extends ChecklistItemDef {
  checked: boolean;
}

// Curated from the Litigant AI multi-pass audit (Passes 1–10) plus a
// codebase-wide sweep for TODOs, hardcoded/mock data, and manual setup
// requirements. Update this list as findings are fixed or superseded —
// removing an entry here removes it from the dashboard on next load.
export const DEFAULT_CHECKLIST_ITEMS: ChecklistItemDef[] = [
  // ── Agent: code fixes ──────────────────────────────────────────────────
  { id: "agent-credit-formula", section: "agent", text: "Unify the credit-estimate formula across backend reservation, admin pricing table, and frontend display/Run-gate", note: "Audit Pass 1 #2, Pass 2 #5, Pass 9 #27 — currently four separately hand-maintained copies of the same stale, pre-8-call-pipeline formula. Blocked on owner's fill-rate input." },
  { id: "agent-overage-silent-fail", section: "agent", text: "Fix overage credit charge silently failing when the user can't afford it", note: "Audit Pass 1 #3" },
  { id: "agent-overage-ledger", section: "agent", text: "Fix successful overage charges being ledgered identically to failed ones", note: "Audit Pass 1 #4" },
  { id: "agent-auditor-loop", section: "agent", text: "Build a real Auditor \u2192 Builder retry loop (currently doesn't exist)", note: "Audit Pass 1 #1 — blocked on owner decision: inline correction vs. full retry loop." },
  { id: "agent-anthropic-abort", section: "agent", text: "Cancel in-flight Anthropic requests when a session is aborted", note: "Audit Pass 3 #7 — the other three providers already do this correctly." },
  { id: "agent-dup-model-map", section: "agent", text: "Remove the duplicate hardcoded default-model map in createProviderAsync", note: "Audit Pass 3 #8 — should reference the single DEFAULT_MODELS export." },
  { id: "agent-password-reset-leak", section: "agent", text: "Fix password-reset endpoint so it actually doesn't reveal whether an email exists", note: "Audit Pass 4 #9 — comment claims this but the error handling doesn't back it up." },
  { id: "agent-square-redirect", section: "agent", text: "Fix Square checkout redirect URL being built from a client-controllable header", note: "Audit Pass 4 #10" },
  { id: "agent-litigant-cap", section: "agent", text: "✅ DONE: Fixed litigant cap — creditEngine.ts raised from 4 to 10 to match brainEngine", note: "Audit Pass 4 #11 — resolved." },
  { id: "agent-autorefill-validation", section: "agent", text: "Add validation to auto-refill thresholdCredits / packPriceId", note: "Audit Pass 4 #12" },
  { id: "agent-user-search-pagination", section: "agent", text: "Fix unbounded/unpaginated admin user name search", note: "Audit Pass 5 #13" },
  { id: "agent-flag-validation", section: "agent", text: "Validate feature flag name and value (boolean only) on write", note: "Audit Pass 5 #14" },
  { id: "agent-error-rate-denominator", section: "agent", text: "Fix System Health's 7-day error rate being divided by lifetime session count", note: "Audit Pass 5 #15" },
  { id: "agent-shared-report-count", section: "agent", text: "Fix shared reports displaying a litigant count inflated by 3", note: "Audit Pass 6 #16" },
  { id: "agent-provider-discovery", section: "agent", text: "Fix provider-discovery endpoint being blind to Firestore-only-configured providers", note: "Audit Pass 6 #17" },
  { id: "agent-round-count-99", section: "agent", text: "Fix public reports always displaying \"99\" for round count", note: "Audit Pass 6 #18" },
  { id: "agent-billing-404", section: "agent", text: "✅ DONE: Removed Pro subscription purchase path from Billing.tsx — product is credits-only", note: "Audit Pass 8 #25 — resolved by dropping subscription tier." },
  { id: "agent-audit-admin-tsx", section: "agent", text: "Code-review Admin.tsx (~2,660 lines) — tabs exist but internals are unreviewed", note: "" },
  { id: "agent-verify-share-report", section: "agent", text: "Verify the public Share Report page matches spec (shared-only gating, CTA, OG tags)", note: "" },
  { id: "agent-review-notifications", section: "agent", text: "Review NotificationsTab in Settings", note: "Flagged unreviewed in Pass 10." },
  { id: "agent-recalibrate-max-credits", section: "agent", text: "Recalibrate the \"Maximum Credits\" dropdown against real ~83-credit session cost", note: "Current options (10/15/25/50/100) predate the corrected cost figure." },
  { id: "agent-review-remaining-frontend", section: "agent", text: "Review Landing.tsx, tools pages, and shared components (AppLayout, CourtDiagram, LandingDemoPlayer, OnboardingWizard)", note: "Never audited." },

  // ── Owner: manual / business actions ────────────────────────────────────
  { id: "owner-fill-rate-decision", section: "owner", text: "Decide the fill-rate assumption for non-litigant pipeline stages", note: "Needed to fix the credit-estimate formula everywhere it's duplicated." },
  { id: "owner-subscription-decision", section: "owner", text: "✅ DONE: Dropped subscription tier — product is pay-as-you-go credits only", note: "Billing.tsx and billingService.ts updated. No Pro plan, no subscription language." },
  { id: "owner-litigant-cap-decision", section: "owner", text: "✅ DONE: Litigant cap set to 10 — creditEngine.ts and brainEngine.ts updated", note: "Picker max and cost formula both respect 10." },
  { id: "owner-auditor-loop-decision", section: "owner", text: "Decide the Auditor retry-loop UX", note: "Inline correction vs. a real automated retry loop back to the Builder." },
  {
    id: "owner-secrets",
    section: "owner",
    text: "Set all required secrets on the Cloud Run service (Firebase, Square, AI keys, Resend, ADMIN_MASTER_SECRET, APP_DOMAIN)",
    note: "Secrets set in Replit are for local dev only — they are NOT on Cloud Run. Every secret below must also be added directly to the Cloud Run service.",
    steps: [
      "── Where to add them ──",
      "1. Go to console.cloud.google.com → Cloud Run → click your api service.",
      "2. Click 'Edit & Deploy New Revision' at the top.",
      "3. Click the 'Variables & Secrets' tab.",
      "4. Use 'Add Variable' for each item below. When done, click 'Deploy'.",
      "── Firebase ──",
      "5. FIREBASE_SERVICE_ACCOUNT = (paste the full JSON content of your Firebase service account key file — the one downloaded from Firebase Console → Project Settings → Service Accounts → Generate new private key)",
      "6. FIREBASE_PROJECT_ID = your-firebase-project-id (e.g. litigant-ai)",
      "── Square ──",
      "7. SQUARE_ACCESS_TOKEN = EAA... (production token from Square Developer → Credentials)",
      "8. SQUARE_LOCATION_ID = L... (from Square Developer → Locations)",
      "9. SQUARE_WEBHOOK_SIGNATURE_KEY = (from Square Developer → Webhooks → your subscription)",
      "10. SQUARE_ENVIRONMENT = production",
      "── AI Providers (add whichever you have) ──",
      "11. OPENAI_API_KEY = sk-... (from platform.openai.com/api-keys)",
      "12. ANTHROPIC_API_KEY = sk-ant-... (from console.anthropic.com/settings/keys)",
      "13. GEMINI_API_KEY = AIza... (from aistudio.google.com/app/apikey)",
      "14. XAI_API_KEY = xai-... (from console.x.ai)",
      "── Resend (email) ──",
      "15. RESEND_API_KEY = re_... (from resend.com → API Keys)",
      "── App config ──",
      "16. APP_DOMAIN = litigant-ai.com (used for email links and redirect URLs — no https://, no trailing slash)",
      "17. ADMIN_MASTER_SECRET = (choose a strong random string, e.g. 40+ characters — this is the password for the one-time admin bootstrap script)",
      "── Note on PORT ──",
      "18. Do NOT add PORT — Cloud Run manages this automatically and will reject it.",
      "── Deploy & verify ──",
      "19. Click 'Deploy' and wait for the new revision to go live (green checkmark).",
      "20. Visit https://litigant-ai.com/api-server/api/health — should return: { status: 'ok' }",
      "21. In Admin → System tab, check Provider Discovery — your AI providers should show green.",
      "22. In Admin → Setup Checklist — check this item off once all vars are confirmed live.",
    ],
  },
  { id: "owner-firebase-setup", section: "owner", text: "Create/configure the Firebase project: enable Email/Password auth, initialize Firestore, deploy firestore.rules, create a service account key", note: "" },
  {
    id: "owner-square-setup",
    section: "owner",
    text: "Create a Square developer account/app, get the access token + location ID, configure the payment.updated webhook",
    note: "Payments are fully broken until this is done. Checkout links return errors and webhooks are never delivered.",
    steps: [
      "── Create your Square developer account ──",
      "1. Go to developer.squareup.com and sign in with your Square account (or create one).",
      "2. Click 'Create your first application' (or '+ New Application' if you have others).",
      "3. Name it 'Litigant AI' and click 'Save'.",
      "── Switch to Production ──",
      "4. In your app, toggle from 'Sandbox' to 'Production' using the toggle at the top of the sidebar. Do NOT use Sandbox credentials in production — they reject real cards.",
      "── Get your Access Token ──",
      "5. In the left sidebar, click 'Credentials'.",
      "6. Under 'Production', copy the 'Production Access Token' (starts with EAA...).",
      "7. This is your SQUARE_ACCESS_TOKEN.",
      "── Get your Location ID ──",
      "8. In the left sidebar, click 'Locations'.",
      "9. Copy the Location ID for your business location (looks like L followed by alphanumeric characters).",
      "10. This is your SQUARE_LOCATION_ID.",
      "── Set up the Webhook ──",
      "11. In the left sidebar, click 'Webhooks' → 'Subscriptions'.",
      "12. Click 'Add Subscription'.",
      "13. In the 'URL' field, enter: https://litigant-ai.com/api-server/api/square/webhook",
      "14. Under 'API version', select the latest available.",
      "15. Under 'Events', check: payment.updated",
      "16. Click 'Save'.",
      "17. Square will show you a Signature Key — copy it immediately. This is your SQUARE_WEBHOOK_SIGNATURE_KEY.",
      "── Add to Cloud Run ──",
      "18. Go to Google Cloud Console → Cloud Run → your api service → Edit & Deploy New Revision → Variables & Secrets.",
      "19. Add: SQUARE_ACCESS_TOKEN = EAA... (from step 6)",
      "20. Add: SQUARE_LOCATION_ID = L... (from step 9)",
      "21. Add: SQUARE_WEBHOOK_SIGNATURE_KEY = (from step 17)",
      "22. Add: SQUARE_ENVIRONMENT = production",
      "23. Click Deploy.",
      "── Verify ──",
      "24. Go to /billing in the app and attempt to purchase a credit pack — you should see a Square checkout page.",
      "25. In Square Dashboard → Webhooks → your subscription, click 'Test' to send a test event and confirm delivery logs show 200 OK.",
    ],
  },
  {
    id: "owner-ai-provider-keys",
    section: "owner",
    text: "Connect AI provider API keys (OpenAI, Anthropic, Gemini, Grok)",
    note: "At least one is required to run trials. Each additional provider gives the engine more model choices.",
    steps: [
      "── OpenAI (GPT-4o, GPT-4, GPT-4.1) ──",
      "1. Go to https://platform.openai.com/api-keys and sign in.",
      "2. Click 'Create new secret key', give it a name (e.g. 'litigant-ai'), copy the key.",
      "3. In Replit → Secrets, add: OPENAI_API_KEY = sk-...",
      "4. Restart the API Server workflow. OpenAI models will now appear in seat dropdowns.",
      "── Anthropic (Claude 3.5, Claude 4) ──",
      "5. Go to https://console.anthropic.com/settings/keys and sign in.",
      "6. Click 'Create Key', name it, copy the key.",
      "7. In Replit → Secrets, add: ANTHROPIC_API_KEY = sk-ant-...",
      "8. Restart the API Server workflow.",
      "── Google Gemini ──",
      "9. Go to https://aistudio.google.com/app/apikey and sign in with a Google account.",
      "10. Click 'Create API key', copy it.",
      "11. In Replit → Secrets, add: GEMINI_API_KEY = AIza...",
      "12. Restart the API Server workflow.",
      "── xAI Grok ──",
      "13. Go to https://console.x.ai and sign in.",
      "14. Navigate to API Keys, create a key, copy it.",
      "15. In Replit → Secrets, add: XAI_API_KEY = xai-...",
      "16. Restart the API Server workflow.",
      "── Verify ──",
      "17. Open Admin → System tab, check the Provider Discovery section — each connected provider should show a green status.",
      "18. Run a test trial on /session and confirm the seat dropdown lists models from your connected providers.",
    ],
  },
  {
    id: "owner-resend-setup",
    section: "owner",
    text: "Create a Resend account and verify the sending domain for transactional email",
    note: "The email code is fully built. This is purely account setup + DNS + two env vars.",
    steps: [
      "── Create your Resend account ──",
      "1. Go to resend.com and sign up for a free account.",
      "2. From the Resend dashboard, click 'Domains' in the left sidebar.",
      "3. Click 'Add Domain'.",
      "── Add the sending subdomain ──",
      "4. Enter: send.litigant-ai.com (this is a dedicated subdomain for outbound mail — do not use the bare litigant-ai.com domain).",
      "5. Resend will show you a set of DNS records to add. Copy them — you will need: one TXT record (SPF/ownership), two CNAME records (DKIM keys), and optionally an MX record for bounce handling.",
      "── Add DNS records ──",
      "6. Log in to wherever you manage DNS for litigant-ai.com (your domain registrar or Cloudflare/Route 53).",
      "7. Add the TXT record exactly as Resend shows it (Name: send.litigant-ai.com or just 'send' depending on your registrar).",
      "8. Add both CNAME records for DKIM exactly as shown.",
      "9. If Resend provided an MX record, add that too — it enables bounce/reply tracking.",
      "10. Back in Resend → Domains, click 'Verify DNS Records'. DNS propagation can take a few minutes to a few hours. Resend will show green checkmarks when verified.",
      "── Get your API key ──",
      "11. In Resend, go to 'API Keys' in the sidebar.",
      "12. Click 'Create API Key'. Name it 'litigant-ai-production'.",
      "13. Set permission to 'Sending access' only.",
      "14. Copy the key — it starts with 're_'. You will only see it once.",
      "── Add env vars to Cloud Run ──",
      "15. Go to Google Cloud Console → Cloud Run → your api service → Edit & Deploy New Revision.",
      "16. Under 'Variables & Secrets', add: RESEND_API_KEY = re_... (your key from step 14).",
      "17. Also add: APP_DOMAIN = litigant-ai.com (used to build verification/reset links in emails).",
      "18. Click Deploy and wait for the new revision to go live.",
      "── Verify ──",
      "19. Go to /register on your site and create a test account. You should receive a verification email from noreply@send.litigant-ai.com within a few seconds.",
      "20. Go to /forgot-password and submit your email. You should receive a password reset email.",
      "21. Check Resend → Logs to confirm delivery status for both sends.",
    ],
  },
  { id: "owner-bootstrap-scripts", section: "owner", text: "Run the one-time bootstrap scripts: seed-conscience.mjs and set-admin-claim", note: "" },
  { id: "owner-legal-content", section: "owner", text: "Write real Privacy Policy and Terms of Service content", note: "✅ DONE — /privacy and /terms pages live with entertainment-only disclaimer. Contact: info@litigant-ai.com." },
  { id: "owner-domain-dns", section: "owner", text: "Set up the production custom domain/DNS and match it to APP_DOMAIN", note: "" },
  { id: "owner-deploy", section: "owner", text: "Choose and complete the deployment path (Cloud Run script or Replit Deployments)", note: "" },
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

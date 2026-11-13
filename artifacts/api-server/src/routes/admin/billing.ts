import { InvalidBillingDefaultsError } from "../../lib/billingDefaultsConfig.js";
import { DEFAULT_LIMITS, LIMIT_RANGES, getAdminLimitSettings } from "../../lib/adminLimitsConfig.js";
import { Router } from "express";
import { getFirestoreDb } from "../../lib/firebaseAdmin.js";
import { addCredits, InvalidRefundError } from "../../lib/creditLedger.js";
import { FieldValue } from "firebase-admin/firestore";
import { getBillingDefaults, saveBillingDefaults } from "../../lib/billingDefaultsConfig.js";
import { safeError } from "../../lib/safeError.js";
import { getAllCreditPacks, createCreditPack, updateCreditPack, deactivateCreditPack, CREDIT_PACK_BOUNDS } from "../../lib/creditPacksConfig.js";
import { requireAdmin, serializeDoc } from "./shared.js";

const router = Router();


// ── Transactions ──────────────────────────────────────────────────────────────

router.get("/admin/transactions", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({error: "Transaction service unavailable"});

  const limit = Math.min(Number(req.query["limit"]) || 30, 100);
  const cursor = req.query["cursor"] as string | undefined;
  const userId = req.query["userId"] as string | undefined;
  const type = req.query["type"] as string | undefined;

  try {
    let q = db
      .collection("credit_transactions")
      .orderBy("createdAt", "desc")
      .limit(limit + 1) as any;
    if (userId) q = q.where("userId", "==", userId);
    if (type) q = q.where("type", "==", type);
    if (cursor) {
      const cursorDoc = await db.collection("credit_transactions").doc(cursor).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }

    const snap = await q.get();
    const docs = snap.docs.slice(0, limit);
    const hasMore = snap.docs.length > limit;

    return res.json({
      transactions: docs.map((d: any) => serializeDoc(d)),
      hasMore,
      nextCursor: hasMore ? docs[docs.length - 1]?.id : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


router.post("/admin/credits/refund", requireAdmin, async (req: any, res) => {
  const { userId, amount, reason, transactionId, requestId } = req.body ?? {};
  if (typeof userId !== "string" || !userId || typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 ||
      typeof transactionId !== "string" || !/^[^/]{1,200}$/.test(transactionId) ||
      typeof requestId !== "string" || !/^[a-zA-Z0-9-]{16,100}$/.test(requestId) ||
      (reason !== undefined && typeof reason !== "string")) {
    return res.status(400).json({ error: "A charge, request ID and positive whole-credit amount are required." });
  }
  try {
    const result = await addCredits(userId, amount, "refund", {
      source: reason || `admin_refund_by_${req.adminUid}`,
      refundTransactionId: transactionId,
      idempotencyKey: `admin_refund_${req.adminUid}_${requestId}`,
    });
    if (!result) return res.status(503).json({ error: "Firebase not configured" });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(err instanceof InvalidRefundError ? 400 : 500).json({ error: err instanceof InvalidRefundError ? err.message : safeError(err) });
  }
});


// ── Admin Limits (public read, admin write) ───────────────────────────────────
//
// The same saved limits govern public controls, estimates and session runs.
router.get("/limits", async (_req, res) => {
  try { return res.json(await getAdminLimitSettings()); }
  catch { return res.status(503).json({error:"Platform limits are temporarily unavailable"}); }
});


router.put("/admin/limits/:name", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const name  = req.params["name"]!;
  const { value } = req.body as { value?: unknown };

  if (!(name in DEFAULT_LIMITS)) {
    return res.status(400).json({
      error: `Unknown limit "${name}". Valid limits: ${Object.keys(DEFAULT_LIMITS).join(", ")}`,
    });
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return res.status(400).json({ error: "value must be an integer" });
  }
  const range = LIMIT_RANGES[name]!;
  if (value < range.min || value > range.max) {
    return res.status(400).json({
      error: `${name} must be between ${range.min} and ${range.max}`,
    });
  }

  try {
    await db
      .collection("config")
      .doc("adminLimits")
      .set({ [name]: value, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return res.json({ success: true, name, value });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


// ── Credit Packs ─────────────────────────────────────────────────────────────

/**
 * GET /admin/credit-packs
 * Returns every pack — active and deactivated — for the admin list view.
 * GET /billing/products (the public/customer-facing route) should call
 * getActiveCreditPacks() instead, which filters to active: true only.
 */
router.get("/admin/credit-packs", requireAdmin, async (_req, res) => {
  try {
    const packs = await getAllCreditPacks();
    return res.json({ packs: Object.values(packs), bounds: CREDIT_PACK_BOUNDS });
  } catch (err: any) {
    return res.status(500).json({ error: safeError(err) });
  }
});


/**
 * POST /admin/credit-packs
 * Creates a new pack. id and the nested price id are supplied here and are
 * permanent from this point on — see the immutability rule documented in
 * creditPacksConfig.ts. Fails with 409 if the id is already in use.
 */
router.post("/admin/credit-packs", requireAdmin, async (req: any, res) => {
  const { id, name, description, unitAmountCents, creditAmount } = req.body as {
    id?: string;
    name?: string;
    description?: string;
    unitAmountCents?: number;
    creditAmount?: number;
  };

  if (!id || typeof id !== "string" || !/^[a-z0-9_]+$/.test(id)) {
    return res.status(400).json({ error: "id is required and must be lowercase letters, numbers, and underscores only" });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (
    typeof unitAmountCents !== "number" ||
    unitAmountCents < CREDIT_PACK_BOUNDS.MIN_UNIT_AMOUNT_CENTS ||
    unitAmountCents > CREDIT_PACK_BOUNDS.MAX_UNIT_AMOUNT_CENTS
  ) {
    return res.status(400).json({
      error: `unitAmountCents must be a number between ${CREDIT_PACK_BOUNDS.MIN_UNIT_AMOUNT_CENTS} and ${CREDIT_PACK_BOUNDS.MAX_UNIT_AMOUNT_CENTS}`,
    });
  }
  if (
    typeof creditAmount !== "number" ||
    !Number.isInteger(creditAmount) ||
    creditAmount < CREDIT_PACK_BOUNDS.MIN_CREDIT_AMOUNT ||
    creditAmount > CREDIT_PACK_BOUNDS.MAX_CREDIT_AMOUNT
  ) {
    return res.status(400).json({
      error: `creditAmount must be a whole number between ${CREDIT_PACK_BOUNDS.MIN_CREDIT_AMOUNT} and ${CREDIT_PACK_BOUNDS.MAX_CREDIT_AMOUNT}`,
    });
  }

  try {
    await createCreditPack({
      id,
      name: name.trim(),
      description: description?.trim() ?? "",
      active: true,
      metadata: { type: "credit_pack", creditAmount: String(creditAmount) },
      prices: [
        {
          id: `price_${id}`,
          product: id,
          unit_amount: unitAmountCents,
          currency: "usd",
          recurring: null,
          active: true,
          metadata: { creditAmount: String(creditAmount) },
        },
      ],
    });
    return res.json({ success: true, id });
  } catch (err: any) {
    const status = /already exists/i.test(err.message) ? 409 : 500;
    return res.status(status).json({ error: safeError(err) });
  }
});


/**
 * PATCH /admin/credit-packs/:id
 * Edits name/description/active/price/creditAmount on an existing pack.
 * id itself is taken only from the URL param, never from the body.
 */
router.patch("/admin/credit-packs/:id", requireAdmin, async (req: any, res) => {
  const { id } = req.params as { id: string };
  const { name, description, active, unitAmountCents, creditAmount } = req.body as {
    name?: string;
    description?: string;
    active?: boolean;
    unitAmountCents?: number;
    creditAmount?: number;
  };

  if (unitAmountCents !== undefined) {
    if (
      typeof unitAmountCents !== "number" ||
      unitAmountCents < CREDIT_PACK_BOUNDS.MIN_UNIT_AMOUNT_CENTS ||
      unitAmountCents > CREDIT_PACK_BOUNDS.MAX_UNIT_AMOUNT_CENTS
    ) {
      return res.status(400).json({
        error: `unitAmountCents must be a number between ${CREDIT_PACK_BOUNDS.MIN_UNIT_AMOUNT_CENTS} and ${CREDIT_PACK_BOUNDS.MAX_UNIT_AMOUNT_CENTS}`,
      });
    }
  }
  if (creditAmount !== undefined) {
    if (
      typeof creditAmount !== "number" ||
      !Number.isInteger(creditAmount) ||
      creditAmount < CREDIT_PACK_BOUNDS.MIN_CREDIT_AMOUNT ||
      creditAmount > CREDIT_PACK_BOUNDS.MAX_CREDIT_AMOUNT
    ) {
      return res.status(400).json({
        error: `creditAmount must be a whole number between ${CREDIT_PACK_BOUNDS.MIN_CREDIT_AMOUNT} and ${CREDIT_PACK_BOUNDS.MAX_CREDIT_AMOUNT}`,
      });
    }
  }
  if (active !== undefined && typeof active !== "boolean") {
    return res.status(400).json({ error: "active must be a boolean" });
  }

  try {
    const pack = await updateCreditPack(id, {
      name: name?.trim(),
      description: description?.trim(),
      active,
      unitAmountCents,
      creditAmount,
    });
    return res.json({ success: true, pack });
  } catch (err: any) {
    const status = /no pack with id/i.test(err.message) ? 404 : 500;
    return res.status(status).json({ error: safeError(err) });
  }
});


/**
 * DELETE /admin/credit-packs/:id
 * Soft-delete only — sets active: false. No hard-delete endpoint exists.
 * Reactivate via PATCH .../:id with { active: true }.
 */
router.delete("/admin/credit-packs/:id", requireAdmin, async (req, res) => {
  const { id } = req.params as { id: string };
  try {
    await deactivateCreditPack(id);
    return res.json({ success: true, id, active: false });
  } catch (err: any) {
    const status = /no pack with id/i.test(err.message) ? 404 : 500;
    return res.status(status).json({ error: safeError(err) });
  }
});


/**
 * GET /admin/billing-defaults
 * Returns the admin-configurable billing defaults.
 */
router.get("/admin/billing-defaults", requireAdmin, async (_req: any, res) => {
  const defaults = await getBillingDefaults();
  return res.json(defaults);
});


/**
 * PUT /admin/billing-defaults
 * Updates the billing defaults stored in Firestore config/billingDefaults.
 */
router.put("/admin/billing-defaults", requireAdmin, async (req: any, res) => {
  const { autoRefillAmounts, defaultAutoRefillAmount, defaultThresholdCredits, defaultWarningThresholdCredits, signupBonusCredits, emailCreditWarningThreshold } = req.body as {
    autoRefillAmounts?: number[];
    defaultAutoRefillAmount?: number;
    defaultThresholdCredits?: number;
    defaultWarningThresholdCredits?: number;
    signupBonusCredits?: number;
    emailCreditWarningThreshold?: number;
  };

  try {
    const updated = await saveBillingDefaults({
      ...(autoRefillAmounts !== undefined && { autoRefillAmounts }),
      ...(defaultAutoRefillAmount !== undefined && { defaultAutoRefillAmount }),
      ...(defaultThresholdCredits !== undefined && { defaultThresholdCredits }),
      ...(defaultWarningThresholdCredits !== undefined && { defaultWarningThresholdCredits }),
      ...(signupBonusCredits !== undefined && { signupBonusCredits }),
      ...(emailCreditWarningThreshold !== undefined && { emailCreditWarningThreshold }),
    });
    return res.json(updated);
  } catch (err: any) {
    return res.status(err instanceof InvalidBillingDefaultsError ? 400 : 500).json({ error: err instanceof InvalidBillingDefaultsError ? err.message : safeError(err) });
  }
});
export default router;

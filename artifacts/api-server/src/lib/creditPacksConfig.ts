/**
 * Canonical credit-pack catalogue: shared defaults overlaid with saved admin packs.
 * Public pages, admin, checkout and payment validation all read this catalogue.
 * Defaults initialize missing records; a failed saved-config read is an error.
 * Pack IDs remain stable because completed payment notes refer to them.
 */
import { getFirestoreDb } from "./firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";
import {
  CREDIT_PACKS as STATIC_CREDIT_PACKS,
  type CreditPack,
  type CreditPackPrice,
} from "./creditPacks.js";

interface CreditPacksDoc {
  packs?: Record<string, CreditPack>;
  updatedAt?: unknown;
}

// ── In-memory cache ───────────────────────────────────────────────────────────
let _cache: Record<string, CreditPack> | null = null;
let _cacheExpiry = 0;

/** Cache TTL in milliseconds — matches pricingConfig.ts's existing window. */
const CACHE_TTL_MS = 60_000;

/**
 * Force-clears the in-memory credit-packs cache.
 * Called automatically after every admin write to /admin/credit-packs/*
 * so changes take effect on the very next request rather than after TTL.
 */
export function invalidateCreditPacksCache(): void {
  _cache = null;
  _cacheExpiry = 0;
}

/** Converts the static fallback array into a map keyed by pack id. */
function staticPacksAsMap(): Record<string, CreditPack> {
  const map: Record<string, CreditPack> = {};
  for (const pack of STATIC_CREDIT_PACKS) map[pack.id] = pack;
  return map;
}

/**
 * Returns the full live pack catalogue: Firestore overrides layered on top
 * of the hardcoded fallback. A pack present in Firestore replaces the
 * fallback pack of the same id entirely (packs are stored whole, not
 * deep-merged field-by-field — unlike the multiplier map, a pack is one
 * coherent product, so a partial merge could leave it in an inconsistent
 * state, e.g. a new creditAmount paired with a stale price).
 *
 * Reads Firestore at most once per TTL window. Local development without
 * Firebase uses shared defaults. Failed configured reads must never change prices.
 */
export async function getAllCreditPacks(): Promise<Record<string, CreditPack>> {
  const now = Date.now();
  if (_cache !== null && now < _cacheExpiry) return _cache;

  const db = getFirestoreDb();
  if (!db) return staticPacksAsMap();

  try {
    const doc = await db.collection("config").doc("creditPacks").get();
    const data = doc.exists ? (doc.data() as CreditPacksDoc) : {};
    const merged = { ...staticPacksAsMap(), ...(data.packs ?? {}) };

    _cache = merged;
    _cacheExpiry = now + CACHE_TTL_MS;
    return merged;
  } catch {
    throw new Error("Saved credit packs could not be loaded");
  }
}

/**
 * Returns only the active packs, in a stable order (fallback packs first in
 * their declared order, then any Firestore-only additions) — this is what
 * GET /billing/products and the admin list view should both render from.
 */
export async function getActiveCreditPacks(): Promise<CreditPack[]> {
  const all = await getAllCreditPacks();
  const order = STATIC_CREDIT_PACKS.map((p) => p.id);
  const ids = [...order, ...Object.keys(all).filter((id) => !order.includes(id))];
  return ids
    .map((id) => all[id])
    .filter((pack): pack is CreditPack => !!pack && pack.active);
}

/** Resolve checkout prices from the same live catalogue used for display. */
export async function findCreditPackByPriceId(
  priceId: string
): Promise<{ pack: CreditPack; price: CreditPackPrice } | null> {
  const all = await getAllCreditPacks();
  for (const pack of Object.values(all)) {
    const price = pack.prices.find((p) => p.id === priceId);
    if (price) return { pack, price };
  }
  return null;
}

// ── Admin write operations ────────────────────────────────────────────────────

/** Hard bounds enforced on every write — see the route layer for the user-facing error messages. */
export const CREDIT_PACK_BOUNDS = {
  /** Square's own practical minimum for a card charge. */
  MIN_UNIT_AMOUNT_CENTS: 50,
  /** Sanity ceiling against a fat-fingered extra zero — not a real product limit. */
  MAX_UNIT_AMOUNT_CENTS: 100_000,
  MIN_CREDIT_AMOUNT: 1,
  MAX_CREDIT_AMOUNT: 1_000_000,
} as const;

/**
 * Creates a new credit pack. Fails if a pack with this id already exists —
 * use updateCreditPack for edits. Pack id and price id are fixed for the
 * life of the pack (see the immutability rule in this file's header).
 */
export async function createCreditPack(pack: CreditPack): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured");

  const existing = await getAllCreditPacks();
  if (existing[pack.id]) {
    throw new Error(`A pack with id "${pack.id}" already exists — use update instead.`);
  }

  await db.collection("config").doc("creditPacks").set(
    { packs: { [pack.id]: pack }, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  invalidateCreditPacksCache();
}

/**
 * Updates an existing pack's editable fields (name, description, active,
 * and each price's unit_amount/creditAmount). The pack's own top-level id
 * and every price's id are never accepted here — they're read from the
 * existing stored pack, not from the caller, so there is no way to rename
 * a pack through this function even if a caller tried to.
 */
export async function updateCreditPack(
  packId: string,
  updates: {
    name?: string;
    description?: string;
    active?: boolean;
    /** Edits the FIRST price's unit_amount (cents). Packs in this product only ever carry one price. */
    unitAmountCents?: number;
    creditAmount?: number;
  }
): Promise<CreditPack> {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured");

  const existing = await getAllCreditPacks();
  const current = existing[packId];
  if (!current) throw new Error(`No pack with id "${packId}" exists.`);

  const next: CreditPack = {
    ...current,
    name: updates.name ?? current.name,
    description: updates.description ?? current.description,
    active: updates.active ?? current.active,
    metadata: {
      ...current.metadata,
      creditAmount:
        updates.creditAmount !== undefined
          ? String(updates.creditAmount)
          : current.metadata.creditAmount,
    },
    prices: current.prices.map((price, i) =>
      i === 0
        ? {
            ...price,
            unit_amount: updates.unitAmountCents ?? price.unit_amount,
            metadata: {
              ...price.metadata,
              creditAmount:
                updates.creditAmount !== undefined
                  ? String(updates.creditAmount)
                  : price.metadata.creditAmount,
            },
          }
        : price
    ),
  };

  await db.collection("config").doc("creditPacks").set(
    { packs: { [packId]: next }, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  invalidateCreditPacksCache();
  return next;
}

/**
 * Deactivates a pack (active: false) rather than deleting it. A deactivated
 * pack disappears from GET /billing/products and the checkout flow, but
 * stays resolvable by findCreditPackByPriceId for any historical reference
 * — and can be reactivated by calling updateCreditPack(id, { active: true })
 * later. There is no hard-delete function: a pack's id can already appear
 * inside Square's payment `note` field on real transactions, sometimes long
 * after the checkout was created, so removing the pack's record entirely
 * would leave nothing for findCreditPackByPriceId to resolve if that note
 * format is ever inspected again (the webhook itself reads creditAmount
 * directly out of the note text, not via this lookup, so existing webhook
 * processing is unaffected either way — this is about not breaking any
 * future admin tooling that displays "which pack was this transaction for").
 */
export async function deactivateCreditPack(packId: string): Promise<void> {
  await updateCreditPack(packId, { active: false });
}

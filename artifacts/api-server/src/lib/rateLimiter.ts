/**
 * Firestore-backed rate limiter middleware factory.
 *
 * Uses a fixed-window counter stored in Firestore so limits are enforced
 * globally across all Cloud Run instances — not just per-container.
 *
 * Falls back to an in-memory store when Firestore is unavailable (local dev
 * without Firebase configured). The in-memory fallback is single-instance only;
 * it is intentionally not used in production where Firestore is always present.
 */

import type { Request, Response, NextFunction } from "express";
import { getFirestoreDb } from "./firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

interface WindowEntry {
  count: number;
  windowEnd: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
}

const memoryStore = new Map<string, WindowEntry>();

async function checkFirestore(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore unavailable");

  const now = Date.now();
  const ref = db.collection("rate_limits").doc(key);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const data = doc.data() as WindowEntry | undefined;

    if (!data || now >= data.windowEnd) {
      const windowEnd = now + windowMs;
      tx.set(ref, { count: 1, windowEnd });
      return { allowed: true, remaining: limit - 1, reset: windowEnd };
    }

    if (data.count >= limit) {
      return { allowed: false, remaining: 0, reset: data.windowEnd };
    }

    tx.update(ref, { count: FieldValue.increment(1) });
    return {
      allowed: true,
      remaining: limit - data.count - 1,
      reset: data.windowEnd,
    };
  });
}

function checkMemory(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now >= entry.windowEnd) {
    const windowEnd = now + windowMs;
    memoryStore.set(key, { count: 1, windowEnd });
    return { allowed: true, remaining: limit - 1, reset: windowEnd };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, reset: entry.windowEnd };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: limit - entry.count,
    reset: entry.windowEnd,
  };
}

export interface RateLimiterOptions {
  /** Derive the rate-limit key from the request (e.g. by IP or body field). */
  keyFn: (req: Request) => string;
  /** Maximum number of requests allowed in the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Error message returned in the 429 body. */
  message: string;
}

/**
 * Returns an Express middleware that enforces the given rate limit.
 *
 * Firestore is tried first. If unavailable, the in-memory fallback is used
 * and a warning is logged so the gap is visible in ops logs.
 */
export function makeRateLimiter(options: RateLimiterOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `rl:${options.keyFn(req)}`;

    let result: RateLimitResult;
    try {
      result = await checkFirestore(key, options.limit, options.windowMs);
    } catch {
      console.warn(
        `[RateLimiter] Firestore unavailable for key "${key}" — using in-memory fallback`
      );
      result = checkMemory(key, options.limit, options.windowMs);
    }

    res.setHeader("RateLimit-Limit", options.limit);
    res.setHeader("RateLimit-Remaining", result.remaining);
    res.setHeader("RateLimit-Reset", Math.ceil(result.reset / 1000));

    if (!result.allowed) {
      res.status(429).json({ error: options.message });
      return;
    }

    next();
  };
}

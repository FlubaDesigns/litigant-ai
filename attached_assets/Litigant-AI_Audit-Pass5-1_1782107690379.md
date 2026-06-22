# Litigant AI — Audit Handoff, Pass 5 of N
**Scope of this pass:** `artifacts/api-server/src/routes/admin.ts` in full — 947 lines, every route. Given its size relative to the other route files, this got its own dedicated pass as flagged at the end of Pass 4.

**Revision:** Two findings (#14, #15) were added on review after the original version of this pass missed them — #14 (feature flag write validation) needed a check into `useFeatureFlag.ts` and `adminService.ts` on the frontend to confirm the consuming-side consequence, which is why it's mentioned here despite this pass's formal scope being `admin.ts` only; #15 (system-health error rate denominator) is in `GET /admin/system-health`, a route inside `admin.ts` that I simply hadn't read at all in the original pass. Both are confirmed directly against the code, not just asserted.

**Status:** Not yet read: `sessions.ts`, `report.ts`, `templates.ts`, `providers.ts`, `health.ts`, a full read of `webhook.ts` and `brain.ts` (both partially covered already — Pass 1 and the Pass 3 addendum exchange respectively). After routes: the entire frontend.

---

## Finding #13 — Admin user search returns an unbounded, unpaginated result set for name queries, despite claiming pagination support

**Severity: Low. Internal admin-only tool, not a security issue — a real functional gap in search completeness that the response shape actively misrepresents.**

### Where
`artifacts/api-server/src/routes/admin.ts`, `GET /admin/users`.

### What's broken
```ts
const search = (req.query["search"] as string | undefined)?.toLowerCase();
const limit = Math.min(Number(req.query["limit"]) || 20, 100);
...
} else if (search) {
  // Name search: fetch a larger page and filter client-side
  q = db.collection("users").orderBy("createdAt", "desc").limit(200);
}
...
const snap = await q.get();
let users = snap.docs.map((d) => serializeDoc(d));

if (search && !search.includes("@")) {
  users = users.filter(
    (u: any) =>
      (u.email as string)?.toLowerCase().includes(search) ||
      (u.displayName as string)?.toLowerCase().includes(search)
  );
}

const hasMore = !search && users.length > limit;
if (!search) users = users.slice(0, limit);
```
For an email search, this correctly uses a Firestore range query, capped and paginated like every other list route in this file. For a **name** search, it fetches up to 200 of the most-recently-created users, filters them in memory by substring match, and then — critically — both the `hasMore` computation and the final `slice(0, limit)` are gated behind `!search`. Neither runs when a name search is active. The route returns every matching record from that one 200-document window, unbounded by the requested `limit`, and tells the caller `hasMore: false` regardless of whether more matches could exist outside that window.

### Why I'm confident this is a real deviation and not an intentional design choice
Two other list routes in this exact file — `GET /admin/sessions` and `GET /admin/transactions` — both follow the correct pattern consistently: fetch `limit + 1`, slice to `limit`, compute `hasMore` honestly from whether the extra record came back. The user-search route does this correctly for its email-search branch. The name-search branch is the only place in the whole file that breaks this pattern, which reads like an oversight in how the early-return/filter logic was structured, not a deliberate choice to handle name search differently.

### Concrete consequence
If a name search matches, say, 150 of the 200 most-recently-created users, the admin gets all 150 back in one response, with no indication that pagination might apply — and if a 151st match exists outside that 200-record window (an older account, since the window is ordered by `createdAt desc`), it will never surface at all, with the response actively claiming `hasMore: false` rather than admitting the search was bounded.

### What I'd want before fixing this
Two real options, not a single obvious fix: (a) keep the 200-record window (cheap, no new Firestore index needed) but at least make the response honest — drop the `hasMore: false` claim for name searches and signal something like `boundedSearch: true` so the admin UI can communicate "showing matches from the 200 most recent accounts" rather than implying completeness; or (b) build proper server-side substring search (would need a search-specific field or a dedicated search index, since Firestore doesn't support native substring queries on its own). I haven't touched this — (a) is a quick, low-risk fix; (b) is a bigger lift that depends on how often this search is actually used against an account base large enough for it to matter. Your call on which is worth it.

---

## Finding #14 — Feature flag writes accept any name and any non-undefined value, including strings that read as truthy on the frontend

**Severity: Low-medium. Not a security issue (write access is already admin-gated) — a correctness gap with a concrete, verified failure mode on the consuming side. Missed in the original Pass 5 writeup; added here on review.**

### Where
`artifacts/api-server/src/routes/admin.ts`, `PUT /admin/feature-flags/:name`:
```ts
router.put("/admin/feature-flags/:name", requireAdmin, async (req, res) => {
  const db = getFirestoreDb();
  if (!db) return res.status(503).json({ error: "Firebase not configured" });

  const { value } = req.body as { value?: boolean | string };
  if (value === undefined) {
    return res.status(400).json({ error: "value is required" });
  }

  try {
    await db
      .collection("config")
      .doc("featureFlags")
      .set(
        { [req.params["name"]!]: value, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    ...
```

### What's broken
The only check is `value === undefined`. There's no validation that `req.params["name"]` is one of the six real flags defined in `DEFAULT_FLAGS` (`guestMode`, `proUpgrade`, `exportPdf`, `shareReports`, `templateLibrary`, `autoRefill`), and no check that `value` is actually a boolean rather than a string. A request to `PUT /admin/feature-flags/typoShareReports` with `{ value: true }` is accepted and stored; so is `PUT /admin/feature-flags/exportPdf` with `{ value: "false" }`.

The public read route then merges whatever's in Firestore straight over the defaults with no filtering:
```ts
return res.json({ flags: { ...DEFAULT_FLAGS, ...(doc.data() ?? {}) } });
```
So a typo'd flag name or a string value isn't just stored — it's served back out through the public, unauthenticated `/feature-flags` endpoint exactly as written.

### Why the string-value case is a real, traced bug, not just bad hygiene
I checked the actual consumer rather than treat this as a hypothetical. `useFeatureFlag.ts`:
```ts
export function useFeatureFlag(name: string): boolean {
  ...
  return flags[name] ?? false;
}
```
This returns whatever value sits at that key — typed as `boolean` by the function signature, but never actually verified to be one at runtime, since it's just JSON that came back from `getFeatureFlags()`, which itself does `data.flags ?? {}` with no validation either. If an admin sets `exportPdf` to the **string** `"false"` instead of the boolean `false`, `useFeatureFlag("exportPdf")` returns that string — and any code using it in a boolean context (`if (useFeatureFlag(...))`, a JSX conditional like `{flag && <Component/>}`) gets the wrong answer, because in JavaScript any non-empty string, including the string `"false"`, is truthy. An admin believing they just turned a feature off would have actually left it on, with the admin UI showing the change as successfully saved.

One thing worth flagging honestly rather than glossing over: `setFeatureFlag` on the frontend (`adminService.ts`) is itself typed `value: boolean | string` — so the string-accepting path isn't purely a defensive-coding gap, it's something the frontend's own admin-facing function signature seems to anticipate. I didn't find anywhere this is actually exercised with a string in practice, but the type signature itself is worth a second look — either it's vestigial and should be tightened to `boolean` only, or there was an intended use for string flag values I haven't located.

### What I'd want before fixing this
The fix is small and I'm confident in its shape — validate `name` against `Object.keys(DEFAULT_FLAGS)`, require `typeof value === "boolean"`, reject anything else with a `400`. Low-risk, no product judgment call needed. I haven't applied it yet only because I'd rather batch it with the other route-layer validation fixes from this audit (Pass 4's Finding #12 is the same shape of fix in a different file) than ship single-line diffs piecemeal — happy to do it now if you'd rather not wait for a batch.

---

## Finding #15 — System health's 7-day error rate is divided by lifetime session count, not 7-day session count

**Severity: Low, but operationally meaningful — this is the kind of thing that can make a real problem invisible on the one screen meant to surface it. Missed in the original Pass 5 writeup — I didn't read this route at all the first time through; added here on review.**

### Where
`artifacts/api-server/src/routes/admin.ts`, `GET /admin/system-health`:
```ts
const [
  userCount, sessionCount, txCount,
  recentSessions, errorSessions, feedbackCount,
] = await Promise.all([
  db.collection("users").count().get(),
  db.collection("sessions").count().get(),                                                    // ← lifetime, no date filter
  db.collection("credit_transactions").count().get(),
  db.collection("sessions").where("createdAt", ">=", last24h).count().get(),                   // ← 24h window
  db.collection("sessions").where("status", "==", "error").where("createdAt", ">=", last7d).count().get(), // ← 7-day window
  db.collection("feedback").where("createdAt", ">=", last7d).count().get(),
]);

return res.json({
  ...
  last7d: {
    errorSessions: errorSessions.data().count,
    feedbackEntries: feedbackCount.data().count,
    errorRate: sessionCount.data().count > 0
      ? ((errorSessions.data().count / Math.max(sessionCount.data().count, 1)) * 100).toFixed(1)
      : "0.0",
  },
});
```

### What's broken
`errorSessions` is correctly scoped to the last 7 days. The denominator, `sessionCount`, is the **all-time lifetime total** — it's the same variable used for the unrelated `collections.sessions` field earlier in the response, with no date filter at all. I checked whether a real 7-day-scoped total was computed anywhere nearby and just not used — it isn't; `recentSessions` is scoped to `last24h`, not `last7d`, so there's no existing 7-day total sitting unused. A genuinely new count query is needed to fix this, not just a variable swap.

### Why this matters
As the lifetime session total grows, this ratio mathematically trends toward zero regardless of what's actually happening in the last week — a worked example makes the distortion concrete: 10,000 lifetime sessions, 100 sessions in the last 7 days, 10 of those erroring. The real 7-day error rate is 10/100 = 10%. What this code reports is 10/10,000 = 0.1%. That's not a rounding difference, it's off by two orders of magnitude, and it gets worse the older and larger the product gets — meaning this metric becomes less trustworthy over time, in exactly the direction that hides a real, current problem (a bad deploy, a provider outage) behind an increasingly large pile of historical, unrelated session volume.

### What I'd want before fixing this
Straightforward, no product judgment call needed: add a 7-day-scoped total session count alongside the existing 7-day error count, and divide by that instead.
```ts
db.collection("sessions").where("createdAt", ">=", last7d).count().get(),  // new query
```
then
```ts
const sessionCount7d = sessions7d.data().count;
const errorCount7d = errorSessions.data().count;
errorRate: sessionCount7d > 0
  ? ((errorCount7d / sessionCount7d) * 100).toFixed(1)
  : "0.0",
```
This adds one more `count()` query to the existing `Promise.all` — cheap, no new index needed since it's the same collection with the same kind of date-range filter already used elsewhere in this exact route. I haven't applied this yet only because it's touching the same response shape the admin dashboard presumably already renders against, and I'd rather you confirm the field name change (`last7d.errorRate` staying put, just fed a different denominator) won't break anything on the frontend side expecting the current shape, before I touch it.

---

## If fixing rather than just reading: suggested order for this pass's three findings
None of these are security-critical, so this is about operational value, not risk: **#15 first** — a wrong health metric can actively mask a real, current outage or bad deploy, which is a worse failure mode than the other two being imprecise. **#14 second** — tightening flag validation is cheap and prevents a class of silent admin mistake. **#13 third** — the search-completeness gap is real but lowest-frequency; it only bites when someone's specifically hunting for a user by name in an account base large enough for the 200-record window to matter.

---

## What I verified and found clean this pass

- **Every route except two is gated by `requireAdmin`**, which checks `decoded?.admin` from the verified Firebase ID token — not from anything client-supplied. The two exceptions are both deliberate and correctly scoped: `POST /admin/set-claim` (the bootstrap mechanism, gated by a separate `ADMIN_MASTER_SECRET` env var instead) and `GET /feature-flags` (intentionally public-read per `replit.md`'s own documented architecture — confirmed the doc's claim against the actual code).
- **`POST /admin/set-claim`** — checked the secret comparison specifically (`secret !== masterSecret`, plain string comparison rather than `crypto.timingSafeEqual`). Noting this as a minor inconsistency rather than a real finding: the practical exploitability of timing a comparison against a long, operator-set secret over a network is very low, and this codebase already correctly uses constant-time comparison where it matters most (Pass 3's `squareEventHandler.ts`, checked on every payment). Worth tightening for consistency, not worth a dedicated severity rating.
- **Credit adjustment, ban, and refund routes** — all three correctly use the canonical `addCredits()` ledger function rather than hand-rolled writes (consistent with Pass 2's documented invariant). The ban route's failure-mode behavior (Firestore flag succeeds even if the Firebase Auth account-disable call fails, surfaced via `authWarning`) matches `replit.md`'s claim about this exactly — third specific documentation claim from this file confirmed accurate against the real code, after the seat-briefs cache invalidation and the `api_logs`-falls-back-to-session-errors claim in earlier checks this pass.
- **Seat-briefs admin routes** (`PATCH`/`DELETE /admin/seat-briefs/:seatId`) — both correctly call `invalidateSeatBriefsCache()`, fulfilling the promise made in Pass 1's `seatBriefs.ts` docstring. Both also validate `seatId` against the real `SEAT_IDS` set before writing.
- **Conscience admin routes** (`PATCH /admin/conscience`) — correctly calls `invalidateConscienceCache()`, fulfilling the equivalent promise from Pass 2's `conscienceConfig.ts`.
- **Pricing admin routes** — re-confirmed the `1-100` multiplier validation bound from Pass 2 is still enforced exactly as documented. `DELETE /admin/pricing/:model` takes no `model` validation, but traced this to `resetMultiplierToDefault`'s actual behavior (Pass 2): deleting a key that was never in the overrides map is a harmless no-op, not a bug.
- **API key admin routes** — `key` requires a minimum length, `label` requires non-empty; `baseUrl` isn't validated, but this only affects the admin's own configured outbound provider connection, not a security boundary reachable by anyone but the already-fully-trusted admin who set it.
- **`GET /admin/abuse-flags`** — queries `where("rating", "in", ["bad", "warn"])`. Cross-checked against the actual `FeedbackRating` type in `feedbackService.ts` (`"good" | "bad" | "warn"`) to confirm this genuinely covers every non-positive rating value — it does, no silent gap.
- **`PUT /admin/templates/:id`** — `title`/`description` are stored with no sanitization, which looked worth checking given this pass's general theme of unsanitized text flowing into render paths (Pass 2's `displayName` finding). Checked where these actually render: `Session.tsx` displays both via plain JSX interpolation (React-escaped by default), and the PDF export path specifically passes `template.title` through the `esc()` helper already shipped as part of the earlier `exportPDF` fix. No gap — and good confirmation that fix was applied thinking about the general class of risk, not just the one field originally reported.
- **`api-usage`, `error-logs` routes** — both correctly treat `api_logs` as a collection that may not exist yet (wrapped in their own try/catch separate from the outer one), matching `replit.md`'s documented fallback behavior exactly.

---

## Where to pick this up next
Remaining routes: `sessions.ts`, `report.ts`, `templates.ts` (the user-facing route, distinct from the admin CRUD just covered — worth checking whether it has the same lack of input sanitization, now that this pass confirmed the rendering side is safe regardless), `providers.ts`, `health.ts`, and the two files that have only been partially read so far (`webhook.ts`, `brain.ts`). Given what's left is several smaller files rather than one large one, the next pass could reasonably cover most or all of them together.

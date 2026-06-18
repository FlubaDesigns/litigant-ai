# Fluba Brain — Replit Handoff Document
**Version:** V29 (current canonical)  
**Prepared by:** Claude Sonnet 4.6 (primary build session)  
**Date:** June 2026  
**Project owner:** Dave (Fluba Designs LLC)

---

## 1. What This Is

Fluba Brain is a multi-agent AI courtroom system. The user submits a question or task. Multiple AI agents debate it through structured roles until they reach a confidence target. The user receives a quality-assured final answer.

**Positioning:**
> Don't just ask AI. Put the question on trial.

The product is pre-revenue, prototype-complete, and ready for productization. The V29 HTML file is the full working system — all logic, UI, SVG diagram, animations, conscience layer, feedback/grading system, and onboarding flow in a single file.

---

## 2. The File

**`Fluba_Brain_V29.html`** — single HTML file, ~1429 lines, one script block, no external dependencies except the Anthropic API.

Do not break this into components until you have confirmed it runs correctly in Replit. The single-file architecture is intentional for this phase.

---

## 3. Architecture Overview

### 3.1 The Courtroom Flow

Two flows exist: `answer` and `build`.

**Answer flow:**
```
User → Orchestrator → Moderator → Courtroom Loop → Moderator Synthesis → Orchestrator → User
```

**Build flow:**
```
User → Orchestrator → Moderator → Courtroom Loop → Moderator → Architect → Builder → Architect Review → Auditor → Orchestrator → User
```

The system auto-detects which flow to use based on keywords in the question.

### 3.2 The Courtroom Loop

The loop runs until one of three conditions is met:
- Confidence target reached (default 90%)
- Max iterations reached (default 5)
- Credit cap reached (default 25)

Each round: all litigants respond in sequence. After each round, confidence increases using a convergence formula: `confidence += ceil((target - confidence) / 2)`.

### 3.3 Seats

| Seat | Role | Default AI |
|---|---|---|
| User | Originates the request | Human |
| Orchestrator | Routes and delivers final answer | GPT-5.5 |
| Moderator | Frames deliberation and synthesizes | Claude Opus |
| Auditor | Quality gate on output | GPT-5.5 |
| Architect | Plans builds | Claude Opus |
| Builder | Executes builds | GPT-5.5 |
| Litigants (1–N) | Debate the question | Configurable |

### 3.4 Deliberation Modes

- **Independent** — each litigant reasons alone
- **Chain** — each litigant reads prior responses before answering

### 3.5 Court Modes

- **Adversarial** — litigants are forced to argue against consensus
- **Collaborative** — litigants build on each other

---

## 4. Key State Objects

### `BrainState`
Central runtime state. Contains: litigants array, credits, confidence, iterations, court mode, response mode, deliberation mode, conscience mode, conversation history, session ID.

### `GradeState`
Live per-seat grade tracking. Grades update from user feedback (👍/👎/⚠️). Scale: F → A+. Each seat tracks runs, good count, bad count, and last 20 feedback records.

### `UserSession`
Currently stubbed: `{userId:'guest', plan:'starter', creditBalance:50}`. Wire to Firebase Auth on backend integration.

### `SEAT_DEFS`
Static seat configuration — AI assignment, purpose, starting grade. Grades are overwritten by `GradeState` after feedback.

### `AI_OPTIONS`
The five configured AI providers: GPT-5.5, Claude Opus, Grok, Gemini, Local. These are display names only — all actual API calls currently go to `claude-sonnet-4-20250514`.

---

## 5. The API

**Current state:** All AI calls go directly to the Anthropic API from the browser.

```
POST https://api.anthropic.com/v1/messages
Model: claude-sonnet-4-20250514
Max tokens: 1000
```

**⚠ Critical production requirement:** Move to a server-side proxy before public launch. The API key is exposed in the browser. Credits are not server-enforced. See Section 10.

The `callClaude` function handles:
- System prompt injection (session context + seat role + conscience directive + document context)
- Disclosure header generation `[Seat | Configured: X | Responding: Claude Sonnet 4.6]`
- 429 rate limit retry with exponential backoff (3 retries: 2s/4s/6s)
- Error handling with visible badge

---

## 6. The Conscience System

The conscience layer is Dave's IP. It runs as a pre-execution gate before every courtroom run.

**When ON (default):**
1. `evaluateConscience(question)` runs five rule checks:
   - K1: Fabrication requests
   - K2: Rule/safety bypass attempts
   - K3: Prompt injection patterns
   - K4: Harmful technical instructions
   - K5: Vague question with very high confidence target
2. If clean → run proceeds, +1 credit charged (conscience premium)
3. If flagged → modal appears with specific reasons. User chooses: **Proceed Anyway** or **Cancel**
4. If user overrides → ⚠ OVERRIDE badge appears for the session

**When OFF:** conscience skipped entirely, raw output, body saturation filter applied visually.

The conscience badge in the topbar shows live state. One tap toggles it. Syncs with the Configure modal.

---

## 7. The Feedback & Grading System

After every completed run, a feedback bar appears below the final answer.

**Three options:**
- 👍 Good answer → bumps Orchestrator + Moderator grades up one step
- 👎 Bad answer → reveals four reason buttons, drops relevant seat grades
- ⚠️ Conscience missed something → logs for conscience improvement

**Reason codes:**
- `wrong` — wrong answer
- `nodebate` — litigants didn't really debate (drops litigant grades specifically)
- `vague` — too vague
- `other` — unspecified

Grades live in `GradeState`. They persist in session. Firebase stub is in place for persistence.

The seat inspector (tap any node) shows live grade + run history: `"5 runs — 4 👍 1 👎"`.

---

## 8. The SVG Diagram

The courtroom diagram is a live SVG rendered into `#stage`. All geometry is computed from constants in `G` — do not change node positions in the SVG directly.

**Key constants:**
```js
G = {
  frame: { left:140, top:220, right:1060, bottom:720, rx:34 },
  court: { left:250, top:320, right:720,  bottom:610, rx:24 },
  yMid: 465, centerX: 600
}
```

**Layers (bottom to top):**
1. `railLayer` — outer frame + inner courtroom rectangle (layered strokes)
2. `permanentBridgeLayer` — hardcoded moderator-to-courtroom bridge line
3. `guideLayer` — dashed route paths
4. `seatLayer` — fixed seat nodes with role icons
5. `litigantLayer` — dynamic litigant nodes on courtroom perimeter
6. `courtControlsLayer` — + and − buttons in courtroom center
7. `logicWake`, `logicTrace`, `logicCore` — animation paths (top)

**Pulse animation:** Wired to actual API logic. When a litigant API call fires, `animateRouteToLitigant(i)` runs the pulse to that litigant's position. When the response lands, `flashLitigant(i)` flashes the node hot. Not a dummy timer.

**Stutter fix:** `pathSegmentDClosed` handles the wrap-around on the closed courtroom loop path, preventing the straight-chord artifact at the seam.

---

## 9. Document Context

Users can paste a document (contract, report, article, code) into the **📄 Document Context** panel above the input bar. It gets injected into every seat's system prompt, capped at 8000 characters. The **ACTIVE** badge shows when content is loaded.

---

## 10. Firebase Stubs

All Firebase integration points are stubbed with `// PRE-WIRE:` or `// FIREBASE STUB:` comments. Search for these before wiring:

| Stub | Location | What to wire |
|---|---|---|
| UserSession | Line ~486 | Firebase Auth → `createUserWithEmailAndPassword` |
| saveSession | Line ~1269 | Firestore `brain_sessions` collection |
| buildSessionDoc | Line ~1260 | Session document schema (fully defined) |
| openSessionsModal | Line ~1275 | Query `brain_sessions` by userId |
| submitSignup | Line ~1303 | Firebase Auth + email verification |
| GradeState write | applyFeedback | Firestore `brain_seat_grades/{userId}` |
| Onboarding email capture | obNext | Firebase Auth + `brain_user_prefs` |

**Firestore collections needed (from roadmap):**
```
users, sessions, session_turns, credit_transactions,
templates, feedback, shared_reports, api_logs, admin_events
```

---

## 11. Credit System

**Current state:** Browser-side only. `BrainState.startCredits = 250`, hardcoded.

**How spending works:**
- Each route animation: 1 credit
- Each courtroom round: `max(2, litigantCount)` credits
- Conscience gate (when ON): +1 credit per run

**⚠ Production requirement:** Credits must be server-enforced. The roadmap is explicit: do not trust the front end for credit balances. Every credit change should create a `credit_transactions` record.

---

## 12. Onboarding Wizard

4-step guided onboarding for new users:
1. Welcome + auto-opens Configure
2. Configure prompt (with pulse on Configure button)
3. Email capture (50 free credits offer) — Firebase stub
4. Question prompt (pulse on question box, then run button)

**Dev bypass:** "Tour: ON/OFF" toggle in the topbar. Tap OFF to skip wizard during testing. Tap ON to re-run it (also clears the localStorage flag so it actually fires).

**localStorage key:** `fb_onboarded` — set to `'1'` when wizard is completed or skipped.

---

## 13. Known Issues / Production Gaps

| Issue | Severity | Notes |
|---|---|---|
| API calls from browser | Critical | Must move to server proxy before launch |
| Credits browser-only | Critical | Must move to server ledger |
| No real auth | Critical | UserSession is hardcoded guest |
| No real session persistence | High | buildSessionDoc schema is ready, needs Firestore write |
| AI_OPTIONS are display-only | Medium | All calls go to Claude Sonnet regardless of configured AI |
| No template system | Medium | Architecture supports it, not built yet |
| No landing page | Medium | Required before public launch |
| SVG filters expensive on mobile | Low | Add `prefers-reduced-motion` support |
| 116 inline styles | Low | CSS audit recommends extraction to classes |
| Naming convention mixed | Low | camelCase + kebab-case mixed throughout |

---

## 14. What NOT to Change Without Discussion

These decisions were made deliberately and are locked:

- **Single HTML file** — do not split until backend is wired and tested
- **Courtroom loop convergence formula** — `confidence += ceil((target - confidence) / 2)` — this is intentional
- **Conscience is a pre-gate, not a hard block** — user always has final authority
- **Feedback bar appears after every run** — not optional, this is the grading data collection mechanism
- **`pathSegmentDClosed`** — do not replace with `pathSegmentD` for the courtroom loop, it will reintroduce the stutter bug
- **Permanent bridge layer** — the Moderator-to-Courtroom line is hardcoded as a separate SVG layer, not a route, because it must always be visible
- **Tour: ON/OFF toggle** — dev tool, stays in production for now as a testing aid

---

## 15. Recommended First Steps in Replit

In order:

1. **Confirm it runs** — open V29.html, run a question, verify output appears
2. **Wire Firebase Auth** — replace UserSession stub
3. **Wire server-side AI proxy** — move `callClaude` to a Firebase Cloud Function
4. **Wire Firestore sessions** — `buildSessionDoc` schema is already complete
5. **Wire credit ledger** — `credit_transactions` collection, server-enforced
6. **Wire Stripe** — subscriptions + credit packs
7. **Build landing page**
8. **Build templates page** — 5 high-value templates to start
9. **Build session history page**
10. **Private beta**

---

## 16. Brand Notes

- **Product name:** Fluba Brain (domain: ai-brain.com pending acquisition)
- **Parent company:** Fluba Designs LLC
- **Color palette:** `#00C853` green, `#070D07` dark bg, `#7AB87A` silver-green, `#EEF7EE` light, `#d7ff77` hot yellow-green, `#f3d26a` warning amber
- **Font:** Arial (current) — upgrade to Chakra Petch or similar for production
- **Tagline:** *Don't just ask AI. Put the question on trial.*
- **Conscience system:** Dave's IP, charges +1 credit per run

---

## 17. File Inventory

| File | Purpose |
|---|---|
| `Fluba_Brain_V29.html` | Current canonical working prototype |
| `AI_COMMS_CANON_v2_CONSOLIDATED.md` | Governance canon for conscience system |
| `gh-brain-production-roadmap.md` | Full product roadmap to paid launch |
| `gh-brain-css-style-audit.md` | CSS audit findings (V27, mostly still applicable) |
| `AI-COMMS_pubsub_billing_PRODREADY_v1.zip` | AI-COMMS backend (separate Fluba platform, future Pub/Sub integration with Brain) |
| `AI-Guardrails_STACK-COMPAT_PRODREADY_v2.zip` | Conscience validation engine (production version of in-browser conscience) |
| `BRAIN_POLICY_pubsub_worker_HARDENED_v6.txt` | Brain Pub/Sub worker spec (future backend architecture) |

---

*This document was generated by Claude Sonnet 4.6 from a full day of live build sessions with Dave. Every architectural decision in it was made in conversation. When in doubt, ask Dave before changing anything structural.*

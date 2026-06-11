# GH Brain V27 Production Roadmap  
## Turning the Prototype into a Payable Product

**Project:** GH Brain  
**Current status:** strong prototype / early product concept  
**Goal:** prepare GH Brain for public use as a paid SaaS-style decision-support, multi-AI reasoning, and artifact-generation platform.

---

## 1. Core Product Positioning

GH Brain should not be sold as “a cool AI animation” or “multiple chatbots talking.”

That is not what people pay for.

The paid product should be positioned as:

> **A multi-AI reasoning engine that helps users make better decisions, generate better work products, and reduce blind spots by forcing ideas through structured debate, critique, synthesis, and audit.**

The courtroom metaphor is valuable because it gives users a mental model:

1. The user submits a question or task.
2. The Orchestrator receives and routes it.
3. The Moderator frames the issue.
4. Litigants argue, challenge, or collaborate.
5. The Moderator synthesizes.
6. Specialists build or audit when needed.
7. The user receives a final answer, report, or artifact.

The visual system should support that experience, but the value is the **quality-assured output**.

---

## 2. What People Would Actually Pay For

Users are unlikely to pay simply because several AI agents are involved. They will pay if GH Brain reliably produces something useful.

### Strong payable use cases

- Business plans
- Marketing strategies
- Website audits
- Code audits
- Contract review assistance
- Medical-question preparation and explanation
- Book/manuscript critique
- Political or policy analysis
- Investment thesis review
- Product idea validation
- Grant proposal review
- Insurance/document analysis
- Resume and career strategy
- Debate preparation
- Research summaries
- Risk analysis
- Decision support for major life/business choices

The public-facing message should be:

> **Don’t just ask AI. Put the question on trial.**

That is memorable and explains the product.

---

## 3. Pages Needed Before Public Launch

### 3.1 Landing Page

The current app is not enough by itself. A first-time visitor needs immediate orientation.

Required sections:

- Hero headline
- Short explanation
- Demo animation or video
- Use-case cards
- How it works
- Pricing preview
- Call to action
- Trust/safety statement
- FAQ

Suggested hero:

> **GH Brain**  
> Multiple AI minds. One courtroom. Better answers.

Supporting copy:

> Most AI tools give you one answer. GH Brain forces your question through structured debate, critique, synthesis, and audit before returning a final response.

Primary CTA:

> Start a Brain Session

Secondary CTA:

> See How It Works

---

### 3.2 App / Brain Session Page

This is the current main interface.

Needed production improvements:

- Clear “New Session” button
- Clear “Continue Session” behavior
- Better first-run empty state
- Built-in example prompts
- Template selector before running
- Visible cost estimate before execution
- Clear stop/pause state
- Clear final-output area
- Export options
- Save status
- Loading states for each AI
- Better error messages
- Mobile keyboard handling
- Accessibility labels

This page must feel like a tool, not just a demo.

---

### 3.3 Templates Page

This may be one of the most important pages.

New users often do not know what to ask. Templates solve that.

Suggested template categories:

#### Business
- Business Plan Builder
- Marketing Strategy
- Competitor Analysis
- Product Launch Plan
- Pricing Strategy
- SWOT Analysis

#### Writing
- Manuscript Critique
- Book Chapter Review
- Article Draft
- Speech Draft
- Argument Strength Test

#### Technical
- Code Audit
- Architecture Review
- Bug Investigation
- Security Review
- API Design Review

#### Personal / Decision Support
- Pros and Cons Analysis
- Major Purchase Decision
- Career Decision
- Health Appointment Prep
- Legal Question Prep

#### Research
- Research Summary
- Source Comparison
- Argument Map
- Policy Analysis
- Historical Analysis

Each template should include:

- Title
- Description
- Suggested confidence level
- Suggested number of litigants
- Estimated credit cost
- Input fields
- Output type

Example:

```text
Template: Website Audit
Input:
- Website URL
- Business goal
- Target audience
- Known concerns

Output:
- UX review
- Content review
- Technical concerns
- Conversion recommendations
- Priority action list
```

Templates turn GH Brain from a blank prompt box into a product.

---

### 3.4 Session History Page

Users need permanence.

Required features:

- Saved sessions list
- Search sessions
- Filter by type/template
- Rename session
- Delete/archive session
- Continue session
- View confidence and credits used
- Export session
- Share session
- Star/favorite important sessions

Suggested fields:

```text
sessionId
userId
title
createdAt
updatedAt
templateType
confidence
creditsUsed
status
shared
tags
```

---

### 3.5 Billing / Credits Page

If users are paying, they need transparency.

Required features:

- Current credit balance
- Credit usage history
- Purchase credits
- Subscription status
- Plan limits
- Payment history
- Cancel/upgrade/downgrade
- Low-credit warning
- Auto-refill option

Credits must be server-controlled, not browser-controlled.

Do not trust the front end for credit balances.

---

### 3.6 Account / Settings Page

Required settings:

- Name
- Email
- Password/auth provider
- Default court mode
- Default confidence target
- Default response mode
- Default output format
- Saved preferred templates
- Delete account
- Data export
- Notification preferences

Optional later:

- Theme settings
- Accessibility settings
- Font size
- Animation intensity
- Reduced motion mode

---

### 3.7 Share / Public Report Page

This could become a growth engine.

Users should be able to publish or share a cleaned-up report.

A shared report should include:

- Question
- Template used
- Summary
- Final answer
- Confidence level
- Number of rounds
- Number of litigants
- Optional debate transcript
- Timestamp
- Share link

Important:

Users must choose whether a report is private or public.

Default should be private.

---

### 3.8 Admin Dashboard

Needed before real launch:

- Users
- Sessions
- Credit transactions
- API usage
- Error logs
- Abuse flags
- Refund tools
- Manual credit adjustment
- Model cost monitoring
- System health
- Template management
- Feature flags

Admin is not optional if money is involved.

---

## 4. Production Architecture

The current single HTML file should be split before production.

Recommended structure:

```text
/src
  /components
    Header.js
    Modal.js
    CreditMeter.js
    BrainSvg.js
    SessionCard.js
    TemplateCard.js

  /pages
    LandingPage.js
    BrainSessionPage.js
    TemplatesPage.js
    SessionHistoryPage.js
    BillingPage.js
    SettingsPage.js
    ShareReportPage.js
    AdminDashboard.js

  /engine
    brainState.js
    routeEngine.js
    animationEngine.js
    courtroomEngine.js
    gradingEngine.js
    templateEngine.js

  /services
    authService.js
    sessionService.js
    creditService.js
    aiService.js
    billingService.js
    feedbackService.js

  /styles
    base.css
    layout.css
    brain-svg.css
    modals.css
    mobile.css
```

The goal is not to make the project fancy. The goal is to prevent one small edit from breaking the entire system.

---

## 5. Backend Requirements

### 5.1 Authentication

Use Firebase Auth or equivalent.

Required:

- Email/password
- Email verification
- Password reset
- Google sign-in optional
- Account deletion
- Auth state persistence

---

### 5.2 Database

Recommended Firestore collections:

```text
users
sessions
session_turns
credit_transactions
templates
feedback
shared_reports
api_logs
admin_events
```

#### users

```text
userId
email
displayName
plan
creditBalance
createdAt
lastLoginAt
defaultSettings
subscriptionStatus
stripeCustomerId
```

#### sessions

```text
sessionId
userId
title
createdAt
updatedAt
templateId
status
confidence
creditsUsed
shared
shareId
```

#### session_turns

```text
turnId
sessionId
userId
question
finalAnswer
deliberation
confidence
creditsUsed
createdAt
```

#### credit_transactions

```text
transactionId
userId
type
amount
balanceAfter
source
sessionId
stripePaymentId
createdAt
```

#### templates

```text
templateId
title
category
description
inputSchema
defaultSettings
estimatedCredits
isActive
```

#### feedback

```text
feedbackId
userId
sessionId
turnId
rating
reason
notes
createdAt
```

---

### 5.3 Server-Side AI Calls

Do not call AI APIs directly from the browser.

Production must use a server-side proxy.

Reasons:

- Protect API keys
- Enforce credit usage
- Log costs
- Apply rate limits
- Handle retries
- Prevent abuse
- Track model performance

Suggested flow:

```text
Browser
  → /api/run-brain
Server
  → check auth
  → check credit balance
  → call AI providers
  → write session/turn logs
  → deduct credits
  → return result
```

---

### 5.4 Credit System

Credits must be ledger-based.

Do not only store a balance.

Every credit change should create a transaction record.

Transaction types:

```text
purchase
usage
refund
bonus
admin_adjustment
subscription_grant
```

A user balance should be calculated or verified against the ledger.

---

### 5.5 Payments

Recommended:

- Stripe for subscriptions and credit packs
- Webhooks for payment confirmation
- Firestore update only after webhook success

Plans could be:

#### Free
- 50 trial credits
- Limited session history
- 4 litigants
- Basic templates

#### Starter
- Pay as you go
- Buy credit packs
- 4 litigants
- Saved history

#### Pro
- Monthly credit allowance
- 8 litigants
- Advanced templates
- Share reports
- Export options

#### Team / Business
- Shared workspace
- Admin seats
- Higher limits
- Organization billing
- Priority processing

---

## 6. Usability Improvements

### 6.1 First-Time User Flow

Do not drop users directly into a complex cockpit.

Suggested flow:

1. Landing page
2. Choose template or “Ask anything”
3. Enter question
4. Show estimated cost
5. Run session
6. Show final answer
7. Offer save/share/export
8. Prompt signup if guest

---

### 6.2 Clear Output Area

The final answer should not be buried in the same stream as internal steps.

Recommended tabs:

```text
Final Answer
Debate Notes
Transcript
Artifacts
Sources / Caveats
```

---

### 6.3 Better Mobile UX

Mobile matters heavily for this project.

Required:

- Large buttons
- No tiny SVG controls
- Reduced motion option
- Sticky run button
- Better text input behavior
- Modal scroll lock
- No horizontal overflow
- Touch-safe controls
- Session save indicator
- Clear loading states

---

### 6.4 Accessibility

Required:

- Keyboard navigation
- ARIA labels
- Reduced motion mode
- Sufficient contrast
- Screen-reader labels for SVG controls
- Focus management in modals
- Error messages not color-only

---

## 7. Safety, Trust, and Legal

GH Brain must not present itself as a lawyer, doctor, financial advisor, or guaranteed truth engine.

Needed:

- Terms of Service
- Privacy Policy
- AI disclaimer
- Medical/legal/financial disclaimer
- Refund policy
- Data retention policy
- Content policy
- Abuse reporting
- User data export/delete

Suggested disclaimer:

> GH Brain provides AI-generated reasoning and decision support. It is not legal, medical, financial, or professional advice. Always verify important decisions with qualified professionals.

---

## 8. Model Strategy

Production should support multiple providers eventually, but start simple.

Initial production:

- One primary AI provider
- One fallback provider
- Server-side routing
- Model logs
- Cost tracking

Later:

- User-selected models
- Provider comparison
- Specialty roles
- Local/private model option
- Enterprise model routing

Do not overcomplicate model routing before the product proves demand.

---

## 9. Template Engine

Templates are the bridge between prototype and product.

Each template should define:

```text
templateId
category
title
description
inputFields
defaultCourtMode
defaultConfidenceTarget
defaultLitigants
outputFormat
estimatedCredits
systemPrompt
moderatorPrompt
litigantPrompt
finalOutputPrompt
```

Example templates to launch with:

1. Business Plan Builder
2. Website Audit
3. Marketing Strategy
4. Code Audit
5. Contract Review Assistant
6. Book/Manuscript Critique
7. Medical Appointment Prep
8. Major Decision Analysis
9. Research Summary
10. Product Idea Stress Test

---

## 10. Reporting / Artifact Output

This is where GH Brain can become valuable.

Users should be able to generate:

- Markdown report
- PDF report
- HTML report
- Copy/paste summary
- Decision memo
- Action checklist
- Risk matrix
- Pros/cons table
- Implementation plan

The final artifact should feel polished.

Not just chat text.

---

## 11. Analytics to Track

You need to know whether people find value.

Track:

- Signup conversion
- First session completion
- Template usage
- Average credits per session
- Drop-off points
- Payment conversion
- Repeat usage
- Export/share usage
- Feedback ratings
- Model/API failure rate
- Cost per run
- Gross margin per run

Without analytics, you are guessing.

---

## 12. Minimum Viable Paid Product

The smallest version worth charging for:

### Must have

- Landing page
- Auth
- Brain session page
- 5 strong templates
- Saved sessions
- Credit ledger
- Stripe payments
- Server-side AI proxy
- Final answer/report export
- Basic mobile polish
- Error handling
- Privacy/terms/disclaimers

### Can wait

- Team accounts
- Public report gallery
- Advanced model selection
- Enterprise controls
- Custom templates
- Deep analytics dashboard
- API access
- White-labeling

---

## 13. Suggested Launch Sequence

### Phase 1 — Stabilize Prototype

- Clean code structure
- Fix CSS duplication
- Remove dead code
- Confirm animation/render stability
- Make route system single-source
- Improve mobile layout

### Phase 2 — Product Shell

- Landing page
- Auth
- Templates page
- Session history page
- Billing/credits page
- Settings page

### Phase 3 — Backend

- Server-side AI proxy
- Firestore sessions
- Credit transactions
- Stripe checkout
- Stripe webhooks
- Error logs

### Phase 4 — Paid Beta

- Limit to invited users
- Give trial credits
- Track usage
- Interview users
- Refine pricing
- Improve templates

### Phase 5 — Public Launch

- Publish landing page
- Add demo video
- Add documentation
- Add support email
- Enable paid credits
- Monitor cost and abuse closely

---

## 14. Honest Assessment

GH Brain has a strong concept.

The visual metaphor is memorable. The courtroom idea is marketable. The multi-agent structure can become valuable.

But the current version is not yet a payable product by itself.

It is a strong prototype.

To become a product, it needs:

1. Clear onboarding
2. Templates
3. Saved sessions
4. Billing
5. Server-side AI calls
6. Credit ledger
7. Polished reports
8. Mobile usability
9. Trust/legal pages
10. Admin controls

The most important product shift is this:

> GH Brain should not sell “AI debate.”  
> GH Brain should sell “better decisions and better outputs through structured AI review.”

That is the difference between a novelty and a business.

---

## 15. Recommended First Build Priorities

If I were building the next version, I would do these first:

1. Create a landing page.
2. Create a templates page with 5–10 high-value templates.
3. Refactor the single HTML into structured files.
4. Wire Firebase Auth.
5. Wire Firestore saved sessions.
6. Build a server-side AI proxy.
7. Build credit ledger and Stripe checkout.
8. Build final report export.
9. Improve mobile onboarding.
10. Launch a private beta.

That would move GH Brain from impressive prototype toward real paid product.

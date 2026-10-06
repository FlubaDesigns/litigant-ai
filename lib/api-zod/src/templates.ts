import { z } from "zod";
import { CourtConfigSchema, type CourtConfig } from "./session";
export type { CourtConfig, ArtifactType, ProviderName } from "./session";
export const TemplateInputFieldSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  label: z.string().trim().min(1).max(300),
  placeholder: z.string().max(1000).default(""),
  type: z.enum(["text", "textarea", "url"]),
  required: z.boolean(),
});
export const TemplateInputFieldsSchema = z.array(TemplateInputFieldSchema).max(30).refine(
  fields => new Set(fields.map(field => field.id)).size === fields.length,
  {message: "Each question must have a unique ID"},
);
export type TemplateInputField = z.infer<typeof TemplateInputFieldSchema>;

export interface Template {
  id: string;
  category: "business" | "technical" | "personal" | "research" | "writing";
  title: string;
  description: string;
  icon: string;
  inputFields: TemplateInputField[];
  defaultConfig: CourtConfig;
  estimatedCredits: number;
  systemPrompt: string;
}

export const DEFAULT_CONFIG: CourtConfig = CourtConfigSchema.parse({});

const LEGACY_TEMPLATE_PROMPTS: Record<string, string> = {
  "business-plan": "You are evaluating a business concept for viability, market fit, financial sustainability, and competitive advantage.",
  "website-audit": "You are auditing a website for UX quality, content effectiveness, technical performance, and conversion optimization.",
  "marketing-strategy": "You are evaluating a marketing strategy for effectiveness, channel fit, audience alignment, and ROI potential.",
  "code-audit": "You are conducting a technical audit for security vulnerabilities, performance issues, maintainability concerns, and architectural improvements.",
  "contract-review": "You are reviewing a contract to identify risks, unfavorable terms, missing protections, and negotiation opportunities. Note: this is not legal advice.",
  "book-critique": "You are critiquing writing for argument strength, clarity, structure, pacing, and overall impact on the intended audience.",
  "medical-prep": "You are helping a patient prepare for a medical appointment by analyzing their situation, generating informed questions, and explaining relevant concepts. This is not medical advice.",
  "major-decision": "You are conducting a structured decision analysis, examining trade-offs, risks, second-order effects, and long-term implications of each option.",
  "research-summary": "You are synthesizing research on a topic, identifying consensus, contested areas, methodological concerns, and practical implications.",
  "product-stress-test": "You are stress-testing a product idea by challenging its core assumptions, market fit, competitive positioning, and viability."
};

const LEGACY_TEMPLATE_FIELDS: Record<string, TemplateInputField[]> = {
  "business-plan": [
      { id: "concept", label: "Business concept", placeholder: "Describe your product or service idea", type: "textarea", required: true },
      { id: "market", label: "Target market", placeholder: "Who are your customers?", type: "text", required: true },
      { id: "revenue", label: "Revenue model", placeholder: "How will you make money?", type: "text", required: true },
      { id: "competition", label: "Known competitors", placeholder: "Who do you compete with?", type: "text", required: false },
    ],
  "website-audit": [
      { id: "url", label: "Website URL", placeholder: "https://example.com", type: "url", required: true },
      { id: "goal", label: "Business goal", placeholder: "What should the site accomplish?", type: "text", required: true },
      { id: "audience", label: "Target audience", placeholder: "Who visits this site?", type: "text", required: false },
      { id: "concerns", label: "Known concerns", placeholder: "Any specific issues to investigate?", type: "textarea", required: false },
    ],
  "marketing-strategy": [
      { id: "product", label: "Product or service", placeholder: "What are you marketing?", type: "text", required: true },
      { id: "strategy", label: "Marketing strategy", placeholder: "Describe your current or planned approach", type: "textarea", required: true },
      { id: "budget", label: "Budget range", placeholder: "e.g. $5k/month", type: "text", required: false },
      { id: "goal", label: "Primary goal", placeholder: "Awareness, leads, sales?", type: "text", required: true },
    ],
  "code-audit": [
      { id: "code", label: "Code or system description", placeholder: "Paste code snippet or describe your architecture", type: "textarea", required: true },
      { id: "language", label: "Language / framework", placeholder: "e.g. TypeScript, React, Node.js", type: "text", required: false },
      { id: "concerns", label: "Specific concerns", placeholder: "Security? Performance? Scalability?", type: "text", required: false },
    ],
  "contract-review": [
      { id: "contract", label: "Contract text or summary", placeholder: "Paste the key clauses or summarize the agreement", type: "textarea", required: true },
      { id: "role", label: "Your role", placeholder: "Are you the buyer, seller, employee, etc.?", type: "text", required: true },
      { id: "concerns", label: "Main concerns", placeholder: "What worries you most?", type: "text", required: false },
    ],
  "book-critique": [
      { id: "excerpt", label: "Excerpt or chapter summary", placeholder: "Paste text or describe the content", type: "textarea", required: true },
      { id: "genre", label: "Genre / type", placeholder: "Non-fiction, novel, academic, etc.", type: "text", required: false },
      { id: "goal", label: "Goal of the work", placeholder: "What should the reader feel or learn?", type: "text", required: false },
    ],
  "medical-prep": [
      { id: "situation", label: "Medical situation", placeholder: "Describe your symptoms or diagnosis", type: "textarea", required: true },
      { id: "appointment", label: "Type of appointment", placeholder: "e.g. cardiology follow-up, GP visit", type: "text", required: false },
      { id: "questions", label: "Questions you already have", placeholder: "What do you want to ask?", type: "textarea", required: false },
    ],
  "major-decision": [
      { id: "decision", label: "The decision", placeholder: "What are you deciding between?", type: "textarea", required: true },
      { id: "options", label: "Options", placeholder: "Option A vs Option B (or more)", type: "textarea", required: true },
      { id: "constraints", label: "Constraints", placeholder: "Budget, time, relationships, etc.", type: "text", required: false },
      { id: "priority", label: "What matters most?", placeholder: "Financial security? Growth? Stability?", type: "text", required: false },
    ],
  "research-summary": [
      { id: "topic", label: "Research topic or paper", placeholder: "Paste abstract or describe the topic", type: "textarea", required: true },
      { id: "question", label: "Core question", placeholder: "What are you trying to understand?", type: "text", required: true },
      { id: "context", label: "Context", placeholder: "Academic, business, personal?", type: "text", required: false },
    ],
  "product-stress-test": [
      { id: "idea", label: "Product idea", placeholder: "Describe your product concept in detail", type: "textarea", required: true },
      { id: "problem", label: "Problem it solves", placeholder: "What pain point does this address?", type: "text", required: true },
      { id: "customer", label: "Target customer", placeholder: "Who experiences this pain?", type: "text", required: true },
      { id: "differentiation", label: "Key differentiator", placeholder: "Why would someone choose this over existing solutions?", type: "text", required: false },
    ],
};

const TEMPLATE_METHOD = "Working method for every seat: Use the user's supplied facts and Case Files. Distinguish facts, reported claims, estimates, assumptions and missing information. Do not invent research, figures, citations, tool access or completed tests. Questions should seek only information that materially affects this task. Accept \"I don't know\" and continue with explicit limitations and useful next steps rather than repeatedly asking the same question. Follow the configured court roles and output permissions. If document output is allowed, use the structure below; if answer-only is required, provide the corresponding conversational analysis and next steps without creating an artifact. Match detail to the material available and keep unsupported sections clearly marked as unknown.";

export const TEMPLATES: Template[] = [
  {
    id: "business-plan",
    category: "business",
    title: "Business Plan Builder",
    description: "Stress-test your business concept across viability, market fit, financials, and competition.",
    icon: "Briefcase",
    estimatedCredits: 25,
    defaultConfig: { ...DEFAULT_CONFIG, litigantCount: 4, confidenceTarget: 85, outputPreferenceMode: "document", artifactType: "business-plan" },
    inputFields: [
      {
        "id": "concept",
        "label": "Business and stage",
        "placeholder": "What are you building, what problem does it solve, and how far along are you?",
        "type": "textarea",
        "required": true
      },
      {
        "id": "market",
        "label": "Customers and location",
        "placeholder": "Who would buy it, and where will you operate?",
        "type": "text",
        "required": true
      },
      {
        "id": "purpose",
        "label": "Purpose of the plan",
        "placeholder": "Your own roadmap, a lender, investors, or another audience?",
        "type": "text",
        "required": true
      },
      {
        "id": "revenue",
        "label": "Pricing and costs",
        "placeholder": "How will you charge? Known startup, monthly, and per-sale costs?",
        "type": "textarea",
        "required": false
      },
      {
        "id": "competition",
        "label": "Alternatives and advantage",
        "placeholder": "What do customers use now? Why would they choose you?",
        "type": "text",
        "required": false
      },
      {
        "id": "resources",
        "label": "Budget, people, and time",
        "placeholder": "Available funding, team, capacity, and launch timing?",
        "type": "textarea",
        "required": false
      },
      {
        "id": "traction",
        "label": "Evidence so far",
        "placeholder": "Sales, interviews, preorders, tests, or assumptions still to check?",
        "type": "textarea",
        "required": false
      }
    ],
    systemPrompt: `${TEMPLATE_METHOD}\n\nPurpose: Build a usable business plan grounded in the owner's actual situation, stage and intended reader.
Critical questions: Clarify the business/offer, target customer and location, and what the plan is for. Ask about pricing, costs or resources only when their absence would change the recommendation or make a requested financial calculation impossible. Accept pre-revenue and unknown answers.
Examine: Customer need and evidence of demand; competing alternatives and differentiation; pricing and acquisition; delivery, staffing and operational capacity; funding, cash flow and failure risks. Challenge optimistic assumptions and identify inexpensive ways to validate them.
Document structure: Executive summary; business and offer; customers, market and competition; sales and marketing; operations and staffing; startup and ongoing costs; revenue, cash-flow and break-even scenarios; risks and mitigations; 30/60/90-day action plan; unresolved questions. Each action should have an owner or suggested role, timing and a measurable completion criterion.
Financial discipline: Show supplied inputs, units, time periods and formulas. Separate actuals, estimates and explicitly hypothetical scenarios. Do not invent revenue, market size or costs. Where inputs are missing, show the calculation to complete and the required inputs, not a fabricated forecast. Fit the plan to its intended reader.`,
  },
  {
    id: "website-audit",
    category: "technical",
    title: "Website Audit",
    description: "UX, content, conversion, and technical review of any website.",
    icon: "Globe",
    estimatedCredits: 15,
    defaultConfig: { ...DEFAULT_CONFIG, litigantCount: 3, outputPreferenceMode: "document", artifactType: "report" },
    inputFields: [
      {
        "id": "url",
        "label": "Website or page material",
        "placeholder": "URL, pasted page text, or identify the pages/screenshots in your Case Files",
        "type": "textarea",
        "required": true
      },
      {
        "id": "goal",
        "label": "Visitor goal",
        "placeholder": "What should visitors do: buy, book, contact, learn, or something else?",
        "type": "text",
        "required": true
      },
      {
        "id": "audience",
        "label": "Audience",
        "placeholder": "Who is the site for?",
        "type": "text",
        "required": false
      },
      {
        "id": "concerns",
        "label": "Concerns",
        "placeholder": "Which pages or problems should receive attention?",
        "type": "textarea",
        "required": false
      },
      {
        "id": "analytics",
        "label": "Optional evidence",
        "placeholder": "Device mix, funnel drop-offs, analytics, or tests you already ran",
        "type": "textarea",
        "required": false
      }
    ],
    systemPrompt: `${TEMPLATE_METHOD}\n\nPurpose: Produce an evidence-based website audit focused on the site's audience and intended visitor action.
Critical questions: Establish the page material available and intended conversion. A URL is a reference, not proof that any page was inspected. If no page content is available through actual tools or Case Files, ask the user to supply page text, screenshots or exported findings before claiming an audit. If they cannot, provide a clearly labeled audit checklist with that limitation.
Examine: Offer and message clarity; information hierarchy and navigation; mobile usability; accessibility indicators visible in the supplied material; trust; calls to action, forms, friction and conversion. Consider SEO and performance only to the extent supported by actual evidence.
Document structure: Scope and pages inspected; executive findings; prioritized issue table with affected page/element, observed evidence, user/business impact, severity, specific repair and a way to verify the repair; quick wins; larger improvements; remaining checks. Make recommendations concrete enough for a designer or developer to act on.
Evidence discipline: Distinguish observed defects from hypotheses and checks still needed. Never claim live browsing, speed measurements, accessibility certification, broken-link checks or analytics access unless actually performed. Do not imply a screenshot proves hidden behavior or whole-site compliance.`,
  },
  {
    id: "marketing-strategy",
    category: "business",
    title: "Marketing Strategy",
    description: "Evaluate a marketing approach across channels, messaging, audience, and ROI potential.",
    icon: "TrendingUp",
    estimatedCredits: 20,
    defaultConfig: { ...DEFAULT_CONFIG, litigantCount: 3, confidenceTarget: 80, outputPreferenceMode: "document", artifactType: "report" },
    inputFields: [
      {
        "id": "product",
        "label": "Offer and audience",
        "placeholder": "What are you selling, to whom, and why would they buy?",
        "type": "textarea",
        "required": true
      },
      {
        "id": "goal",
        "label": "Goal and timing",
        "placeholder": "What result do you want, and by when?",
        "type": "text",
        "required": true
      },
      {
        "id": "budget",
        "label": "Budget and capacity",
        "placeholder": "Money, hours per week, team and assets available",
        "type": "text",
        "required": false
      },
      {
        "id": "strategy",
        "label": "Current approach",
        "placeholder": "Channels, messages, campaigns and what has or has not worked",
        "type": "textarea",
        "required": false
      },
      {
        "id": "results",
        "label": "Results and economics",
        "placeholder": "Known leads, conversion, sales, margins or acquisition costs",
        "type": "textarea",
        "required": false
      }
    ],
    systemPrompt: `${TEMPLATE_METHOD}\n\nPurpose: Build a focused marketing strategy the user can afford and execute.
Critical questions: Clarify the offer, target audience and desired outcome. Ask about budget and available time when needed to choose channels or set a feasible schedule. Unknown past results should become measurement tasks, not invented baselines.
Examine: Positioning, customer motivation and objections, message and offer fit, channel fit, acquisition, landing/conversion journey, retention, workload and business economics. Compare a small number of credible channel choices and explain trade-offs rather than recommending every platform.
Document structure: Goal and baseline; priority audience segments; positioning and messaging examples; ranked channels with reasons; acquisition-to-retention journey; budget allocation with assumptions; achievable campaign/content schedule; responsibilities; measurement plan; initial experiments with measurable continue, revise or stop criteria.
Measurement discipline: Label targets as targets, not forecasts. Use known margins and conversions when estimating economics, otherwise show assumptions and ranges as scenarios. Never promise ROI or fabricate industry benchmarks, customer research or campaign performance.`,
  },
  {
    id: "code-audit",
    category: "technical",
    title: "Code Audit",
    description: "Security, performance, maintainability, and architecture review of code or a system design.",
    icon: "Code2",
    estimatedCredits: 20,
    defaultConfig: { ...DEFAULT_CONFIG, litigantCount: 3, outputPreferenceMode: "document", artifactType: "report" },
    inputFields: [
      {
        "id": "code",
        "label": "Code or supplied files",
        "placeholder": "Paste the relevant code or identify files in Case Files. A repository URL alone may not provide access.",
        "type": "textarea",
        "required": true
      },
      {
        "id": "behavior",
        "label": "Expected behavior",
        "placeholder": "What should this code do, and what happens now?",
        "type": "textarea",
        "required": true
      },
      {
        "id": "language",
        "label": "Stack and environment",
        "placeholder": "Language, framework, runtime, deployment and relevant versions",
        "type": "text",
        "required": false
      },
      {
        "id": "concerns",
        "label": "Audit priorities",
        "placeholder": "Failures, security, performance, maintainability, or specific questions",
        "type": "textarea",
        "required": false
      },
      {
        "id": "tests",
        "label": "Tests and logs",
        "placeholder": "Existing tests, reproduction steps or sanitized error output",
        "type": "textarea",
        "required": false
      }
    ],
    systemPrompt: `${TEMPLATE_METHOD}\n\nPurpose: Review the code and system evidence actually available, producing actionable findings while preserving the established architecture unless a change is justified.
Critical questions: Establish the available code and intended behavior. Ask for missing files, interfaces, environment details or reproduction steps only where a finding or repair depends on them. A repo URL or system description alone does not establish code access.
Examine: Relevant execution paths; correctness and edge cases; authentication/authorization and data handling; error and failure behavior; performance bottlenecks; maintainability and dependency assumptions; coverage of meaningful tests.
Document structure: Scope and reviewed files; prioritized findings with severity, file/function or supplied snippet location, observed evidence, triggering conditions, impact and confidence; concrete repair; affected components and compatibility risks; verification steps or proposed tests; unresolved questions. Separate confirmed defects from suspected risks and optional improvements.
Verification discipline: Never claim to have cloned a repository, executed code, run tests, scanned dependencies or verified a fix unless those actions actually occurred. Do not invent line numbers or vulnerabilities. Redact secrets in examples. Distinguish a proposed patch from an applied and tested fix.`,
  },
  {
    id: "contract-review",
    category: "personal",
    title: "Contract Review Prep",
    description: "Identify risks, unfavorable clauses, and negotiation points in a contract.",
    icon: "FileText",
    estimatedCredits: 20,
    defaultConfig: { ...DEFAULT_CONFIG, litigantCount: 3, confidenceTarget: 85, outputPreferenceMode: "document", artifactType: "contract-review" },
    inputFields: [
      {
        "id": "contract",
        "label": "Agreement or clauses",
        "placeholder": "Paste the text or identify the agreement in Case Files; say if this is only a summary",
        "type": "textarea",
        "required": true
      },
      {
        "id": "role",
        "label": "Your role and goal",
        "placeholder": "Your role in the agreement and what you want to achieve",
        "type": "text",
        "required": true
      },
      {
        "id": "jurisdiction",
        "label": "Jurisdiction",
        "placeholder": "Country/state or the governing-law clause, if known",
        "type": "text",
        "required": false
      },
      {
        "id": "concerns",
        "label": "Concerns and deadlines",
        "placeholder": "What worries you? Signing, renewal or response dates?",
        "type": "textarea",
        "required": false
      }
    ],
    systemPrompt: `${TEMPLATE_METHOD}\n\nPurpose: Help the user prepare for a contract discussion and qualified legal review, grounded in the actual agreement and their role.
Critical questions: Establish the text available, the user's role and desired outcome. Ask jurisdiction and relevant dates if they affect the requested interpretation. If unknown, identify the limitation and prepare questions rather than making enforceability claims.
Examine: Parties and obligations; payment and fees; term, renewal and notice; termination and remedies; ownership and permitted use; confidentiality; liability, indemnities and warranties; dispute provisions; ambiguous language and missing protections.
Document structure: Agreement/scope summary; obligations and dates to verify; clause-by-clause concern table quoting only relevant supplied wording and identifying its location, practical consequence and question; prioritized negotiation points; possible discussion wording clearly labeled for review; questions and documents for a qualified adviser.
Interpretation discipline: Separate what the text says from possible legal implications and jurisdiction-dependent questions. Do not fabricate clauses, deadlines or legal authorities. A summary cannot substitute for review of the full contract. Do not pronounce a term enforceable or invalid without an adequate basis; identify where qualified local advice is needed.`,
  },
  {
    id: "book-critique",
    category: "writing",
    title: "Book / Manuscript Critique",
    description: "Structured critique of writing for argument quality, clarity, structure, and impact.",
    icon: "BookOpen",
    estimatedCredits: 18,
    defaultConfig: { ...DEFAULT_CONFIG, litigantCount: 3, outputPreferenceMode: "document", artifactType: "report" },
    inputFields: [
      {
        "id": "excerpt",
        "label": "Manuscript or excerpt",
        "placeholder": "Paste the text or identify the manuscript in Case Files; state how much is included",
        "type": "textarea",
        "required": true
      },
      {
        "id": "genre",
        "label": "Genre and audience",
        "placeholder": "What kind of work is it, and who is it for?",
        "type": "text",
        "required": true
      },
      {
        "id": "goal",
        "label": "Purpose",
        "placeholder": "What should readers understand, feel or do?",
        "type": "text",
        "required": false
      },
      {
        "id": "feedback",
        "label": "Requested feedback",
        "placeholder": "Structure, plot/argument, pacing, voice, clarity or line edits?",
        "type": "textarea",
        "required": false
      },
      {
        "id": "context",
        "label": "Context",
        "placeholder": "Stage of the draft and any context outside this excerpt",
        "type": "textarea",
        "required": false
      }
    ],
    systemPrompt: `${TEMPLATE_METHOD}\n\nPurpose: Give an evidence-led critique that helps the author revise while retaining their voice and intent.
Critical questions: Establish the material supplied, genre, audience and feedback sought. If the author provides only a summary, distinguish feedback on the concept from critique of the actual prose.
Examine: Overall structure; story or argument progression; clarity and pacing; voice and tone; characterization or evidence as appropriate; internal consistency; repetition; reader engagement and payoff. Balance strengths to preserve with weaknesses to address.
Document structure: Scope; intended reader experience; specific strengths with passage evidence; prioritized revision plan; structure and pacing notes; clarity/consistency issues located in the supplied text; a few limited before/after examples explaining the change; practical next revision pass.
Scope discipline: Quote or reference actual passages, never invented ones. Do not claim to have reviewed the whole book from an excerpt. Distinguish reader reaction and editorial preference from factual error. Avoid rewriting the author's voice or imposing a different genre without explaining the trade-off.`,
  },
  {
    id: "medical-prep",
    category: "personal",
    title: "Medical Appointment Prep",
    description: "Prepare informed questions and understand your situation before a medical appointment.",
    icon: "Stethoscope",
    estimatedCredits: 15,
    defaultConfig: { ...DEFAULT_CONFIG, litigantCount: 2, confidenceTarget: 75, outputPreferenceMode: "document", artifactType: "memo" },
    inputFields: [
      {
        "id": "situation",
        "label": "Reason for the visit",
        "placeholder": "What would you like help discussing? Share only what you are comfortable sharing.",
        "type": "textarea",
        "required": true
      },
      {
        "id": "appointment",
        "label": "Appointment",
        "placeholder": "Type of appointment and when it is, if useful",
        "type": "text",
        "required": false
      },
      {
        "id": "timeline",
        "label": "Symptom timeline",
        "placeholder": "When things started, changes, and effects on daily life",
        "type": "textarea",
        "required": false
      },
      {
        "id": "history",
        "label": "Relevant background",
        "placeholder": "History, medicines and clinician instructions you choose to share",
        "type": "textarea",
        "required": false
      },
      {
        "id": "questions",
        "label": "Your concerns",
        "placeholder": "Questions and the most important things to cover",
        "type": "textarea",
        "required": false
      }
    ],
    systemPrompt: `${TEMPLATE_METHOD}\n\nPurpose: Organize the user's information into a useful medical appointment brief and questions for their clinician.
Critical questions: Clarify the reason for the visit and the user's main concern. Ask a short, relevant timeline question if necessary to organize the brief; do not demand sensitive history or medication details. Accept declined or unknown information.
Examine: User-reported symptom timeline and changes; effect on daily life; relevant history, medicines and existing clinician instructions voluntarily supplied; gaps the user may wish to discuss; priorities for the appointment.
Document structure: Concise appointment brief; top concerns; timeline; user-reported symptoms and relevant background; reported medicines/instructions without altering them; prioritized questions for the clinician; documents to bring if relevant; space for answers and follow-up notes.
Clinical boundaries: Do not diagnose, choose treatments, change medication or tell the user to disregard their clinician. Distinguish reported symptoms, the user's suspicions and diagnoses they report a clinician confirmed. Do not manufacture medical facts. If the user describes an apparent immediate emergency, prioritize seeking urgent local medical help over completing the template; do not turn routine appointment preparation into speculative triage.`,
  },
  {
    id: "major-decision",
    category: "personal",
    title: "Major Decision Analysis",
    description: "Pros/cons, risk analysis, and recommendation for any significant life or business decision.",
    icon: "Scale",
    estimatedCredits: 15,
    defaultConfig: { ...DEFAULT_CONFIG, litigantCount: 3, confidenceTarget: 80, outputPreferenceMode: "document", artifactType: "report" },
    inputFields: [
      {
        "id": "decision",
        "label": "Decision and timing",
        "placeholder": "What decision needs to be made, and by when?",
        "type": "textarea",
        "required": true
      },
      {
        "id": "options",
        "label": "Options",
        "placeholder": "What choices are available, including waiting or doing nothing?",
        "type": "textarea",
        "required": true
      },
      {
        "id": "priority",
        "label": "What matters most",
        "placeholder": "Your priorities and any non-negotiables",
        "type": "text",
        "required": false
      },
      {
        "id": "constraints",
        "label": "Constraints",
        "placeholder": "Budget, time, commitments, relationships or other limits",
        "type": "textarea",
        "required": false
      },
      {
        "id": "unknowns",
        "label": "Known facts and uncertainties",
        "placeholder": "What do you know, and what could change your decision?",
        "type": "textarea",
        "required": false
      }
    ],
    systemPrompt: `${TEMPLATE_METHOD}\n\nPurpose: Help the user make a significant decision based on their own priorities, constraints and tolerance for uncertainty.
Critical questions: Establish the decision, viable options and deadline. Ask about a priority or hard constraint if different answers would reverse the recommendation. Do not silently supply the user's values.
Examine: Benefits, costs, trade-offs, risks, second-order effects, opportunity costs, reversibility and what happens if the user delays or does nothing. Identify assumptions that drive the result and affordable ways to resolve key unknowns.
Document structure: Decision statement; confirmed constraints and priorities; side-by-side option comparison; best case and downside scenarios clearly labeled; recommendation with rationale and conditions; assumptions that would change it; reversible next steps and a decision checkpoint.
Decision discipline: Do not invent numerical weights or probabilities and present them as objective. If using a scored comparison, obtain weights or label them as illustrative and show sensitivity. A recommendation is conditional on the evidence and the user's values, not a guarantee.`,
  },
  {
    id: "research-summary",
    category: "research",
    title: "Research Summary",
    description: "Synthesize and stress-test findings from a research area, paper, or topic.",
    icon: "Search",
    estimatedCredits: 20,
    defaultConfig: { ...DEFAULT_CONFIG, litigantCount: 3, confidenceTarget: 80, outputPreferenceMode: "document", artifactType: "report" },
    inputFields: [
      {
        "id": "question",
        "label": "Research question",
        "placeholder": "What specific question should this summary answer?",
        "type": "text",
        "required": true
      },
      {
        "id": "topic",
        "label": "Sources or topic",
        "placeholder": "Paste sources/excerpts or identify papers in Case Files; distinguish a topic from actual supplied evidence",
        "type": "textarea",
        "required": true
      },
      {
        "id": "context",
        "label": "Purpose and audience",
        "placeholder": "Who will use the summary and for what decision?",
        "type": "text",
        "required": false
      },
      {
        "id": "scope",
        "label": "Scope and depth",
        "placeholder": "Date range, population, geography, level of detail or exclusions",
        "type": "text",
        "required": false
      },
      {
        "id": "concerns",
        "label": "Points to examine",
        "placeholder": "Conflicting claims, methods or particular questions",
        "type": "textarea",
        "required": false
      }
    ],
    systemPrompt: `${TEMPLATE_METHOD}\n\nPurpose: Synthesize the evidence actually consulted into a traceable answer to the user's research question.
Critical questions: Establish the question and available sources. If only a topic is provided and no research tool has supplied sources, ask for source material or explain that only a general background overview is possible. Clarify scope when it would materially alter the answer.
Examine: Main claims and supporting evidence; study/source type and quality; populations and methods; agreement and conflicts; limitations, possible bias and applicability; evidence gaps and unresolved questions.
Document structure: Question and scope; concise findings; source-by-source evidence table identifying actual consulted material; areas of agreement and disagreement; methodological limitations; practical implications within the evidence; open questions and useful next research steps; identifiable source list.
Citation discipline: Cite only consulted, identifiable sources and connect claims to them. Never invent papers, authors, quotes, dates, links or citations. Distinguish a supplied-source summary from a comprehensive literature review, correlation from causation, and absence of evidence from evidence of absence. Mark currency limitations and do not imply a complete database search unless it happened.`,
  },
  {
    id: "product-stress-test",
    category: "business",
    title: "Product Idea Stress Test",
    description: "Validate or invalidate a product idea with adversarial examination of assumptions.",
    icon: "FlaskConical",
    estimatedCredits: 20,
    defaultConfig: { ...DEFAULT_CONFIG, litigantCount: 4, confidenceTarget: 80, outputPreferenceMode: "document", artifactType: "report" },
    inputFields: [
      {
        "id": "idea",
        "label": "Product idea",
        "placeholder": "What is the product and how would it work?",
        "type": "textarea",
        "required": true
      },
      {
        "id": "problem",
        "label": "Customer and problem",
        "placeholder": "Who has this problem, how painful is it, and how do they deal with it now?",
        "type": "textarea",
        "required": true
      },
      {
        "id": "differentiation",
        "label": "Advantage",
        "placeholder": "Why would people switch from current alternatives?",
        "type": "text",
        "required": false
      },
      {
        "id": "economics",
        "label": "Price, cost and distribution",
        "placeholder": "Proposed pricing, delivery costs, acquisition path and available resources",
        "type": "textarea",
        "required": false
      },
      {
        "id": "evidence",
        "label": "Evidence so far",
        "placeholder": "Customer conversations, purchases, prototypes or experiments",
        "type": "textarea",
        "required": false
      }
    ],
    systemPrompt: `${TEMPLATE_METHOD}\n\nPurpose: Stress-test the product's core assumptions and design a practical validation plan before the user commits more time or money.
Critical questions: Establish the product, intended customer and problem. Ask about current alternatives or evidence when essential to assess a claimed advantage; treat no evidence as an explicit uncertainty, not automatic failure.
Examine: Severity/frequency of the problem; willingness to pay and switch; competing alternatives and differentiation; technical and operational feasibility; distribution; pricing and unit economics; adoption friction; dependencies and fatal assumptions.
Document structure: Strongest case for and against; evidence versus assumptions; ranked risks and decision-critical assumptions; inexpensive validation experiments naming the target participant, method, measure, time/cost limit and proposed pass/fail threshold; proceed, revise or stop recommendation with conditions; next actions.
Validation discipline: Distinguish proposed experiment thresholds from observed results. Never invent market size, customer demand, success probability or validation. Explain which evidence would reverse the recommendation and avoid treating enthusiasm as proof of willingness to pay.`,
  },
];

export function getTemplateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: Template["category"]): Template[] {
  return TEMPLATES.filter((t) => t.category === category);
}

export const TEMPLATE_CATEGORIES = [
  { id: "business", label: "Business" },
  { id: "technical", label: "Technical" },
  { id: "personal", label: "Personal" },
  { id: "research", label: "Research" },
  { id: "writing", label: "Writing" },
] as const;

// Normalize persisted overrides against the same complete catalog used by the UI.
export function normalizeTemplate(value: unknown, id?: string): Template | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<Template> & { defaultSettings?: Partial<CourtConfig> };
  const key = id ?? v.id;
  const base = TEMPLATES.find(t => t.id === key);
  if (!key || !v.title && !base) return null;
  // Old stock prompts were sometimes saved by the admin editor. Upgrade only
  // exact stock copies; actual owner-written instructions remain authoritative.
  const isLegacyStock = !!base && v.systemPrompt === LEGACY_TEMPLATE_PROMPTS[key!];
  const overrides = { ...v.defaultSettings, ...v.defaultConfig };
  if (isLegacyStock && (!overrides.artifactType || overrides.artifactType === "auto") && (!overrides.outputPreferenceMode || overrides.outputPreferenceMode === "auto")) {
    delete overrides.artifactType;
    delete overrides.outputPreferenceMode;
  }
  const config = CourtConfigSchema.safeParse({ ...DEFAULT_CONFIG, ...base?.defaultConfig, ...overrides });
  if (!config.success) return null;
  return {
    ...base, ...v, id: key, title: v.title ?? base?.title ?? key,
    description: v.description ?? base?.description ?? "",
    category: v.category ?? base?.category ?? "personal", icon: v.icon ?? base?.icon ?? "FileText",
    inputFields: Array.isArray(v.inputFields) && JSON.stringify(v.inputFields) !== JSON.stringify(LEGACY_TEMPLATE_FIELDS[key]) ? v.inputFields : base?.inputFields ?? [],
    defaultConfig: config.data, estimatedCredits: v.estimatedCredits ?? base?.estimatedCredits ?? 0,
    systemPrompt: isLegacyStock || !v.systemPrompt?.trim() ? base?.systemPrompt ?? "" : v.systemPrompt,
  };
}

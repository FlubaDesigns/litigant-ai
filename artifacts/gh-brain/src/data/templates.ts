export interface TemplateInputField {
  id: string;
  label: string;
  placeholder: string;
  type: "text" | "textarea" | "url";
  required: boolean;
}

import type { SeatMapConfig } from "./seatTypes";

export type ProviderName = "openai" | "anthropic" | "grok" | "gemini";

export type ArtifactType =
  | "auto"
  | "report"
  | "memo"
  | "business-plan"
  | "risk-matrix"
  | "contract-review"
  | "technical-spec"
  | "pitch-deck"
  | "legal-brief"
  | "code"
  | "landing-page"
  | "blog-post";

export interface CourtConfig {
  // ── V29 Mission Briefing (user-facing) ──────────────────────────────────
  conscience: boolean;
  outputScope: "consensus" | "all-voices";
  debateMode: "adversarial" | "collaborative";
  aiReasoning: "independent" | "chain";
  outputStrategy:
    | "moderator-consensus"
    | "individual"
    | "consensus+individual"
    | "transcript"
    | "artifact";
  outputPreference: "chat" | "download" | "both";
  format: "text" | "markdown" | "json" | "docx" | "pdf";
  artifactType: ArtifactType;
  confidenceTarget: number;  // 80 | 90 | 95 | 99
  maxIterations: number;     // 1 | 3 | 5 | 10
  maxCredits: number;
  litigantCount: number;
  // ── Per-seat AI assignment (V29 node inspector) ───────────────────────────
  seatMap?: SeatMapConfig;
  // ── Internal / API compat ────────────────────────────────────────────────
  courtMode: "adversarial" | "socratic" | "analysis" | "critique";
  responseMode: "balanced" | "thorough" | "concise";
  outputFormat: "report" | "memo" | "bullets" | "verdict";
  provider?: ProviderName;
  model?: string;
}

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

export const DEFAULT_CONFIG: CourtConfig = {
  // V29 Mission Briefing
  conscience: true,
  outputScope: "consensus",
  debateMode: "adversarial",
  aiReasoning: "independent",
  outputStrategy: "moderator-consensus",
  outputPreference: "both",
  format: "text",
  artifactType: "auto",
  confidenceTarget: 90,
  maxIterations: 5,
  maxCredits: 500,
  litigantCount: 4,
  // Internal
  courtMode: "adversarial",
  responseMode: "balanced",
  outputFormat: "report",
};

export const TEMPLATES: Template[] = [
  {
    id: "business-plan",
    category: "business",
    title: "Business Plan Builder",
    description: "Stress-test your business concept across viability, market fit, financials, and competition.",
    icon: "Briefcase",
    estimatedCredits: 25,
    defaultConfig: { ...DEFAULT_CONFIG, litigantCount: 4, confidenceTarget: 85 },
    inputFields: [
      { id: "concept", label: "Business concept", placeholder: "Describe your product or service idea", type: "textarea", required: true },
      { id: "market", label: "Target market", placeholder: "Who are your customers?", type: "text", required: true },
      { id: "revenue", label: "Revenue model", placeholder: "How will you make money?", type: "text", required: true },
      { id: "competition", label: "Known competitors", placeholder: "Who do you compete with?", type: "text", required: false },
    ],
    systemPrompt: "You are evaluating a business concept for viability, market fit, financial sustainability, and competitive advantage.",
  },
  {
    id: "website-audit",
    category: "technical",
    title: "Website Audit",
    description: "UX, content, conversion, and technical review of any website.",
    icon: "Globe",
    estimatedCredits: 15,
    defaultConfig: { ...DEFAULT_CONFIG, courtMode: "critique", litigantCount: 3 },
    inputFields: [
      { id: "url", label: "Website URL", placeholder: "https://example.com", type: "url", required: true },
      { id: "goal", label: "Business goal", placeholder: "What should the site accomplish?", type: "text", required: true },
      { id: "audience", label: "Target audience", placeholder: "Who visits this site?", type: "text", required: false },
      { id: "concerns", label: "Known concerns", placeholder: "Any specific issues to investigate?", type: "textarea", required: false },
    ],
    systemPrompt: "You are auditing a website for UX quality, content effectiveness, technical performance, and conversion optimization.",
  },
  {
    id: "marketing-strategy",
    category: "business",
    title: "Marketing Strategy",
    description: "Evaluate a marketing approach across channels, messaging, audience, and ROI potential.",
    icon: "TrendingUp",
    estimatedCredits: 20,
    defaultConfig: { ...DEFAULT_CONFIG, litigantCount: 3, confidenceTarget: 80 },
    inputFields: [
      { id: "product", label: "Product or service", placeholder: "What are you marketing?", type: "text", required: true },
      { id: "strategy", label: "Marketing strategy", placeholder: "Describe your current or planned approach", type: "textarea", required: true },
      { id: "budget", label: "Budget range", placeholder: "e.g. $5k/month", type: "text", required: false },
      { id: "goal", label: "Primary goal", placeholder: "Awareness, leads, sales?", type: "text", required: true },
    ],
    systemPrompt: "You are evaluating a marketing strategy for effectiveness, channel fit, audience alignment, and ROI potential.",
  },
  {
    id: "code-audit",
    category: "technical",
    title: "Code Audit",
    description: "Security, performance, maintainability, and architecture review of code or a system design.",
    icon: "Code2",
    estimatedCredits: 20,
    defaultConfig: { ...DEFAULT_CONFIG, courtMode: "critique", litigantCount: 3 },
    inputFields: [
      { id: "code", label: "Code or system description", placeholder: "Paste code snippet or describe your architecture", type: "textarea", required: true },
      { id: "language", label: "Language / framework", placeholder: "e.g. TypeScript, React, Node.js", type: "text", required: false },
      { id: "concerns", label: "Specific concerns", placeholder: "Security? Performance? Scalability?", type: "text", required: false },
    ],
    systemPrompt: "You are conducting a technical audit for security vulnerabilities, performance issues, maintainability concerns, and architectural improvements.",
  },
  {
    id: "contract-review",
    category: "personal",
    title: "Contract Review Prep",
    description: "Identify risks, unfavorable clauses, and negotiation points in a contract.",
    icon: "FileText",
    estimatedCredits: 20,
    defaultConfig: { ...DEFAULT_CONFIG, courtMode: "critique", litigantCount: 3, confidenceTarget: 85 },
    inputFields: [
      { id: "contract", label: "Contract text or summary", placeholder: "Paste the key clauses or summarize the agreement", type: "textarea", required: true },
      { id: "role", label: "Your role", placeholder: "Are you the buyer, seller, employee, etc.?", type: "text", required: true },
      { id: "concerns", label: "Main concerns", placeholder: "What worries you most?", type: "text", required: false },
    ],
    systemPrompt: "You are reviewing a contract to identify risks, unfavorable terms, missing protections, and negotiation opportunities. Note: this is not legal advice.",
  },
  {
    id: "book-critique",
    category: "writing",
    title: "Book / Manuscript Critique",
    description: "Structured critique of writing for argument quality, clarity, structure, and impact.",
    icon: "BookOpen",
    estimatedCredits: 18,
    defaultConfig: { ...DEFAULT_CONFIG, courtMode: "critique", litigantCount: 3 },
    inputFields: [
      { id: "excerpt", label: "Excerpt or chapter summary", placeholder: "Paste text or describe the content", type: "textarea", required: true },
      { id: "genre", label: "Genre / type", placeholder: "Non-fiction, novel, academic, etc.", type: "text", required: false },
      { id: "goal", label: "Goal of the work", placeholder: "What should the reader feel or learn?", type: "text", required: false },
    ],
    systemPrompt: "You are critiquing writing for argument strength, clarity, structure, pacing, and overall impact on the intended audience.",
  },
  {
    id: "medical-prep",
    category: "personal",
    title: "Medical Appointment Prep",
    description: "Prepare informed questions and understand your situation before a medical appointment.",
    icon: "Stethoscope",
    estimatedCredits: 15,
    defaultConfig: { ...DEFAULT_CONFIG, courtMode: "analysis", litigantCount: 2, confidenceTarget: 75 },
    inputFields: [
      { id: "situation", label: "Medical situation", placeholder: "Describe your symptoms or diagnosis", type: "textarea", required: true },
      { id: "appointment", label: "Type of appointment", placeholder: "e.g. cardiology follow-up, GP visit", type: "text", required: false },
      { id: "questions", label: "Questions you already have", placeholder: "What do you want to ask?", type: "textarea", required: false },
    ],
    systemPrompt: "You are helping a patient prepare for a medical appointment by analyzing their situation, generating informed questions, and explaining relevant concepts. This is not medical advice.",
  },
  {
    id: "major-decision",
    category: "personal",
    title: "Major Decision Analysis",
    description: "Pros/cons, risk analysis, and recommendation for any significant life or business decision.",
    icon: "Scale",
    estimatedCredits: 15,
    defaultConfig: { ...DEFAULT_CONFIG, litigantCount: 3, confidenceTarget: 80 },
    inputFields: [
      { id: "decision", label: "The decision", placeholder: "What are you deciding between?", type: "textarea", required: true },
      { id: "options", label: "Options", placeholder: "Option A vs Option B (or more)", type: "textarea", required: true },
      { id: "constraints", label: "Constraints", placeholder: "Budget, time, relationships, etc.", type: "text", required: false },
      { id: "priority", label: "What matters most?", placeholder: "Financial security? Growth? Stability?", type: "text", required: false },
    ],
    systemPrompt: "You are conducting a structured decision analysis, examining trade-offs, risks, second-order effects, and long-term implications of each option.",
  },
  {
    id: "research-summary",
    category: "research",
    title: "Research Summary",
    description: "Synthesize and stress-test findings from a research area, paper, or topic.",
    icon: "Search",
    estimatedCredits: 20,
    defaultConfig: { ...DEFAULT_CONFIG, courtMode: "analysis", litigantCount: 3, confidenceTarget: 80 },
    inputFields: [
      { id: "topic", label: "Research topic or paper", placeholder: "Paste abstract or describe the topic", type: "textarea", required: true },
      { id: "question", label: "Core question", placeholder: "What are you trying to understand?", type: "text", required: true },
      { id: "context", label: "Context", placeholder: "Academic, business, personal?", type: "text", required: false },
    ],
    systemPrompt: "You are synthesizing research on a topic, identifying consensus, contested areas, methodological concerns, and practical implications.",
  },
  {
    id: "product-stress-test",
    category: "business",
    title: "Product Idea Stress Test",
    description: "Validate or invalidate a product idea with adversarial examination of assumptions.",
    icon: "FlaskConical",
    estimatedCredits: 20,
    defaultConfig: { ...DEFAULT_CONFIG, courtMode: "adversarial", litigantCount: 4, confidenceTarget: 80 },
    inputFields: [
      { id: "idea", label: "Product idea", placeholder: "Describe your product concept in detail", type: "textarea", required: true },
      { id: "problem", label: "Problem it solves", placeholder: "What pain point does this address?", type: "text", required: true },
      { id: "customer", label: "Target customer", placeholder: "Who experiences this pain?", type: "text", required: true },
      { id: "differentiation", label: "Key differentiator", placeholder: "Why would someone choose this over existing solutions?", type: "text", required: false },
    ],
    systemPrompt: "You are stress-testing a product idea by challenging its core assumptions, market fit, competitive positioning, and viability.",
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

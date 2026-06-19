export interface ToolFAQ {
  q: string;
  a: string;
}

export interface ToolBenefit {
  title: string;
  description: string;
}

export interface ToolPage {
  slug: string;
  templateId: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  badge: string;
  headline: string;
  subheadline: string;
  ctaLabel: string;
  subject: string;
  howItWorks: { step: string; title: string; desc: string }[];
  benefits: ToolBenefit[];
  outputSummary: string;
  faqs: ToolFAQ[];
  icon: string;
  category: string;
}

export const TOOL_PAGES: ToolPage[] = [
  {
    slug: "business-plan-analyzer",
    templateId: "business-plan",
    title: "Business Plan Analyzer",
    metaTitle: "AI Business Plan Analyzer — Stress-Test Your Business Idea | Litigant AI",
    metaDescription: "Use multiple competing AI models to stress-test your business plan across viability, market fit, financials, and competition. Get a structured verdict in minutes.",
    badge: "Business Strategy",
    headline: "Stress-Test Your Business Plan Before Investors Do",
    subheadline: "Multiple AI models argue for and against your business concept — exposing weak assumptions, blind spots, and competitive risks you haven't considered yet.",
    ctaLabel: "Analyze my business plan",
    subject: "business plan",
    category: "business",
    icon: "Briefcase",
    howItWorks: [
      { step: "01", title: "Describe your concept", desc: "Enter your business idea, target market, revenue model, and any known competition. The more specific, the sharper the analysis." },
      { step: "02", title: "AI models debate it", desc: "A panel of AI litigants each take different positions — advocate, skeptic, devil's advocate — and cross-examine each other's reasoning in real time." },
      { step: "03", title: "Get a structured verdict", desc: "Receive a confidence-scored analysis covering viability, market fit, financial sustainability, and the three biggest risks to address before launch." },
    ],
    benefits: [
      { title: "Catch fatal flaws early", description: "Discover the assumptions your business depends on before you invest time, money, and reputation." },
      { title: "Pressure-test your market", description: "AI skeptics challenge your target market size, customer acquisition costs, and competitive moat with brutal honesty." },
      { title: "Financial stress-testing", description: "Revenue model, burn rate assumptions, and unit economics examined from multiple angles." },
      { title: "Investor-ready insights", description: "Know exactly what objections investors will raise — and have answers prepared." },
    ],
    outputSummary: "You receive a confidence-scored verdict covering market viability, financial sustainability, competitive positioning, and the top 3 risks — plus a full debate transcript showing how each AI model reasoned through your plan.",
    faqs: [
      { q: "Is this a replacement for a business advisor?", a: "No — it's a thinking tool, not professional advice. Use it to identify questions to bring to your advisors and investors, not to replace them." },
      { q: "How detailed does my business plan need to be?", a: "Even a rough concept works. The more detail you provide, the sharper the analysis. You can always run it again as your plan evolves." },
      { q: "Can I use it for an existing business I want to pivot?", a: "Absolutely. Many users analyze pivot decisions, new product lines, and expansion strategies — not just early-stage ideas." },
    ],
  },
  {
    slug: "website-audit",
    templateId: "website-audit",
    title: "AI Website Audit",
    metaTitle: "AI Website Audit Tool — UX, Conversion & Content Review | Litigant AI",
    metaDescription: "Get a multi-model AI audit of any website covering UX, content effectiveness, conversion optimization, and technical performance. Actionable findings in minutes.",
    badge: "Digital & UX",
    headline: "Get an Honest AI Audit of Any Website",
    subheadline: "Multiple AI reviewers critique your website's UX, messaging, conversion flow, and content — giving you the kind of candid feedback a polite agency never will.",
    ctaLabel: "Audit my website",
    subject: "website",
    category: "technical",
    icon: "Globe",
    howItWorks: [
      { step: "01", title: "Share your URL and goals", desc: "Provide the website URL, its primary business goal, and any specific concerns you want examined." },
      { step: "02", title: "AI reviewers critique it", desc: "A panel of AI specialists — UX critic, conversion analyst, content editor, technical auditor — each examine the site from their perspective." },
      { step: "03", title: "Get prioritized recommendations", desc: "Receive a confidence-scored report ranking issues by impact, with specific actionable fixes for each finding." },
    ],
    benefits: [
      { title: "UX friction analysis", description: "Identify where users get confused, frustrated, or lost — before you lose real traffic to it." },
      { title: "Conversion gap detection", description: "AI reviewers identify missing trust signals, weak CTAs, and conversion killers on every page." },
      { title: "Content effectiveness", description: "Is your messaging clear, credible, and compelling to your target audience? Find out fast." },
      { title: "Competitive comparison", description: "Benchmark your site's approach against what high-performing competitors typically do right." },
    ],
    outputSummary: "A prioritized finding report organized by impact — covering UX, content, conversion, and technical issues — with specific recommended fixes and a confidence score for each major conclusion.",
    faqs: [
      { q: "Does Litigant AI actually browse my website?", a: "The AI analyzes the information you provide about the website, including the URL and your description of its goals and audience. For best results, describe key pages and paste critical copy." },
      { q: "Is this useful for landing pages, not just full websites?", a: "Yes — single landing pages are often the most valuable thing to audit since they have a single measurable goal. Many users specifically audit high-traffic landing pages." },
      { q: "How is this different from a Google Lighthouse audit?", a: "Lighthouse measures technical performance. Litigant AI critiques strategy, UX logic, messaging, and conversion — the human judgment layer that automated tools miss." },
    ],
  },
  {
    slug: "marketing-strategy",
    templateId: "marketing-strategy",
    title: "Marketing Strategy Analyzer",
    metaTitle: "AI Marketing Strategy Analyzer — Evaluate Your Marketing Plan | Litigant AI",
    metaDescription: "Multiple AI models evaluate your marketing strategy across channels, messaging, audience fit, and ROI potential. Get an adversarial critique before you spend a dollar.",
    badge: "Marketing",
    headline: "Know If Your Marketing Strategy Will Actually Work",
    subheadline: "Before you spend a dollar, run your marketing plan through a panel of AI skeptics who will challenge every assumption about your channels, messaging, and target audience.",
    ctaLabel: "Analyze my marketing strategy",
    subject: "marketing strategy",
    category: "business",
    icon: "TrendingUp",
    howItWorks: [
      { step: "01", title: "Describe your strategy", desc: "Share your product, target audience, marketing channels, budget range, and primary goal — awareness, leads, or sales." },
      { step: "02", title: "AI models stress-test it", desc: "Each AI litigant attacks a different dimension: channel fit, message clarity, audience alignment, competitive differentiation, and ROI realism." },
      { step: "03", title: "Get a channel-by-channel verdict", desc: "Receive specific findings per channel with confidence scores, plus a prioritized action plan for improving your overall strategy." },
    ],
    benefits: [
      { title: "Channel fit analysis", description: "Are you marketing on the channels your audience actually uses? AI skeptics challenge your assumptions." },
      { title: "Message clarity critique", description: "Is your value proposition sharp enough to cut through noise? Get an honest, ego-free assessment." },
      { title: "Budget reality check", description: "Does your budget match your goals? AI reviewers flag common mismatch patterns before you burn cash." },
      { title: "Competitive positioning", description: "Stress-test your differentiation claims against what competitors are already saying and doing." },
    ],
    outputSummary: "A structured marketing verdict covering channel fit, messaging effectiveness, audience alignment, and ROI realism — with specific recommendations ranked by expected impact.",
    faqs: [
      { q: "Can I use this for a campaign, not just an overall strategy?", a: "Yes — many users analyze specific campaign concepts, ad creative directions, or email sequences. Just describe the campaign and its goal." },
      { q: "Does it work for B2B and B2C?", a: "Absolutely. Specify your model in the input and the AI panel will tailor its critique accordingly." },
      { q: "What if I don't have a full strategy yet?", a: "Use it to evaluate a marketing hypothesis or early-stage direction. The AI will surface what's missing and what to figure out first." },
    ],
  },
  {
    slug: "code-review",
    templateId: "code-audit",
    title: "AI Code Review",
    metaTitle: "AI Code Review Tool — Security, Architecture & Performance Audit | Litigant AI",
    metaDescription: "Get a multi-model AI review of your code or system architecture covering security vulnerabilities, performance issues, and maintainability. Fast and brutally honest.",
    badge: "Engineering",
    headline: "Code Review That Actually Finds the Hard Problems",
    subheadline: "Multiple AI models — each playing a different specialist role — examine your code for security vulnerabilities, architectural debt, performance bottlenecks, and maintainability issues.",
    ctaLabel: "Review my code",
    subject: "code or architecture",
    category: "technical",
    icon: "Code2",
    howItWorks: [
      { step: "01", title: "Share your code or architecture", desc: "Paste a code snippet, describe your system architecture, or outline a technical decision you're evaluating." },
      { step: "02", title: "Specialist AI models examine it", desc: "A security auditor, performance analyst, architecture critic, and maintainability reviewer each attack the problem from their domain." },
      { step: "03", title: "Get prioritized findings", desc: "Receive a severity-ranked list of issues with specific fixes, plus a confidence score on the overall quality assessment." },
    ],
    benefits: [
      { title: "Security vulnerability detection", description: "Common attack vectors, injection risks, authentication flaws, and insecure defaults caught before production." },
      { title: "Architecture critique", description: "Coupling, cohesion, scalability assumptions, and single points of failure challenged by an AI skeptic." },
      { title: "Performance analysis", description: "Algorithmic complexity, N+1 query patterns, and unnecessary blocking operations identified and explained." },
      { title: "Maintainability scoring", description: "Readability, naming conventions, separation of concerns, and testability assessed against real-world standards." },
    ],
    outputSummary: "A severity-ranked technical findings report organized by domain (security, performance, architecture, maintainability) with specific line-level recommendations and an overall code health confidence score.",
    faqs: [
      { q: "What languages and frameworks does it support?", a: "Any language you can describe or paste. TypeScript, Python, Go, Java, Rust, SQL, and more — just specify the language and framework in your input." },
      { q: "Can I use it for architecture decisions, not just code?", a: "Yes — architecture reviews (microservices vs monolith, database choice, API design) are one of the most popular use cases. Describe the decision and the AI panel will pressure-test it." },
      { q: "Is my code kept private?", a: "Your input is used only for your session. We do not store or train on your code." },
    ],
  },
  {
    slug: "contract-review",
    templateId: "contract-review",
    title: "AI Contract Review Prep",
    metaTitle: "AI Contract Review Prep — Identify Risks & Negotiation Points | Litigant AI",
    metaDescription: "Use AI to identify unfavorable clauses, hidden risks, and negotiation opportunities in any contract before you sign. Not legal advice — a thinking tool for smarter decisions.",
    badge: "Legal & Contracts",
    headline: "Know What You're Signing Before You Sign It",
    subheadline: "A panel of AI reviewers examines your contract for unfavorable clauses, hidden risks, missing protections, and leverage points for negotiation — in plain language.",
    ctaLabel: "Review my contract",
    subject: "contract",
    category: "personal",
    icon: "FileText",
    howItWorks: [
      { step: "01", title: "Share the key clauses", desc: "Paste the contract text, summary, or the specific sections that concern you. Tell the AI your role — buyer, employee, vendor, etc." },
      { step: "02", title: "AI models debate the risks", desc: "Each litigant takes a different angle: risk identifier, negotiation strategist, protection gap analyst, and plain-language translator." },
      { step: "03", title: "Get a risk-ranked breakdown", desc: "Receive a clause-by-clause risk assessment in plain English, with specific negotiation points and red flags ranked by severity." },
    ],
    benefits: [
      { title: "Unfavorable clause detection", description: "Non-compete overreach, auto-renewal traps, liability caps, and one-sided termination rights identified and explained." },
      { title: "Missing protection analysis", description: "What standard protections are absent from this contract? AI reviewers flag what should be there but isn't." },
      { title: "Negotiation leverage points", description: "Which clauses are typically negotiable? Where do you have real leverage and where should you push back?" },
      { title: "Plain-language translation", description: "Legal jargon decoded into plain English so you understand exactly what you're agreeing to." },
    ],
    outputSummary: "A clause-by-clause risk report in plain English, with a severity ranking for each finding, specific negotiation scripts, and a summary of the top 3 things to address before signing.",
    faqs: [
      { q: "Is this legal advice?", a: "No. This is a thinking tool to help you ask better questions of your actual lawyer — not a replacement for legal counsel. Always consult a qualified attorney before signing significant contracts." },
      { q: "What types of contracts does it work for?", a: "Employment agreements, vendor contracts, NDAs, SaaS terms, real estate leases, partnership agreements, and more. The AI adapts its review to the contract type." },
      { q: "What if the contract is very long?", a: "Focus on the sections that concern you most, or summarize the key terms. You can run multiple sessions for different sections." },
    ],
  },
  {
    slug: "decision-analysis",
    templateId: "major-decision",
    title: "AI Decision Analysis",
    metaTitle: "AI Decision Analysis Tool — Pros, Cons & Confidence Score | Litigant AI",
    metaDescription: "Analyze any major decision with multiple AI perspectives. Get a structured pros/cons analysis, risk assessment, second-order effects, and a confidence-scored recommendation.",
    badge: "Decision Making",
    headline: "Make Big Decisions With More Confidence",
    subheadline: "Stop going in circles. Multiple AI minds examine your decision from every angle — risks, second-order effects, what you might be missing — and deliver a structured recommendation.",
    ctaLabel: "Analyze my decision",
    subject: "decision",
    category: "personal",
    icon: "Scale",
    howItWorks: [
      { step: "01", title: "Describe the decision", desc: "Lay out your options, constraints, and what matters most to you — financially, personally, professionally." },
      { step: "02", title: "AI models debate each option", desc: "Advocate and skeptic AIs argue for and against each option, while an analyst surfaces second-order effects and a synthesizer looks for hidden assumptions." },
      { step: "03", title: "Get a confidence-scored recommendation", desc: "Receive a structured decision analysis with a recommended option, confidence score, key trade-offs, and the factors most likely to change the outcome." },
    ],
    benefits: [
      { title: "Second-order thinking", description: "What happens after the thing you're worried about? AI models trace consequences two and three steps out." },
      { title: "Hidden assumption detection", description: "What are you assuming to be true that might not be? The skeptic AI is specifically tasked with finding these." },
      { title: "Reversibility analysis", description: "How hard is this decision to reverse if it goes wrong? Knowing the exit cost changes how aggressively to act." },
      { title: "Cognitive bias check", description: "Sunk cost, loss aversion, availability bias — AI reviewers flag where your framing might be distorting the picture." },
    ],
    outputSummary: "A structured decision analysis with a confidence-scored recommendation, pros and cons per option, key risks ranked by severity, second-order effects, and the top 3 factors that should most influence your choice.",
    faqs: [
      { q: "What kind of decisions is this best for?", a: "Career moves, business pivots, major purchases, relationship decisions, investment choices — any decision with real stakes and genuine uncertainty." },
      { q: "What if I have more than two options?", a: "The more options you describe, the richer the analysis. Litigant AI handles multi-option decisions well." },
      { q: "Will it tell me what to do?", a: "It will give a confidence-scored recommendation, but ultimately it respects that you know your situation better than any AI. The goal is to surface what you might be missing, not to replace your judgment." },
    ],
  },
  {
    slug: "medical-appointment-prep",
    templateId: "medical-prep",
    title: "Medical Appointment Prep",
    metaTitle: "AI Medical Appointment Prep — Questions to Ask Your Doctor | Litigant AI",
    metaDescription: "Use AI to prepare informed questions for any medical appointment. Understand your situation better and walk in knowing what to ask your doctor. Not medical advice.",
    badge: "Health",
    headline: "Walk Into Your Next Medical Appointment Fully Prepared",
    subheadline: "AI generates the questions you didn't know to ask, explains what your diagnosis means in plain English, and helps you make the most of limited time with your doctor.",
    ctaLabel: "Prepare for my appointment",
    subject: "medical appointment",
    category: "personal",
    icon: "Stethoscope",
    howItWorks: [
      { step: "01", title: "Describe your situation", desc: "Share your symptoms, diagnosis, or the type of appointment you're preparing for. Include any questions you already have." },
      { step: "02", title: "AI models analyze your situation", desc: "Medical educator, patient advocate, and diagnostic questioner AIs each examine your situation and generate questions from different angles." },
      { step: "03", title: "Get a question list and context", desc: "Receive a prioritized list of questions to ask, explanations of relevant concepts in plain English, and things to watch out for." },
    ],
    benefits: [
      { title: "Questions you didn't know to ask", description: "AI surfaces the follow-up questions experienced patients always ask — that first-timers rarely think of." },
      { title: "Plain-English explanations", description: "Medical terms, test results, and treatment options explained without jargon so you can participate in the conversation." },
      { title: "Red flag awareness", description: "What symptoms or developments should prompt you to seek urgent care? AI helps you understand the warning signs." },
      { title: "Second opinion framing", description: "If you're considering a second opinion, AI helps you articulate exactly what you want the second doctor to evaluate." },
    ],
    outputSummary: "A prioritized question list organized by topic, plain-English explanations of relevant medical concepts, and a summary of key things to communicate clearly to your doctor during the appointment.",
    faqs: [
      { q: "Is this medical advice?", a: "Absolutely not. This is a preparation tool to help you have a better conversation with your qualified healthcare provider — not a diagnostic or treatment tool." },
      { q: "What types of appointments is this useful for?", a: "GP visits, specialist consultations, follow-ups after a diagnosis, pre-surgery discussions, mental health appointments, and more." },
      { q: "Can I use it after I've received test results I don't understand?", a: "Yes — many users share test results and ask the AI to help them understand what questions to bring back to their doctor." },
    ],
  },
  {
    slug: "product-validator",
    templateId: "product-stress-test",
    title: "AI Product Idea Validator",
    metaTitle: "AI Product Idea Validator — Stress-Test Before You Build | Litigant AI",
    metaDescription: "Multiple AI models adversarially challenge your product idea's core assumptions, market fit, competitive positioning, and viability before you invest in building it.",
    badge: "Product Strategy",
    headline: "Find Out If Your Product Idea Is Worth Building",
    subheadline: "Before you write a line of code or spend a dollar on ads, run your product concept through a panel of adversarial AI models designed to expose fatal flaws.",
    ctaLabel: "Validate my product idea",
    subject: "product idea",
    category: "business",
    icon: "FlaskConical",
    howItWorks: [
      { step: "01", title: "Describe your product concept", desc: "Share the problem you're solving, who has it, your proposed solution, and why someone would choose it over alternatives." },
      { step: "02", title: "AI models try to kill it", desc: "Each AI litigant attacks a different core assumption — market size, customer willingness to pay, competitive moat, and technical feasibility." },
      { step: "03", title: "Get a build/no-build verdict", desc: "Receive a confidence-scored verdict on whether the idea is worth pursuing, with the 3 biggest risks and what to validate first." },
    ],
    benefits: [
      { title: "Assumption mapping", description: "Every product idea rests on assumptions. AI surfaces and challenges all of them — especially the ones you took for granted." },
      { title: "Competitive moat stress-test", description: "Why won't an established player copy you the moment you get traction? AI demands a credible answer." },
      { title: "Willingness to pay analysis", description: "The gap between 'I'd use this' and 'I'd pay for this' kills most startups. AI focuses specifically on this question." },
      { title: "What to validate first", description: "Not all risks are equal. AI prioritizes which assumptions need real-world testing before you build anything." },
    ],
    outputSummary: "A confidence-scored build/no-build recommendation with a ranked list of core assumptions, the 3 biggest risks, specific validation experiments to run, and what a credible path to product-market fit looks like.",
    faqs: [
      { q: "Is this for technical or non-technical founders?", a: "Both. You don't need to describe the technical architecture — focus on the problem, the customer, and the business model." },
      { q: "Can I use it for an existing product I want to pivot?", a: "Yes — pivot decisions are one of the highest-value use cases. Describe the current product and the pivot direction." },
      { q: "What if my idea is in stealth?", a: "Your session content is private and not shared. You can safely describe your idea in full detail." },
    ],
  },
  {
    slug: "manuscript-critique",
    templateId: "book-critique",
    title: "AI Writing & Manuscript Critique",
    metaTitle: "AI Writing & Manuscript Critique — Structure, Clarity & Impact | Litigant AI",
    metaDescription: "Get a multi-model AI critique of any writing — books, essays, reports, or articles — covering argument strength, structure, clarity, and audience impact.",
    badge: "Writing & Publishing",
    headline: "Get the Critique Your Writing Actually Needs",
    subheadline: "Multiple AI editors — each with a different critical lens — tear into your writing's structure, argument logic, clarity, and emotional resonance. Honest feedback, no feelings spared.",
    ctaLabel: "Critique my writing",
    subject: "writing",
    category: "writing",
    icon: "BookOpen",
    howItWorks: [
      { step: "01", title: "Share an excerpt or summary", desc: "Paste a chapter, excerpt, or detailed summary of your work. Tell the AI the genre, intended audience, and what you most want feedback on." },
      { step: "02", title: "AI editors attack it", desc: "A structural critic, argument analyst, clarity editor, and audience advocate each examine the work from their perspective." },
      { step: "03", title: "Get prioritized editorial feedback", desc: "Receive specific, actionable feedback ranked by impact — not generic encouragement, but the notes a tough developmental editor would give." },
    ],
    benefits: [
      { title: "Argument integrity", description: "Does your reasoning hold up? AI identifies logical leaps, unsupported claims, and gaps in your line of argument." },
      { title: "Structure analysis", description: "Is information introduced in the right order? Does the architecture serve the reader's understanding?" },
      { title: "Clarity and jargon audit", description: "Where are you losing your reader? AI flags passages that are unnecessarily complex or ambiguous." },
      { title: "Audience resonance", description: "Is the tone, vocabulary, and assumed knowledge calibrated correctly for your intended audience?" },
    ],
    outputSummary: "A prioritized editorial critique with specific passages called out, structural recommendations, argument integrity findings, and a confidence score on overall impact — organized by what to fix first.",
    faqs: [
      { q: "Does this work for fiction as well as non-fiction?", a: "Both. For fiction, the analysis focuses on character, pacing, and narrative logic. For non-fiction, it emphasizes argument, evidence, and clarity." },
      { q: "How much do I need to share for a useful critique?", a: "At minimum, a substantial excerpt (500+ words) or a detailed chapter-by-chapter summary. The more context about your intended audience and goal, the sharper the feedback." },
      { q: "Can I use it for academic writing?", a: "Yes — academic essays, journal submissions, and dissertations are a strong use case, particularly for argument structure and evidence evaluation." },
    ],
  },
  {
    slug: "research-summarizer",
    templateId: "research-summary",
    title: "AI Research Summarizer",
    metaTitle: "AI Research Summarizer — Synthesize & Stress-Test Findings | Litigant AI",
    metaDescription: "Use multiple AI models to synthesize research findings, identify consensus vs. contested areas, surface methodological concerns, and extract practical implications.",
    badge: "Research & Analysis",
    headline: "Understand Complex Research Faster and More Critically",
    subheadline: "Multiple AI analysts synthesize findings across a research area, separate consensus from contested territory, and flag the methodological concerns that change how you should interpret the evidence.",
    ctaLabel: "Analyze my research",
    subject: "research topic",
    category: "research",
    icon: "Search",
    howItWorks: [
      { step: "01", title: "Describe the research topic", desc: "Share a paper abstract, research question, or a summary of the evidence you're trying to understand. Add context about what decision you're trying to make." },
      { step: "02", title: "AI specialists examine it", desc: "A methodology critic, consensus mapper, practical implications analyst, and devil's advocate each approach the research from their perspective." },
      { step: "03", title: "Get a structured synthesis", desc: "Receive a synthesis that separates what the evidence strongly supports from what's still contested, plus practical takeaways calibrated to your context." },
    ],
    benefits: [
      { title: "Consensus vs. controversy mapping", description: "What does the evidence clearly show? Where do researchers genuinely disagree? AI draws the line clearly." },
      { title: "Methodological critique", description: "Sample sizes, study design, replication status, and publication bias — AI flags what changes how much you should trust a finding." },
      { title: "Practical implications", description: "What does this research actually mean for what you should do? AI translates academic findings into actionable insights." },
      { title: "Counterevidence surfacing", description: "What would falsify this finding? AI specifically looks for evidence that cuts the other way." },
    ],
    outputSummary: "A structured research synthesis with a consensus map, methodology quality assessment, practical implications, confidence scores per major finding, and a summary of the most important caveats.",
    faqs: [
      { q: "Does this work for business research as well as academic research?", a: "Yes — market research reports, industry analyses, and competitive intelligence are just as valid as academic papers." },
      { q: "Can I use it when I have conflicting sources?", a: "That's actually the ideal use case. Paste or summarize the conflicting evidence and the AI will analyze why they conflict and which is more reliable." },
      { q: "Is this useful for non-experts trying to understand research?", a: "Yes — translating expert research into plain-language implications for non-experts is one of the most popular uses." },
    ],
  },
];

export function getToolBySlug(slug: string): ToolPage | undefined {
  return TOOL_PAGES.find((t) => t.slug === slug);
}

export const TOOL_CATEGORIES = [
  { id: "business", label: "Business Strategy" },
  { id: "technical", label: "Technical" },
  { id: "personal", label: "Personal" },
  { id: "writing", label: "Writing" },
  { id: "research", label: "Research" },
];

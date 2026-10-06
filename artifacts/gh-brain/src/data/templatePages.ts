import { TEMPLATE_CATEGORIES, type Template } from "./templates";

export interface TemplateFAQ {
  q: string;
  a: string;
}

export interface TemplateBenefit {
  title: string;
  description: string;
}

export interface TemplateSampleOutput {
  question: string;
  verdict: string;
  caveats: string;
  debateSnippet: string;
  debateRole: string;
}

export interface TemplatePageContent {
  slug: string;
  templateId: string;
  headline: string;
  howItWorks: { step: string; title: string; desc: string }[];
  benefits: TemplateBenefit[];
  outputSummary: string;
  sampleOutput: TemplateSampleOutput;
  faqs: TemplateFAQ[];
  image: string;
}

export const TEMPLATE_PAGE_CONTENT: TemplatePageContent[] = [
  {
    "slug": "business-plan-analyzer",
    "templateId": "business-plan",
    "image": "/tools/business-plan-analyzer.jpg",
    "headline": "Draft and Challenge Your Business Plan",
    "howItWorks": [
      {
        "step": "01",
        "title": "Bring the relevant material",
        "desc": "Describe your concept, customers, revenue model, costs and known competitors."
      },
      {
        "step": "02",
        "title": "Review competing AI perspectives",
        "desc": "The configured AI court uses the template instructions to examine your question and challenge assumptions. These are AI roles, not human specialists."
      },
      {
        "step": "03",
        "title": "Review the draft and verify it",
        "desc": "A business-plan draft with assumptions, financial scenarios, risks and next steps. Depth and completeness depend on your evidence, court settings and credit cap."
      }
    ],
    "benefits": [
      {
        "title": "Plan structure",
        "description": "Organize your idea into an executive summary, market approach and operating plan."
      },
      {
        "title": "Financial assumptions",
        "description": "Explore scenarios using supplied figures and explicitly stated assumptions."
      },
      {
        "title": "Next steps",
        "description": "Identify risks and proposed 30/60/90-day actions."
      }
    ],
    "outputSummary": "A business-plan draft with assumptions, financial scenarios, risks and next steps.",
    "sampleOutput": {
      "question": "I want to start a subscription service but have no customer interviews or cost estimates yet.",
      "verdict": "Start with a draft plan and an assumptions list. Demand, acquisition cost and delivery cost are unknown; interview potential customers and estimate unit costs before projecting profitability.",
      "caveats": "This does not validate market demand or verify financial projections. Missing figures must remain assumptions or questions.",
      "debateSnippet": "Which conclusions follow from the supplied material, and which still require evidence?",
      "debateRole": "Skeptic"
    },
    "faqs": [
      {
        "q": "What does this template cover?",
        "a": "A business-plan draft with assumptions, financial scenarios, risks and next steps."
      },
      {
        "q": "What are its limits?",
        "a": "This does not validate market demand or verify financial projections. Missing figures must remain assumptions or questions."
      },
      {
        "q": "Is my input stored?",
        "a": "Session content is saved to your account and processed by the AI providers used for your session. Share only material you are authorized to submit. Public sharing is a separate action you control."
      }
    ]
  },
  {
    "slug": "website-audit",
    "templateId": "website-audit",
    "image": "/tools/website-audit.jpg",
    "headline": "Review Your Website Content and Conversion Approach",
    "howItWorks": [
      {
        "step": "01",
        "title": "Bring the relevant material",
        "desc": "Provide your URL, goals and page text. Use the Case File URL import to attach extracted text; entering a URL alone does not fetch it."
      },
      {
        "step": "02",
        "title": "Review competing AI perspectives",
        "desc": "The configured AI court uses the template instructions to examine your question and challenge assumptions. These are AI roles, not human specialists."
      },
      {
        "step": "03",
        "title": "Review the draft and verify it",
        "desc": "A review of supplied website text, messaging and conversion assumptions, with proposed improvements. Depth and completeness depend on your evidence, court settings and credit cap."
      }
    ],
    "benefits": [
      {
        "title": "Message clarity",
        "description": "Examine whether the supplied copy explains the audience, offer and next action."
      },
      {
        "title": "Conversion questions",
        "description": "Identify possible friction in the journey you describe."
      },
      {
        "title": "Proposed changes",
        "description": "Get copy suggestions and a checklist for checks that still need a browser or testing tools."
      }
    ],
    "outputSummary": "A review of supplied website text, messaging and conversion assumptions, with proposed improvements.",
    "sampleOutput": {
      "question": "My homepage says “Better solutions for everyone” and links to a contact form. The goal is demo bookings.",
      "verdict": "The supplied headline does not name a customer or outcome. Try a more specific offer and a clear demo action. The form, mobile layout and loading performance have not been inspected.",
      "caveats": "The URL import reads one page of HTML text. It does not render JavaScript, crawl a site, inspect screenshots, measure speed, test interactions or certify accessibility.",
      "debateSnippet": "Which conclusions follow from the supplied material, and which still require evidence?",
      "debateRole": "Skeptic"
    },
    "faqs": [
      {
        "q": "What does this template cover?",
        "a": "A review of supplied website text, messaging and conversion assumptions, with proposed improvements."
      },
      {
        "q": "What are its limits?",
        "a": "The URL import reads one page of HTML text. It does not render JavaScript, crawl a site, inspect screenshots, measure speed, test interactions or certify accessibility."
      },
      {
        "q": "Is my input stored?",
        "a": "Session content is saved to your account and processed by the AI providers used for your session. Share only material you are authorized to submit. Public sharing is a separate action you control."
      }
    ]
  },
  {
    "slug": "marketing-strategy",
    "templateId": "marketing-strategy",
    "image": "/tools/marketing-strategy.jpg",
    "headline": "Challenge Your Marketing Plan Before You Spend",
    "howItWorks": [
      {
        "step": "01",
        "title": "Bring the relevant material",
        "desc": "Describe your product, audience, planned channels, budget and goals. Include results you already have."
      },
      {
        "step": "02",
        "title": "Review competing AI perspectives",
        "desc": "The configured AI court uses the template instructions to examine your question and challenge assumptions. These are AI roles, not human specialists."
      },
      {
        "step": "03",
        "title": "Review the draft and verify it",
        "desc": "A strategy critique covering positioning, channel choices, budget assumptions and proposed experiments. Depth and completeness depend on your evidence, court settings and credit cap."
      }
    ],
    "benefits": [
      {
        "title": "Positioning",
        "description": "Review how your message relates to the audience you describe."
      },
      {
        "title": "Channel trade-offs",
        "description": "Compare proposed channels using your goals and supplied evidence."
      },
      {
        "title": "Experiment plan",
        "description": "Define practical tests and measures before committing more budget."
      }
    ],
    "outputSummary": "A strategy critique covering positioning, channel choices, budget assumptions and proposed experiments.",
    "sampleOutput": {
      "question": "We plan to spend our entire launch budget on paid search but have no conversion data.",
      "verdict": "Treat paid-search performance as unproven. Propose a limited test, define what a qualified lead means and measure conversion before committing the full budget.",
      "caveats": "This does not predict ROI, run campaigns or verify channel benchmarks. Outcomes depend on execution and real customer response.",
      "debateSnippet": "Which conclusions follow from the supplied material, and which still require evidence?",
      "debateRole": "Skeptic"
    },
    "faqs": [
      {
        "q": "What does this template cover?",
        "a": "A strategy critique covering positioning, channel choices, budget assumptions and proposed experiments."
      },
      {
        "q": "What are its limits?",
        "a": "This does not predict ROI, run campaigns or verify channel benchmarks. Outcomes depend on execution and real customer response."
      },
      {
        "q": "Is my input stored?",
        "a": "Session content is saved to your account and processed by the AI providers used for your session. Share only material you are authorized to submit. Public sharing is a separate action you control."
      }
    ]
  },
  {
    "slug": "code-review",
    "templateId": "code-audit",
    "image": "/tools/code-review.jpg",
    "headline": "Review the Code and Architecture You Supply",
    "howItWorks": [
      {
        "step": "01",
        "title": "Bring the relevant material",
        "desc": "Paste relevant code or a system description, name the language and explain your concerns."
      },
      {
        "step": "02",
        "title": "Review competing AI perspectives",
        "desc": "The configured AI court uses the template instructions to examine your question and challenge assumptions. These are AI roles, not human specialists."
      },
      {
        "step": "03",
        "title": "Review the draft and verify it",
        "desc": "An AI review of supplied code or design, with potential issues, suggested fixes and proposed tests. Depth and completeness depend on your evidence, court settings and credit cap."
      }
    ],
    "benefits": [
      {
        "title": "Potential issues",
        "description": "Examine supplied code for security, correctness and performance concerns."
      },
      {
        "title": "Suggested changes",
        "description": "Get explanations and possible fixes tied to the available code."
      },
      {
        "title": "Verification steps",
        "description": "Identify tests and manual checks needed to confirm a finding."
      }
    ],
    "outputSummary": "An AI review of supplied code or design, with potential issues, suggested fixes and proposed tests.",
    "sampleOutput": {
      "question": "The handler builds a SQL query by concatenating an untrusted name field. Review this design.",
      "verdict": "Untrusted input concatenated into SQL may permit injection. Use parameter binding and test the actual handler with the relevant database driver. This design review has not executed the code.",
      "caveats": "It does not clone repositories, execute code, run tests or perform a security scan. Findings may be incomplete or incorrect; line-specific findings require the relevant code.",
      "debateSnippet": "Which conclusions follow from the supplied material, and which still require evidence?",
      "debateRole": "Skeptic"
    },
    "faqs": [
      {
        "q": "What does this template cover?",
        "a": "An AI review of supplied code or design, with potential issues, suggested fixes and proposed tests."
      },
      {
        "q": "What are its limits?",
        "a": "It does not clone repositories, execute code, run tests or perform a security scan. Findings may be incomplete or incorrect; line-specific findings require the relevant code."
      },
      {
        "q": "Is my input stored?",
        "a": "Session content is saved to your account and processed by the AI providers used for your session. Share only material you are authorized to submit. Public sharing is a separate action you control."
      }
    ]
  },
  {
    "slug": "contract-review",
    "templateId": "contract-review",
    "image": "/tools/contract-review.jpg",
    "headline": "Prepare Questions About the Contract You Share",
    "howItWorks": [
      {
        "step": "01",
        "title": "Bring the relevant material",
        "desc": "Provide relevant clauses or a summary, your role, jurisdiction if known and your concerns."
      },
      {
        "step": "02",
        "title": "Review competing AI perspectives",
        "desc": "The configured AI court uses the template instructions to examine your question and challenge assumptions. These are AI roles, not human specialists."
      },
      {
        "step": "03",
        "title": "Review the draft and verify it",
        "desc": "A plain-language review of supplied terms, possible risks, negotiation points and questions for a legal adviser. Depth and completeness depend on your evidence, court settings and credit cap."
      }
    ],
    "benefits": [
      {
        "title": "Obligations",
        "description": "Organize the responsibilities and deadlines described in the supplied terms."
      },
      {
        "title": "Potential concerns",
        "description": "Highlight ambiguities and terms you may want to discuss."
      },
      {
        "title": "Adviser questions",
        "description": "Prepare focused questions and possible negotiation points."
      }
    ],
    "outputSummary": "A plain-language review of supplied terms, possible risks, negotiation points and questions for a legal adviser.",
    "sampleOutput": {
      "question": "The agreement renews automatically unless I give notice, but my summary does not include the notice period.",
      "verdict": "Obtain the renewal and termination clauses before deciding when to act. Ask how notice must be delivered, what deadline applies and what costs follow renewal.",
      "caveats": "This is AI reading assistance, not legal advice or a determination of enforceability. A summary cannot support a review of unseen clauses.",
      "debateSnippet": "Which conclusions follow from the supplied material, and which still require evidence?",
      "debateRole": "Skeptic"
    },
    "faqs": [
      {
        "q": "What does this template cover?",
        "a": "A plain-language review of supplied terms, possible risks, negotiation points and questions for a legal adviser."
      },
      {
        "q": "What are its limits?",
        "a": "This is AI reading assistance, not legal advice or a determination of enforceability. A summary cannot support a review of unseen clauses."
      },
      {
        "q": "Is my input stored?",
        "a": "Session content is saved to your account and processed by the AI providers used for your session. Share only material you are authorized to submit. Public sharing is a separate action you control."
      }
    ]
  },
  {
    "slug": "decision-analysis",
    "templateId": "major-decision",
    "image": "/tools/decision-analysis.jpg",
    "headline": "Compare Your Options Against What Matters to You",
    "howItWorks": [
      {
        "step": "01",
        "title": "Bring the relevant material",
        "desc": "Describe the decision, realistic options, constraints and personal priorities."
      },
      {
        "step": "02",
        "title": "Review competing AI perspectives",
        "desc": "The configured AI court uses the template instructions to examine your question and challenge assumptions. These are AI roles, not human specialists."
      },
      {
        "step": "03",
        "title": "Review the draft and verify it",
        "desc": "A comparison of trade-offs, risks and scenarios, with a conditional recommendation. Depth and completeness depend on your evidence, court settings and credit cap."
      }
    ],
    "benefits": [
      {
        "title": "Priority comparison",
        "description": "Compare options using the criteria you provide."
      },
      {
        "title": "Risk scenarios",
        "description": "Explore plausible consequences and what could change the decision."
      },
      {
        "title": "Conditional next step",
        "description": "Identify missing information and a recommendation tied to stated assumptions."
      }
    ],
    "outputSummary": "A comparison of trade-offs, risks and scenarios, with a conditional recommendation.",
    "sampleOutput": {
      "question": "One job pays more; the other offers flexible hours. Flexibility is my highest priority.",
      "verdict": "The flexible role appears better aligned with your stated priority if its pay meets your needs. Confirm the actual working arrangements and your minimum budget before choosing.",
      "caveats": "This does not predict outcomes or decide your priorities for you. Any recommendation depends on your facts and assumptions.",
      "debateSnippet": "Which conclusions follow from the supplied material, and which still require evidence?",
      "debateRole": "Skeptic"
    },
    "faqs": [
      {
        "q": "What does this template cover?",
        "a": "A comparison of trade-offs, risks and scenarios, with a conditional recommendation."
      },
      {
        "q": "What are its limits?",
        "a": "This does not predict outcomes or decide your priorities for you. Any recommendation depends on your facts and assumptions."
      },
      {
        "q": "Is my input stored?",
        "a": "Session content is saved to your account and processed by the AI providers used for your session. Share only material you are authorized to submit. Public sharing is a separate action you control."
      }
    ]
  },
  {
    "slug": "medical-appointment-prep",
    "templateId": "medical-prep",
    "image": "/tools/medical-appointment-prep.jpg",
    "headline": "Organize Your Notes for a Medical Appointment",
    "howItWorks": [
      {
        "step": "01",
        "title": "Bring the relevant material",
        "desc": "Describe your situation, appointment type, symptoms or existing diagnosis and questions you already have."
      },
      {
        "step": "02",
        "title": "Review competing AI perspectives",
        "desc": "The configured AI court uses the template instructions to examine your question and challenge assumptions. These are AI roles, not human specialists."
      },
      {
        "step": "03",
        "title": "Review the draft and verify it",
        "desc": "An appointment brief, a timeline based on your notes and questions to discuss with your clinician. Depth and completeness depend on your evidence, court settings and credit cap."
      }
    ],
    "benefits": [
      {
        "title": "Appointment brief",
        "description": "Organize your concerns and relevant history in your own terms."
      },
      {
        "title": "Missing details",
        "description": "Identify dates, medication details or observations you may want to bring."
      },
      {
        "title": "Discussion questions",
        "description": "Prepare questions about your concerns and the next steps your clinician recommends."
      }
    ],
    "outputSummary": "An appointment brief, a timeline based on your notes and questions to discuss with your clinician.",
    "sampleOutput": {
      "question": "I have a follow-up appointment and want help organizing the symptoms I recorded this month.",
      "verdict": "Bring your dated symptom notes, medication list and main concerns. Ask your clinician what the pattern may mean, what information is missing and what follow-up they recommend.",
      "caveats": "This does not diagnose conditions, recommend treatment or establish what care you need. The brief depends on the information you supply.",
      "debateSnippet": "Which conclusions follow from the supplied material, and which still require evidence?",
      "debateRole": "Skeptic"
    },
    "faqs": [
      {
        "q": "What does this template cover?",
        "a": "An appointment brief, a timeline based on your notes and questions to discuss with your clinician."
      },
      {
        "q": "What are its limits?",
        "a": "This does not diagnose conditions, recommend treatment or establish what care you need. The brief depends on the information you supply."
      },
      {
        "q": "Is my input stored?",
        "a": "Session content is saved to your account and processed by the AI providers used for your session. Share only material you are authorized to submit. Public sharing is a separate action you control."
      }
    ]
  },
  {
    "slug": "product-validator",
    "templateId": "product-stress-test",
    "image": "/tools/product-validator.jpg",
    "headline": "Challenge Your Product Assumptions",
    "howItWorks": [
      {
        "step": "01",
        "title": "Bring the relevant material",
        "desc": "Describe the product, customer problem, target users, alternatives and evidence you have collected."
      },
      {
        "step": "02",
        "title": "Review competing AI perspectives",
        "desc": "The configured AI court uses the template instructions to examine your question and challenge assumptions. These are AI roles, not human specialists."
      },
      {
        "step": "03",
        "title": "Review the draft and verify it",
        "desc": "A product-risk assessment and a proposed plan to test key assumptions. Depth and completeness depend on your evidence, court settings and credit cap."
      }
    ],
    "benefits": [
      {
        "title": "Customer assumptions",
        "description": "Question whether the described problem and audience are specific enough."
      },
      {
        "title": "Alternative choices",
        "description": "Examine the differentiation you claim against supplied alternatives."
      },
      {
        "title": "Validation experiments",
        "description": "Propose interviews or tests and conditions for proceeding or revising."
      }
    ],
    "outputSummary": "A product-risk assessment and a proposed plan to test key assumptions.",
    "sampleOutput": {
      "question": "People say my app idea sounds useful, but nobody has tried it or agreed to pay.",
      "verdict": "Positive reactions do not yet establish demand. Test a concrete workflow with intended users and ask for a meaningful commitment before interpreting interest as willingness to pay.",
      "caveats": "This does not validate demand, interview customers or prove willingness to pay. Validation requires evidence from real users.",
      "debateSnippet": "Which conclusions follow from the supplied material, and which still require evidence?",
      "debateRole": "Skeptic"
    },
    "faqs": [
      {
        "q": "What does this template cover?",
        "a": "A product-risk assessment and a proposed plan to test key assumptions."
      },
      {
        "q": "What are its limits?",
        "a": "This does not validate demand, interview customers or prove willingness to pay. Validation requires evidence from real users."
      },
      {
        "q": "Is my input stored?",
        "a": "Session content is saved to your account and processed by the AI providers used for your session. Share only material you are authorized to submit. Public sharing is a separate action you control."
      }
    ]
  },
  {
    "slug": "manuscript-critique",
    "templateId": "book-critique",
    "image": "/tools/manuscript-critique.jpg",
    "headline": "Get a Structured Critique of Your Writing",
    "howItWorks": [
      {
        "step": "01",
        "title": "Bring the relevant material",
        "desc": "Share an excerpt or chapter summary, the genre and what you want the reader to understand or feel."
      },
      {
        "step": "02",
        "title": "Review competing AI perspectives",
        "desc": "The configured AI court uses the template instructions to examine your question and challenge assumptions. These are AI roles, not human specialists."
      },
      {
        "step": "03",
        "title": "Review the draft and verify it",
        "desc": "A critique of the supplied writing, with revision priorities and possible edits. Depth and completeness depend on your evidence, court settings and credit cap."
      }
    ],
    "benefits": [
      {
        "title": "Clarity and structure",
        "description": "Examine how the supplied passage develops its argument or story."
      },
      {
        "title": "Reader impact",
        "description": "Consider the intended audience and your stated writing goal."
      },
      {
        "title": "Revision priorities",
        "description": "Get suggestions and limited examples of possible rewrites."
      }
    ],
    "outputSummary": "A critique of the supplied writing, with revision priorities and possible edits.",
    "sampleOutput": {
      "question": "My introduction makes three claims but provides no examples until the final paragraph.",
      "verdict": "Consider introducing a concrete example alongside the first claim, then connect later claims to it. Check the effect on your intended voice and pacing before applying the change across the manuscript.",
      "caveats": "The review covers only what you provide. It does not assess an unseen manuscript, guarantee publication or replace an editor.",
      "debateSnippet": "Which conclusions follow from the supplied material, and which still require evidence?",
      "debateRole": "Skeptic"
    },
    "faqs": [
      {
        "q": "What does this template cover?",
        "a": "A critique of the supplied writing, with revision priorities and possible edits."
      },
      {
        "q": "What are its limits?",
        "a": "The review covers only what you provide. It does not assess an unseen manuscript, guarantee publication or replace an editor."
      },
      {
        "q": "Is my input stored?",
        "a": "Session content is saved to your account and processed by the AI providers used for your session. Share only material you are authorized to submit. Public sharing is a separate action you control."
      }
    ]
  },
  {
    "slug": "competitive-intelligence",
    "templateId": "competitive-intel",
    "image": "/tools/competitive-intelligence.jpg",
    "headline": "Compare Competitors Using the Evidence You Have",
    "howItWorks": [
      {
        "step": "01",
        "title": "Bring the relevant material",
        "desc": "Provide your offer, known competitors, source material and the decision this comparison should support."
      },
      {
        "step": "02",
        "title": "Review competing AI perspectives",
        "desc": "The configured AI court uses the template instructions to examine your question and challenge assumptions. These are AI roles, not human specialists."
      },
      {
        "step": "03",
        "title": "Review the draft and verify it",
        "desc": "A competitor comparison with evidence gaps, positioning risks and suggested next moves. Depth and completeness depend on your evidence, court settings and credit cap."
      }
    ],
    "benefits": [
      {
        "title": "Comparison",
        "description": "Organize supplied similarities and differences."
      },
      {
        "title": "Positioning risks",
        "description": "Challenge advantages that rely on unsupported assumptions."
      },
      {
        "title": "Next moves",
        "description": "Identify evidence to collect and actions to consider."
      }
    ],
    "outputSummary": "A competitor comparison with evidence gaps, positioning risks and suggested next moves.",
    "sampleOutput": {
      "question": "We claim faster setup than a competitor, but have only timed our own onboarding.",
      "verdict": "The speed advantage is unverified. Compare equivalent setup tasks and define when onboarding starts and ends before using the claim in marketing.",
      "caveats": "This does not browse competitors or verify current pricing, features or market share. Supply dated evidence and verify important comparisons.",
      "debateSnippet": "Which conclusions follow from the supplied material, and which still require evidence?",
      "debateRole": "Skeptic"
    },
    "faqs": [
      {
        "q": "What does this template cover?",
        "a": "A competitor comparison with evidence gaps, positioning risks and suggested next moves."
      },
      {
        "q": "What are its limits?",
        "a": "This does not browse competitors or verify current pricing, features or market share. Supply dated evidence and verify important comparisons."
      },
      {
        "q": "Is my input stored?",
        "a": "Session content is saved to your account and processed by the AI providers used for your session. Share only material you are authorized to submit. Public sharing is a separate action you control."
      }
    ]
  },
  {
    "slug": "debate-prep",
    "templateId": "debate-prep",
    "image": "/tools/debate-prep.jpg",
    "headline": "Practice Arguments and Possible Counterarguments",
    "howItWorks": [
      {
        "step": "01",
        "title": "Bring the relevant material",
        "desc": "State your position, audience, context and supporting evidence."
      },
      {
        "step": "02",
        "title": "Review competing AI perspectives",
        "desc": "The configured AI court uses the template instructions to examine your question and challenge assumptions. These are AI roles, not human specialists."
      },
      {
        "step": "03",
        "title": "Review the draft and verify it",
        "desc": "An argument map with possible objections, rebuttals, cross-examination questions and draft talking points. Depth and completeness depend on your evidence, court settings and credit cap."
      }
    ],
    "benefits": [
      {
        "title": "Argument map",
        "description": "Separate your main claim, supporting reasons and assumptions."
      },
      {
        "title": "Counterarguments",
        "description": "Explore plausible objections and weak points."
      },
      {
        "title": "Practice material",
        "description": "Draft possible responses, questions and opening or closing points."
      }
    ],
    "outputSummary": "An argument map with possible objections, rebuttals, cross-examination questions and draft talking points.",
    "sampleOutput": {
      "question": "I favor a four-day working week and expect objections about customer coverage.",
      "verdict": "Prepare for the coverage objection by explaining the schedule you propose and the evidence needed to assess it. A shorter week does not by itself show that service levels will be maintained.",
      "caveats": "This cannot anticipate every argument or guarantee persuasion. Verify factual claims and sources before using the material.",
      "debateSnippet": "Which conclusions follow from the supplied material, and which still require evidence?",
      "debateRole": "Skeptic"
    },
    "faqs": [
      {
        "q": "What does this template cover?",
        "a": "An argument map with possible objections, rebuttals, cross-examination questions and draft talking points."
      },
      {
        "q": "What are its limits?",
        "a": "This cannot anticipate every argument or guarantee persuasion. Verify factual claims and sources before using the material."
      },
      {
        "q": "Is my input stored?",
        "a": "Session content is saved to your account and processed by the AI providers used for your session. Share only material you are authorized to submit. Public sharing is a separate action you control."
      }
    ]
  },
  {
    "slug": "hypothesis-testing",
    "templateId": "hypothesis-test",
    "image": "/tools/hypothesis-testing.jpg",
    "headline": "Review Your Hypothesis and Design a Test",
    "howItWorks": [
      {
        "step": "01",
        "title": "Bring the relevant material",
        "desc": "State your hypothesis, observations, assumptions and the decision you are trying to make."
      },
      {
        "step": "02",
        "title": "Review competing AI perspectives",
        "desc": "The configured AI court uses the template instructions to examine your question and challenge assumptions. These are AI roles, not human specialists."
      },
      {
        "step": "03",
        "title": "Review the draft and verify it",
        "desc": "A hypothesis review covering alternative explanations, falsifiability and a proposed test design. Depth and completeness depend on your evidence, court settings and credit cap."
      }
    ],
    "benefits": [
      {
        "title": "Alternative explanations",
        "description": "Consider other causes that could fit your observations."
      },
      {
        "title": "Testability",
        "description": "Clarify what evidence would count against the hypothesis."
      },
      {
        "title": "Proposed design",
        "description": "Outline measurements, comparisons and limitations for a future test."
      }
    ],
    "outputSummary": "A hypothesis review covering alternative explanations, falsifiability and a proposed test design.",
    "sampleOutput": {
      "question": "Team velocity fell after we moved to remote work. Does that prove remote work caused it?",
      "verdict": "The timing alone does not establish causation. Examine workload, team composition and how velocity was measured. A better comparison is needed before attributing the change to remote work.",
      "caveats": "This does not run experiments, compute results from missing data or establish causation. Proposed thresholds are suggestions, not validated findings.",
      "debateSnippet": "Which conclusions follow from the supplied material, and which still require evidence?",
      "debateRole": "Skeptic"
    },
    "faqs": [
      {
        "q": "What does this template cover?",
        "a": "A hypothesis review covering alternative explanations, falsifiability and a proposed test design."
      },
      {
        "q": "What are its limits?",
        "a": "This does not run experiments, compute results from missing data or establish causation. Proposed thresholds are suggestions, not validated findings."
      },
      {
        "q": "Is my input stored?",
        "a": "Session content is saved to your account and processed by the AI providers used for your session. Share only material you are authorized to submit. Public sharing is a separate action you control."
      }
    ]
  },
  {
    "slug": "report-critique",
    "templateId": "report-critique",
    "image": "/tools/report-critique.jpg",
    "headline": "Review Your Report for Gaps and Unsupported Claims",
    "howItWorks": [
      {
        "step": "01",
        "title": "Bring the relevant material",
        "desc": "Provide the report or relevant sections, its audience and the decision it should support."
      },
      {
        "step": "02",
        "title": "Review competing AI perspectives",
        "desc": "The configured AI court uses the template instructions to examine your question and challenge assumptions. These are AI roles, not human specialists."
      },
      {
        "step": "03",
        "title": "Review the draft and verify it",
        "desc": "A critique of supplied reasoning, evidence and structure, with suggested revisions. Depth and completeness depend on your evidence, court settings and credit cap."
      }
    ],
    "benefits": [
      {
        "title": "Reasoning",
        "description": "Examine whether supplied evidence supports the report’s conclusions."
      },
      {
        "title": "Missing context",
        "description": "Identify assumptions and comparisons that may need explanation."
      },
      {
        "title": "Revision priorities",
        "description": "Suggest changes for the intended audience and decision."
      }
    ],
    "outputSummary": "A critique of supplied reasoning, evidence and structure, with suggested revisions.",
    "sampleOutput": {
      "question": "Our report says revenue rose 12% but gives no breakdown of new and returning customers.",
      "verdict": "The headline alone cannot explain the source or durability of growth. Add a breakdown and comparable periods before drawing conclusions about acquisition or retention.",
      "caveats": "This does not verify external facts or audit underlying data that you have not supplied. An excerpt cannot support conclusions about the full report.",
      "debateSnippet": "Which conclusions follow from the supplied material, and which still require evidence?",
      "debateRole": "Skeptic"
    },
    "faqs": [
      {
        "q": "What does this template cover?",
        "a": "A critique of supplied reasoning, evidence and structure, with suggested revisions."
      },
      {
        "q": "What are its limits?",
        "a": "This does not verify external facts or audit underlying data that you have not supplied. An excerpt cannot support conclusions about the full report."
      },
      {
        "q": "Is my input stored?",
        "a": "Session content is saved to your account and processed by the AI providers used for your session. Share only material you are authorized to submit. Public sharing is a separate action you control."
      }
    ]
  },
  {
    "slug": "research-summarizer",
    "templateId": "research-summary",
    "image": "/tools/research-summarizer.jpg",
    "headline": "Synthesize and Question the Research You Supply",
    "howItWorks": [
      {
        "step": "01",
        "title": "Bring the relevant material",
        "desc": "Provide paper text, abstracts or source excerpts and explain the question you want to answer."
      },
      {
        "step": "02",
        "title": "Review competing AI perspectives",
        "desc": "The configured AI court uses the template instructions to examine your question and challenge assumptions. These are AI roles, not human specialists."
      },
      {
        "step": "03",
        "title": "Review the draft and verify it",
        "desc": "A synthesis of supplied evidence, disagreements, methodological limits and practical questions. Depth and completeness depend on your evidence, court settings and credit cap."
      }
    ],
    "benefits": [
      {
        "title": "Source comparison",
        "description": "Organize the findings and disagreements in the material supplied."
      },
      {
        "title": "Evidence limits",
        "description": "Examine reported methods and distinguish findings from interpretation."
      },
      {
        "title": "Open questions",
        "description": "Identify missing sources and matters requiring further verification."
      }
    ],
    "outputSummary": "A synthesis of supplied evidence, disagreements, methodological limits and practical questions.",
    "sampleOutput": {
      "question": "Two abstracts report different outcomes, but one study used a different population.",
      "verdict": "The population difference may help explain the disagreement. Compare the study designs, measures and full results before treating the abstracts as directly contradictory.",
      "caveats": "This does not search the literature or establish current scientific consensus. A topic alone cannot support a sourced review; an abstract limits what can be assessed.",
      "debateSnippet": "Which conclusions follow from the supplied material, and which still require evidence?",
      "debateRole": "Skeptic"
    },
    "faqs": [
      {
        "q": "What does this template cover?",
        "a": "A synthesis of supplied evidence, disagreements, methodological limits and practical questions."
      },
      {
        "q": "What are its limits?",
        "a": "This does not search the literature or establish current scientific consensus. A topic alone cannot support a sourced review; an abstract limits what can be assessed."
      },
      {
        "q": "Is my input stored?",
        "a": "Session content is saved to your account and processed by the AI providers used for your session. Share only material you are authorized to submit. Public sharing is a separate action you control."
      }
    ]
  }
];

// Presentation only: never a second list of available templates.
// Admin-managed names, descriptions, categories, questions and settings come
// from useTemplates(), the same catalog used for session intake and execution.
export function templatePagePath(templateId: string): string {
  const content = TEMPLATE_PAGE_CONTENT.find(page => page.templateId === templateId);
  return `/templates/${encodeURIComponent(content?.slug ?? templateId)}`;
}

export function resolveTemplatePages(templates: Template[]) {
  return templates.map(template => {
    const content = TEMPLATE_PAGE_CONTENT.find(page => page.templateId === template.id);
    return {
      slug: content?.slug ?? template.id,
      image: content?.image,
      content,
      template,
      title: template.title,
      description: template.description,
      category: template.category,
      icon: template.icon,
      badge: TEMPLATE_CATEGORIES.find(category => category.id === template.category)?.label ?? template.category,
      href: templatePagePath(template.id),
    };
  });
}

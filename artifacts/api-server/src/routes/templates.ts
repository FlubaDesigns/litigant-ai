import { Router } from "express";

const router = Router();

// Templates are defined here (source of truth — mirrors frontend data/templates.ts)
const TEMPLATES = [
  { id: "business-plan", category: "business", title: "Business Plan Builder", description: "Stress-test your business concept across viability, market fit, financials, and competition.", estimatedCredits: 25 },
  { id: "website-audit", category: "technical", title: "Website Audit", description: "UX, content, conversion, and technical review of any website.", estimatedCredits: 15 },
  { id: "marketing-strategy", category: "business", title: "Marketing Strategy", description: "Evaluate a marketing approach across channels, messaging, audience, and ROI potential.", estimatedCredits: 20 },
  { id: "code-audit", category: "technical", title: "Code Audit", description: "Security, performance, maintainability, and architecture review.", estimatedCredits: 20 },
  { id: "contract-review", category: "personal", title: "Contract Review Prep", description: "Identify risks, unfavorable clauses, and negotiation points.", estimatedCredits: 20 },
  { id: "book-critique", category: "writing", title: "Book / Manuscript Critique", description: "Structured critique for argument quality, clarity, structure, and impact.", estimatedCredits: 18 },
  { id: "medical-prep", category: "personal", title: "Medical Appointment Prep", description: "Prepare informed questions before a medical appointment.", estimatedCredits: 15 },
  { id: "major-decision", category: "personal", title: "Major Decision Analysis", description: "Pros/cons, risk analysis, and recommendation for significant decisions.", estimatedCredits: 15 },
  { id: "research-summary", category: "research", title: "Research Summary", description: "Synthesize and stress-test findings from a research area or paper.", estimatedCredits: 20 },
  { id: "product-stress-test", category: "business", title: "Product Idea Stress Test", description: "Validate or invalidate a product idea with adversarial examination.", estimatedCredits: 20 },
];

router.get("/templates", (_req, res) => {
  res.json(TEMPLATES);
});

router.get("/templates/:id", (req, res) => {
  const template = TEMPLATES.find((t) => t.id === req.params["id"]);
  if (!template) {
    res.status(404).json({ message: "Template not found" });
    return;
  }
  res.json(template);
});

export default router;

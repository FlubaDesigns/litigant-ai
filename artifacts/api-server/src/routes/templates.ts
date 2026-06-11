import { Router } from "express";
import { getFirestoreDb } from "../lib/firebaseAdmin.js";

const router = Router();

// Static fallback — used when Firestore is not configured or templates collection is empty
const STATIC_TEMPLATES = [
  { id: "business-plan", category: "business", title: "Business Plan Builder", description: "Stress-test your business concept across viability, market fit, financials, and competition.", estimatedCredits: 25 },
  { id: "website-audit", category: "technical", title: "Website Audit", description: "UX, content, conversion, and technical review of any website.", estimatedCredits: 15 },
  { id: "marketing-strategy", category: "business", title: "Marketing Strategy", description: "Evaluate a marketing approach across channels, messaging, audience, and ROI potential.", estimatedCredits: 20 },
  { id: "code-audit", category: "technical", title: "Code Audit", description: "Security, performance, maintainability, and architecture review of code or a system design.", estimatedCredits: 20 },
  { id: "contract-review", category: "personal", title: "Contract Review Prep", description: "Identify risks, unfavorable clauses, and negotiation points in a contract.", estimatedCredits: 20 },
  { id: "book-critique", category: "writing", title: "Book / Manuscript Critique", description: "Structured critique of writing for argument quality, clarity, structure, and impact.", estimatedCredits: 18 },
  { id: "medical-prep", category: "personal", title: "Medical Appointment Prep", description: "Prepare informed questions before a medical appointment.", estimatedCredits: 15 },
  { id: "major-decision", category: "personal", title: "Major Decision Analysis", description: "Pros/cons, risk analysis, and recommendation for any significant life or business decision.", estimatedCredits: 15 },
  { id: "research-summary", category: "research", title: "Research Summary", description: "Synthesize and stress-test findings from a research area or paper.", estimatedCredits: 20 },
  { id: "product-stress-test", category: "business", title: "Product Idea Stress Test", description: "Validate or invalidate a product idea with adversarial examination of assumptions.", estimatedCredits: 20 },
];

router.get("/templates", async (_req, res) => {
  const db = getFirestoreDb();
  if (db) {
    try {
      const snap = await db.collection("templates").get();
      if (!snap.empty) {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        res.json(docs);
        return;
      }
    } catch (e) {
      console.warn("[templates] Firestore fetch failed, using static fallback:", (e as Error).message);
    }
  }
  res.json(STATIC_TEMPLATES);
});

router.get("/templates/:id", async (req, res) => {
  const id = req.params["id"]!;
  const db = getFirestoreDb();
  if (db) {
    try {
      const doc = await db.collection("templates").doc(id).get();
      if (doc.exists) {
        res.json({ id: doc.id, ...doc.data() });
        return;
      }
    } catch {
      // fall through to static
    }
  }
  const template = STATIC_TEMPLATES.find((t) => t.id === id);
  if (!template) {
    res.status(404).json({ message: "Template not found" });
    return;
  }
  res.json(template);
});

export default router;

import { presentSessionContent } from "../../lib/sessionContent.js";
import { verifyIdToken, isFirebaseConfigured } from "../../lib/firebaseAdmin.js";

export async function requireAdmin(req: any, res: any, next: any): Promise<void> {
  if (!isFirebaseConfigured()) {
    res.status(503).json({ error: "Firebase not configured" });
    return;
  }
  const authHeader = req.headers["authorization"] as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded?.admin) {
    res.status(403).json({ error: "Forbidden — admin access required" });
    return;
  }
  req.adminUid = decoded.uid;
  next();
}

export function serializeDoc(doc: FirebaseFirestore.DocumentSnapshot): Record<string, unknown> {
  const data = presentSessionContent(doc.data() ?? {});
  const out: Record<string, unknown> = { id: doc.id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "toDate" in v && typeof (v as any).toDate === "function") {
      out[k] = (v as any).toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

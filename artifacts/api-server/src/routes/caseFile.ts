/**
 * Case File routes — pre-briefing document/URL extraction
 *
 * POST /case-file/fetch-url  — fetch a URL and return its readable text
 * POST /case-file/upload     — accept a file upload and return extracted text
 *
 * Security notes:
 *   - fetch-url: resolves hostname DNS before connecting and rejects private/reserved
 *     IP ranges (SSRF protection). Redirects are not followed. Response is streamed
 *     with a 2 MB hard ceiling so large responses cannot exhaust container memory.
 *   - upload: 10 MB multer limit; content is extracted and truncated server-side.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import dns from "dns/promises";
import { verifyIdToken } from "../lib/firebaseAdmin.js";

const router = Router();

async function requireAuth(req: Request, res: Response): Promise<string | null> {
  const authHeader = req.headers["authorization"] as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return decoded.uid;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── SSRF protection helpers ───────────────────────────────────────────────────

/**
 * Returns true if the IP is in a private/reserved/link-local range that must
 * never be reachable from a public case-file fetch.
 */
function isBlockedIp(ip: string): boolean {
  if (!ip) return true;
  // Loopback
  if (ip === "127.0.0.1" || ip === "::1") return true;
  if (ip.startsWith("127.")) return true;
  // RFC 1918 private ranges
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;
  // Link-local / cloud metadata (AWS, GCP, Azure, DigitalOcean all use 169.254.169.254)
  if (ip.startsWith("169.254.")) return true;
  // Unspecified / broadcast
  if (ip === "0.0.0.0" || ip === "255.255.255.255") return true;
  // IPv6 private / link-local
  if (ip.startsWith("fe80:") || ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd")) return true;
  return false;
}

/**
 * Resolves the hostname to an IPv4 address and returns it only if it is safe.
 * Returns null if the hostname cannot be resolved or resolves to a blocked range.
 */
async function resolveSafe(hostname: string): Promise<string | null> {
  try {
    const { address } = await dns.lookup(hostname, { family: 4 });
    if (isBlockedIp(address)) return null;
    return address;
  } catch {
    return null; // unresolvable = deny
  }
}

// ── Text helpers ──────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
}

function truncate(text: string, maxChars = 12000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[… content truncated to fit court briefing …]";
}

// ── POST /case-file/fetch-url ─────────────────────────────────────────────────

const MAX_FETCH_BYTES = 2 * 1024 * 1024; // 2 MB streaming ceiling

router.post("/case-file/fetch-url", async (req, res) => {
  const uid = await requireAuth(req, res);
  if (!uid) return;

  const { url } = req.body as { url?: string };
  if (!url?.trim()) {
    res.status(400).json({ message: "url is required" });
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    res.status(400).json({ message: "Invalid URL" });
    return;
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    res.status(400).json({ message: "Only http/https URLs are supported" });
    return;
  }

  // SSRF protection: DNS-resolve hostname and reject private/reserved targets
  const safeIp = await resolveSafe(parsedUrl.hostname);
  if (!safeIp) {
    res.status(400).json({ message: "URL target is not allowed" });
    return;
  }

  try {
    const response = await fetch(url.trim(), {
      headers: { "User-Agent": "LitigantAI-CaseFile/1.0" },
      redirect: "manual", // never follow redirects — each hop could redirect to a private IP
      signal: AbortSignal.timeout(10_000),
    });

    // Any redirect: refuse. The redirect target may be a private IP (SSRF via open redirect).
    if (response.status >= 300 && response.status < 400) {
      res.status(400).json({ message: "Redirected URLs are not supported" });
      return;
    }

    if (!response.ok) {
      res.status(400).json({ message: `URL returned ${response.status}` });
      return;
    }

    // Reject large responses early when Content-Length is available
    const clHeader = response.headers.get("content-length");
    if (clHeader) {
      const cl = parseInt(clHeader, 10);
      if (!isNaN(cl) && cl > MAX_FETCH_BYTES) {
        res.status(400).json({ message: "Response too large" });
        return;
      }
    }

    // Stream with a hard byte ceiling — prevents OOM from large/hostile responses
    // even when Content-Length is absent or incorrect.
    if (!response.body) {
      res.status(502).json({ message: "No response body" });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let rawText = "";
    let bytesRead = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.length;
        if (bytesRead > MAX_FETCH_BYTES) {
          rawText += decoder.decode(value, { stream: false });
          reader.cancel().catch(() => {});
          break;
        }
        rawText += decoder.decode(value, { stream: true });
      }
      rawText += decoder.decode(); // flush the internal state
    } finally {
      reader.releaseLock();
    }

    const contentType = response.headers.get("content-type") ?? "";
    let content: string;
    let title = parsedUrl.hostname;

    if (contentType.includes("application/json")) {
      try {
        content = JSON.stringify(JSON.parse(rawText), null, 2);
      } catch {
        content = rawText;
      }
    } else if (contentType.includes("text/html")) {
      const titleMatch = rawText.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1].trim();
      content = stripHtml(rawText);
    } else {
      content = rawText;
    }

    res.json({ title, content: truncate(content) });
  } catch (err: any) {
    const msg = err?.name === "TimeoutError" ? "Request timed out" : "Failed to fetch URL";
    res.status(502).json({ message: msg });
  }
});

// ── POST /case-file/upload ────────────────────────────────────────────────────

router.post("/case-file/upload", upload.single("file"), async (req, res) => {
  const uid = await requireAuth(req, res);
  if (!uid) return;

  const file = req.file;
  if (!file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }

  const mime = file.mimetype;
  const name = file.originalname;
  let content = "";

  try {
    if (mime === "application/pdf" || name.endsWith(".pdf")) {
      const pdfMod = await import("pdf-parse");
      const pdfParse = (pdfMod as any).default ?? pdfMod;
      const result = await pdfParse(file.buffer);
      content = result.text;
    } else if (
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx")
    ) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      content = result.value;
    } else if (mime === "application/json" || name.endsWith(".json")) {
      const raw = file.buffer.toString("utf8");
      try {
        content = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        content = raw;
      }
    } else {
      // txt, md, csv, xml, and anything else — treat as plain text
      content = file.buffer.toString("utf8");
    }

    res.json({ name, content: truncate(content) });
  } catch (err: any) {
    console.error("[case-file/upload] extraction error:", err?.message);
    res.status(422).json({ message: "Could not extract text from file" });
  }
});

// Catch multer errors (e.g. file too large) and return a clean 400
router.use("/case-file/upload", (err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ message: "File exceeds the 10 MB limit" });
    return;
  }
  res.status(500).json({ message: "Upload failed" });
});

export default router;

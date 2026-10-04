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
import http from "node:http";
import https from "node:https";
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
  const [a, b, c] = ip.split(".").map(Number);
  if (a === 0 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return true;
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
  const suffix = "\n\n[… content truncated to fit court briefing …]";
  return text.slice(0, maxChars - suffix.length) + suffix;
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

  if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
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
    // Connect to the exact address checked above. Resolving again at connect
    // time would allow DNS rebinding to a private address.
    const response = await new Promise<{status: number; contentType: string; text: string}>((resolve, reject) => {
      const client = parsedUrl.protocol === "https:" ? https : http;
      const request = client.request({
        protocol: parsedUrl.protocol, hostname: safeIp, port: parsedUrl.port || undefined,
        servername: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search,
        headers: {Host: parsedUrl.host, "User-Agent":"LitigantAI-CaseFile/1.0"},
        signal: AbortSignal.timeout(10_000),
      }, incoming => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        incoming.on("error", reject);
        incoming.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_FETCH_BYTES) { incoming.destroy(new Error("Response too large")); return; }
          chunks.push(chunk);
        });
        incoming.on("end", () => resolve({status: incoming.statusCode ?? 502,
          contentType: String(incoming.headers["content-type"] ?? ""), text: Buffer.concat(chunks).toString("utf8")}));
      });
      request.on("error", reject);
      request.end();
    });
    if (response.status >= 300 && response.status < 400) {
      res.status(400).json({message:"Redirected URLs are not supported"}); return;
    }
    if (response.status < 200 || response.status >= 300) {
      res.status(400).json({message:`URL returned ${response.status}`}); return;
    }
    const rawText = response.text;
    const contentType = response.contentType;
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

  // Magic-byte validation — reject files whose actual content doesn't match
  // their claimed type. Trusting MIME type alone lets a client upload a
  // crafted binary disguised as a PDF or DOCX.
  const buf = file.buffer;
  const isPdfMagic  = buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
  const isZipMagic  = buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04; // PK (ZIP / DOCX)
  const claimedPdf  = mime === "application/pdf"  || name.endsWith(".pdf");
  const claimedDocx = mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx");

  if (claimedPdf && !isPdfMagic) {
    res.status(400).json({ message: "File does not appear to be a valid PDF" });
    return;
  }
  if (claimedDocx && !isZipMagic) {
    res.status(400).json({ message: "File does not appear to be a valid DOCX" });
    return;
  }

  try {
    if (claimedPdf) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(file.buffer) });
      try { content = (await parser.getText()).text; }
      finally { await parser.destroy(); }
    } else if (claimedDocx) {
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

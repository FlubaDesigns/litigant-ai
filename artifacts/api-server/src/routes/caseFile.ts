/**
 * Case File routes — pre-briefing document/URL extraction
 *
 * POST /case-file/fetch-url  — fetch a URL and return its readable text
 * POST /case-file/upload     — accept a file upload and return extracted text
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Helpers ───────────────────────────────────────────────────────────────────

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

router.post("/case-file/fetch-url", async (req, res) => {
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

  try {
    const response = await fetch(url.trim(), {
      headers: { "User-Agent": "LitigantAI-CaseFile/1.0" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      res.status(400).json({ message: `URL returned ${response.status}` });
      return;
    }

    const contentType = response.headers.get("content-type") ?? "";
    let content: string;
    let title = parsedUrl.hostname;

    if (contentType.includes("application/json")) {
      const json = await response.json();
      content = JSON.stringify(json, null, 2);
    } else if (contentType.includes("text/html")) {
      const html = await response.text();
      // Extract <title>
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1].trim();
      content = stripHtml(html);
    } else {
      content = await response.text();
    }

    res.json({ title, content: truncate(content) });
  } catch (err: any) {
    const msg = err?.name === "TimeoutError" ? "Request timed out" : "Failed to fetch URL";
    res.status(502).json({ message: msg });
  }
});

// ── POST /case-file/upload ────────────────────────────────────────────────────

router.post("/case-file/upload", upload.single("file"), async (req, res) => {
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

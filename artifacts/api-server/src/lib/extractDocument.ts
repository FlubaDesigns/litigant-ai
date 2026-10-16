import { Worker } from "node:worker_threads";

// A container safety ceiling, in addition to the shared per-account allowance.
export const MAX_DOCUMENT_WORKERS = 2;
let activeWorkers = 0;
export class DocumentExtractionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function extractDocument(bytes: Buffer, kind: "pdf" | "docx", timeoutMs: number, signal: AbortSignal): Promise<string> {
  if (signal.aborted) return Promise.reject(new DocumentExtractionError(499, "Upload cancelled"));
  if (activeWorkers >= MAX_DOCUMENT_WORKERS) return Promise.reject(new DocumentExtractionError(503, "Document processing is busy. Please try again."));
  activeWorkers++;
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./documentWorker.mjs", import.meta.url), {
        workerData: { bytes, kind, maxChars: 12000 },
        resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
      });
    } catch { activeWorkers--; reject(new DocumentExtractionError(503, "Document processing is unavailable")); return; }
    let finished = false;
    const finish = (error?: Error, text?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      // Do not release the concurrency slot until the parser has actually stopped.
      void worker.terminate().finally(() => {
        activeWorkers--;
        if (error) reject(error); else resolve(text!);
      });
    };
    const cancel = () => finish(new DocumentExtractionError(499, "Upload cancelled"));
    const timer = setTimeout(() => finish(new DocumentExtractionError(422, "Document processing timed out. Try a smaller or simpler file.")), timeoutMs);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    worker.once("message", message => {
      if (typeof message.text === "string") finish(undefined, message.text);
      else finish(new DocumentExtractionError(422, "Could not extract text from file"));
    });
    worker.once("error", () => finish(new DocumentExtractionError(422, "Document exceeds processing limits or could not be read")));
    worker.once("exit", () => { if (!finished) finish(new DocumentExtractionError(422, "Document processing stopped before completion")); });
  });
}

import { parentPort, workerData } from 'node:worker_threads';

// Runs outside the API event loop. The parent forcibly terminates this worker
// on disconnect, deadline, or resource exhaustion; late results cannot escape.
try {
  const bytes = new Uint8Array(workerData.bytes);
  let text;
  if (workerData.kind === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: bytes });
    try { text = (await parser.getText()).text; }
    finally { await parser.destroy(); }
  } else {
    const { extractRawText } = await import('mammoth');
    text = (await extractRawText({ buffer: Buffer.from(bytes) })).value;
  }
  parentPort.postMessage({ text: text.slice(0, workerData.maxChars + 1) });
} catch {
  parentPort.postMessage({ error: 'Could not extract text from file' });
}

import { describe, it, expect } from "vitest";
import {
  PDF_FIELD_CHAR_LIMIT,
  PDF_TRIM_SUFFIX,
  applyPdfTrimGuard,
  buildPdfToastActions,
} from "./pdfExport";

describe("applyPdfTrimGuard", () => {
  it("returns the original text unchanged when content is within the limit", () => {
    const short = "A".repeat(100);
    const { safeText, wasTrimmed } = applyPdfTrimGuard(short);
    expect(safeText).toBe(short);
    expect(wasTrimmed).toBe(false);
  });

  it("returns the original text unchanged when content is exactly at the limit", () => {
    const atLimit = "A".repeat(PDF_FIELD_CHAR_LIMIT);
    const { safeText, wasTrimmed } = applyPdfTrimGuard(atLimit);
    expect(safeText).toBe(atLimit);
    expect(wasTrimmed).toBe(false);
  });

  it("trims content that is one character over the limit", () => {
    const overLimit = "A".repeat(PDF_FIELD_CHAR_LIMIT + 1);
    const { safeText, wasTrimmed } = applyPdfTrimGuard(overLimit);
    expect(wasTrimmed).toBe(true);
    expect(safeText).toBe("A".repeat(PDF_FIELD_CHAR_LIMIT) + PDF_TRIM_SUFFIX);
    expect(safeText.length).toBe(PDF_FIELD_CHAR_LIMIT + PDF_TRIM_SUFFIX.length);
  });

  it("trims content that is 20,000 chars (simulates a large AI response)", () => {
    const large = "A".repeat(20_000);
    const { safeText, wasTrimmed } = applyPdfTrimGuard(large);
    expect(wasTrimmed).toBe(true);
    expect(safeText.startsWith("A".repeat(PDF_FIELD_CHAR_LIMIT))).toBe(true);
    expect(safeText).toContain("[…content trimmed");
    expect(safeText).toContain(".docx");
  });

  it("preserves an empty string without trimming", () => {
    const { safeText, wasTrimmed } = applyPdfTrimGuard("");
    expect(safeText).toBe("");
    expect(wasTrimmed).toBe(false);
  });
});

describe("buildPdfToastActions — short content", () => {
  it("returns only a success toast when content was NOT trimmed", () => {
    const actions = buildPdfToastActions(false);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("success");
    expect(actions[0].message).toContain("PDF downloaded");
  });
});

describe("buildPdfToastActions — long content", () => {
  it("returns a success toast AND a warning toast when content WAS trimmed", () => {
    const actions = buildPdfToastActions(true);
    expect(actions).toHaveLength(2);

    const [success, warning] = actions;
    expect(success.type).toBe("success");
    expect(success.message).toContain("PDF downloaded");

    expect(warning.type).toBe("warning");
    expect(warning.message).toContain("trimmed");
    expect(warning.message).toContain(".docx");
  });
});

describe("end-to-end trim guard integration", () => {
  it("short content path: applyPdfTrimGuard → buildPdfToastActions emits only success", () => {
    const shortContent = "The court finds in favour of the claimant.";
    const { wasTrimmed } = applyPdfTrimGuard(shortContent);
    const toasts = buildPdfToastActions(wasTrimmed);

    expect(wasTrimmed).toBe(false);
    expect(toasts.map((t) => t.type)).toEqual(["success"]);
  });

  it("long content path: applyPdfTrimGuard → buildPdfToastActions emits success + warning", () => {
    const longContent = "A".repeat(20_000);
    const { wasTrimmed } = applyPdfTrimGuard(longContent);
    const toasts = buildPdfToastActions(wasTrimmed);

    expect(wasTrimmed).toBe(true);
    expect(toasts.map((t) => t.type)).toEqual(["success", "warning"]);
  });
});

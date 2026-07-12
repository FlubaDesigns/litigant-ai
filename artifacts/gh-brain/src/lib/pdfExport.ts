export const PDF_FIELD_CHAR_LIMIT = 15_000;

export const PDF_TRIM_SUFFIX = "\n[…content trimmed — export as .docx for the full text]";

/**
 * Pure function: applies the PDF character limit to a single text field.
 * Returns the (possibly trimmed) text and a flag indicating whether trimming occurred.
 * This is the core logic tested by the trim guard.
 */
export function applyPdfTrimGuard(text: string): { safeText: string; wasTrimmed: boolean } {
  if (text.length > PDF_FIELD_CHAR_LIMIT) {
    return {
      safeText: text.slice(0, PDF_FIELD_CHAR_LIMIT) + PDF_TRIM_SUFFIX,
      wasTrimmed: true,
    };
  }
  return { safeText: text, wasTrimmed: false };
}

/**
 * Given the wasTrimmed flag returned by exportJsPdf, determines which toasts to fire.
 * Separated from the jsPDF rendering so it can be tested without a browser.
 */
export function buildPdfToastActions(wasTrimmed: boolean): Array<{ type: "success" | "warning"; message: string }> {
  const actions: Array<{ type: "success" | "warning"; message: string }> = [
    { type: "success", message: "PDF downloaded." },
  ];
  if (wasTrimmed) {
    actions.push({
      type: "warning",
      message: "Some content was too long for PDF and was trimmed. Export as .docx to get the full text.",
    });
  }
  return actions;
}

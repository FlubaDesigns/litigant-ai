export interface StoredTurn { content: string; [key: string]: unknown }
export interface SessionContentInput {
  transcript?: string;
  transcriptLines?: readonly string[];
  debateNotes?: string;
  turns?: readonly StoredTurn[];
}
export interface CanonicalSessionContent {
  version: 1;
  blocks: string[];
  transcript: { block: number; prefix: string }[];
  context: { block: number; prefix: string }[];
  notes: { block: number; prefix: string }[];
  turns: { metadata: Record<string, unknown>; block: number }[];
}
export function encodeSessionContent(input: SessionContentInput): CanonicalSessionContent;
export function decodeSessionContent(record: unknown): {
  transcript: string;
  transcriptLines: string[];
  debateNotes: string;
  turns: StoredTurn[];
};

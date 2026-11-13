/** Lossless storage codec. Display text and turn bodies share interned blocks.
 * This module has no runtime dependencies so release migrations use the same
 * codec as the API. It never infers missing history from a different view.
 */
const SEPARATOR = "\n\n---\n\n";

export function encodeSessionContent({ transcript = "", transcriptLines, debateNotes = "", turns = [] }) {
  if (typeof transcript !== "string" || typeof debateNotes !== "string" ||
      (transcriptLines !== undefined && (!Array.isArray(transcriptLines) || transcriptLines.some(line => typeof line !== "string"))) ||
      !Array.isArray(turns)) throw new TypeError("Invalid session content input");
  const blocks = [];
  const indexes = new Map();
  const intern = text => {
    if (typeof text !== "string") throw new TypeError("Invalid turn content");
    if (!indexes.has(text)) { indexes.set(text, blocks.length); blocks.push(text); }
    return indexes.get(text);
  };
  const reference = text => {
    // Retain the exact delimiter, including spaces/newlines. Unknown formats
    // remain opaque; neither migration nor storage normalizes user content.
    const prefix = text.match(/^(?:\*\*[^\n]*?:\*\*(?: |\n)|### [^\n]*\n)/)?.[0] ?? "";
    return { block: intern(text.slice(prefix.length)), prefix };
  };
  const split = text => text === "" ? [] : text.split(SEPARATOR);
  const transcriptView = split(transcript).map(reference);
  const contextView = (transcriptLines ?? split(transcript)).map(reference);
  const notesView = split(debateNotes).map(reference);
  const turnView = turns.map(turn => {
    if (!turn || typeof turn !== "object" || Array.isArray(turn)) throw new TypeError("Invalid turn");
    const { content, ...metadata } = turn;
    return { metadata, block: intern(content) };
  });
  return { version: 1, blocks, transcript: transcriptView, context: contextView, notes: notesView, turns: turnView };
}

export function decodeSessionContent(record) {
  const invalid = () => { throw new TypeError("Invalid canonical session content"); };
  if (!record || record.version !== 1 || !Array.isArray(record.blocks) ||
      record.blocks.some(block => typeof block !== "string")) invalid();
  const block = index => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= record.blocks.length) invalid();
    return record.blocks[index];
  };
  const view = refs => {
    if (!Array.isArray(refs)) invalid();
    return refs.map(ref => {
      if (!ref || typeof ref.prefix !== "string") invalid();
      return ref.prefix + block(ref.block);
    });
  };
  if (!Array.isArray(record.turns)) invalid();
  const turns = record.turns.map(turn => {
    if (!turn || !turn.metadata || typeof turn.metadata !== "object" || Array.isArray(turn.metadata) ||
        Object.hasOwn(turn.metadata, "content")) invalid();
    return { ...turn.metadata, content: block(turn.block) };
  });
  return {
    transcript: view(record.transcript).join(SEPARATOR),
    transcriptLines: view(record.context),
    debateNotes: view(record.notes).join(SEPARATOR),
    turns,
  };
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeSessionContent, decodeSessionContent } from "../lib/api-zod/src/session-content.mjs";

const separator = "\n\n---\n\n";
test("interns shared bodies without changing distinct transcript/notes labels", () => {
  const body = "First paragraph.\nSecond paragraph.\n";
  const input = {
    transcript: `**Counsel (Round 1):** ${body}`,
    transcriptLines: [`**Counsel (Round 1):** ${body}`],
    debateNotes: `### Counsel — Round 1\n${body}`,
    turns: [{ id: "turn_000", role: "Counsel", round: 1, turnIndex: 0, content: body, createdAt: { seconds: 12, nanoseconds: 3 } }],
  };
  const encoded = encodeSessionContent(input);
  assert.deepEqual(encoded.blocks, [body]);
  assert.deepEqual(decodeSessionContent(encoded), input);
});

test("preserves follow-ups absent from turns and verdicts absent from transcript", () => {
  const input = {
    transcript: "**User (follow-up 2):** Additional facts",
    transcriptLines: ["**User (follow-up 2):** Additional facts"],
    debateNotes: "",
    turns: [{ role: "Verdict", round: 99, content: "Final answer" }],
  };
  assert.deepEqual(decodeSessionContent(encodeSessionContent(input)), input);
});

test("preserves disagreeing stored display/context and delimiters inside content", () => {
  const input = {
    transcript: `Saved display${separator}with divider${separator}`,
    transcriptLines: [`Different context${separator}within one turn`, "", " trailing \n"],
    debateNotes: `\nLeading whitespace${separator}### Custom\nbody\n`,
    turns: [{ id: "legacy-unindexed", content: "Opaque body", customMetadata: { retained: true } }],
  };
  assert.deepEqual(decodeSessionContent(encodeSessionContent(input)), input);
});

test("empty content remains empty and encoding does not mutate inputs", () => {
  const input = Object.freeze({ transcript: "", transcriptLines: Object.freeze([]), debateNotes: "", turns: Object.freeze([]) });
  assert.deepEqual(decodeSessionContent(encodeSessionContent(input)), input);
});

test("rejects corrupt references and unsupported versions rather than erasing history", () => {
  const valid = encodeSessionContent({ transcript: "Saved" });
  for (const changed of [
    { ...valid, version: 2 },
    { ...valid, blocks: [null] },
    { ...valid, transcript: [{ prefix: "", block: 100 }] },
    { ...valid, notes: [{ prefix: "", block: -1 }] },
    { ...valid, context: [{ prefix: "", block: 0.5 }] },
    { ...valid, turns: [{ block: 0, metadata: { content: "shadow" } }] },
  ]) assert.throws(() => decodeSessionContent(changed), /Invalid canonical/);
});

test("rejects malformed legacy content without coercing or discarding it", () => {
  for (const input of [{ transcript: null }, { transcriptLines: [null] }, { debateNotes: 1 }, { turns: [{ role: "Verdict" }] }]) {
    assert.throws(() => encodeSessionContent(input), TypeError);
  }
});

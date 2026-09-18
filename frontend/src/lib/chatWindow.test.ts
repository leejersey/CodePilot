import assert from "node:assert/strict";
import test from "node:test";

import {
  autoWindowStart,
  buildChatOutline,
  ensureMessageVisibleStart,
  hiddenTurnCount,
  loadEarlierStart,
  outlineLabel,
  turnStartIndices,
} from "./chatWindow.ts";

const sample = [
  { role: "assistant", content: "引导" },
  { role: "user", content: "第一问" },
  { role: "assistant", content: "答1" },
  { role: "user", content: "第二问" },
  { role: "assistant", content: "答2" },
  { role: "user", content: "第三问" },
  { role: "assistant", content: "答3" },
];

test("turnStartIndices treats leading assistant as its own turn", () => {
  assert.deepEqual(turnStartIndices(sample), [0, 1, 3, 5]);
});

test("autoWindowStart keeps only the latest N turns", () => {
  assert.equal(autoWindowStart(sample, 2), 3);
  assert.equal(autoWindowStart(sample, 10), 0);
});

test("loadEarlierStart expands backward by turns", () => {
  assert.equal(loadEarlierStart(sample, 5, 1), 3);
  assert.equal(loadEarlierStart(sample, 5, 8), 0);
});

test("ensureMessageVisibleStart expands to include outline target", () => {
  assert.equal(ensureMessageVisibleStart(sample, 5, 1), 1);
  assert.equal(ensureMessageVisibleStart(sample, 1, 5), 1);
});

test("hiddenTurnCount counts turns before the window", () => {
  assert.equal(hiddenTurnCount(sample, 3), 2);
  assert.equal(hiddenTurnCount(sample, 0), 0);
});

test("outline lists user prompts with truncated labels", () => {
  const outline = buildChatOutline(sample);
  assert.equal(outline.length, 3);
  assert.equal(outline[0].messageIndex, 1);
  assert.equal(outline[0].label, "第一问");
  assert.match(outlineLabel("a".repeat(50)), /…$/);
});

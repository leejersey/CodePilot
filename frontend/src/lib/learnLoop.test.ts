import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLearnLoopSteps, nextLearnLoopHint } from "./learnLoop.ts";

describe("learnLoop", () => {
  it("builds ordered checklist", () => {
    const steps = buildLearnLoopSteps({
      hasChatted: true,
      hasRunCode: false,
      practiceTotal: 2,
      practicePassed: 1,
      chapterCompleted: false,
    });
    assert.equal(steps.map((s) => s.id).join(","), "chat,run,practice,complete");
    assert.equal(steps[0].done, true);
    assert.equal(steps[1].done, false);
    assert.equal(steps[2].detail, "1/2");
    assert.match(nextLearnLoopHint(steps), /运行/);
  });

  it("marks complete when all done", () => {
    const steps = buildLearnLoopSteps({
      hasChatted: true,
      hasRunCode: true,
      practiceTotal: 1,
      practicePassed: 1,
      chapterCompleted: true,
    });
    assert.ok(steps.every((s) => s.done));
    assert.match(nextLearnLoopHint(steps), /已完成/);
  });
});

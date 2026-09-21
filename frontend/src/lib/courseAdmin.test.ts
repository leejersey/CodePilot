import assert from "node:assert/strict";
import test from "node:test";

import {
  getCourseActions,
  getCourseStatusLabel,
  getVisibleCourseJobs,
  hasRunningCourseJobs,
} from "./courseAdmin.ts";
import type { BackgroundJob } from "./api.ts";
import {
  chooseKnowledgeBase,
  choosePureAi,
  createKnowledgeBaseSelection,
} from "./knowledgeBaseSelection.ts";

test("selecting pure AI clears every knowledge-base dependency", () => {
  const current = createKnowledgeBaseSelection(["kb-one", "kb-two"]);
  assert.deepEqual(current.knowledgeBaseIds, ["kb-one", "kb-two"]);

  const selection = choosePureAi();

  assert.equal(selection.pureAi, true);
  assert.deepEqual(selection.knowledgeBaseIds, []);
});

test("selecting a knowledge base exits pure AI mode", () => {
  const selection = chooseKnowledgeBase(
    createKnowledgeBaseSelection([], true),
    "kb-one"
  );

  assert.equal(selection.pureAi, false);
  assert.deepEqual(selection.knowledgeBaseIds, ["kb-one"]);
});

test("deselecting the final knowledge base automatically selects pure AI", () => {
  const selection = chooseKnowledgeBase(
    createKnowledgeBaseSelection(["kb-one"]),
    "kb-one"
  );

  assert.equal(selection.pureAi, true);
  assert.deepEqual(selection.knowledgeBaseIds, []);
});

test("selection construction never permits an empty non-AI state", () => {
  assert.deepEqual(createKnowledgeBaseSelection([], false), {
    pureAi: true,
    knowledgeBaseIds: [],
  });
});

test("current dependencies are preserved and deduplicated", () => {
  const selection = createKnowledgeBaseSelection([
    "kb-one",
    "kb-two",
    "kb-one",
  ]);

  assert.equal(selection.pureAi, false);
  assert.deepEqual(selection.knowledgeBaseIds, ["kb-one", "kb-two"]);
});

test("course status labels match the admin workflow", () => {
  assert.equal(getCourseStatusLabel("pending_review"), "待审核");
  assert.equal(getCourseStatusLabel("rejected"), "已拒绝");
  assert.equal(getCourseStatusLabel("published"), "已发布");
});

test("pending courses expose review but not publish", () => {
  assert.deepEqual(getCourseActions("pending_review"), [
    "view",
    "review",
    "rebuild",
  ]);
});

test("course actions follow backend lifecycle transitions", () => {
  // 管理员可从草稿直接发布，无需自审自批的往返；草稿可永久删除清理。
  assert.deepEqual(getCourseActions("draft"), [
    "view",
    "publish",
    "rebuild",
    "delete",
  ]);
  assert.deepEqual(getCourseActions("rejected"), ["view", "rebuild", "delete"]);
  assert.deepEqual(getCourseActions("published"), ["view", "archive", "rebuild"]);
  assert.deepEqual(getCourseActions("archived"), ["view", "publish", "rebuild"]);
});

function courseJob(
  overrides: Partial<BackgroundJob> & Pick<BackgroundJob, "id" | "status">
): BackgroundJob {
  return {
    job_type: "course_rebuild",
    progress: 0,
    result_resource_id: null,
    error_message: null,
    attempts: 1,
    payload: null,
    created_at: "2026-09-17T00:00:00Z",
    started_at: null,
    finished_at: null,
    updated_at: "2026-09-17T00:00:00Z",
    ...overrides,
  };
}

test("course jobs poll only while work is active", () => {
  assert.equal(
    hasRunningCourseJobs([
      courseJob({ id: "done", status: "completed" }),
      courseJob({ id: "retrying", status: "retrying" }),
    ]),
    true
  );
  assert.equal(
    hasRunningCourseJobs([
      courseJob({ id: "done", status: "completed" }),
      courseJob({ id: "failed", status: "failed" }),
    ]),
    false
  );
});

test("dismissed job notifications stay hidden and respect the limit", () => {
  const jobs = [
    courseJob({ id: "one", status: "completed" }),
    courseJob({ id: "two", status: "failed" }),
    courseJob({ id: "three", status: "cancelled" }),
  ];

  assert.deepEqual(
    getVisibleCourseJobs(jobs, new Set(["two"]), 1).map((job) => job.id),
    ["one"]
  );
});

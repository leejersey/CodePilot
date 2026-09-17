import assert from "node:assert/strict";
import test from "node:test";

import {
  getJobPollRetryDelay,
  getTerminalCourseJobIds,
  shouldPollCourseJob,
} from "./courseAdmin.ts";
import { createKnowledgeBaseSelection } from "./knowledgeBaseSelection.ts";
import { validateCourseSourceSubmission } from "./courseSourceFormState.ts";
import {
  getNextFocusIndex,
  shouldDismissModal,
} from "./modalAccessibility.ts";
import {
  createCourseRefreshCoordinator,
  createRequestSequencer,
} from "./requestSequencing.ts";
import type { BackgroundJob } from "./api.ts";

function job(id: string, status: BackgroundJob["status"]): BackgroundJob {
  return {
    id,
    job_type: "course_generate",
    status,
    progress: 0,
    result_resource_id: null,
    error_message: null,
    attempts: 0,
    created_at: "2026-09-17T00:00:00Z",
    started_at: null,
    finished_at: null,
    updated_at: "2026-09-17T00:00:00Z",
  };
}

test("only tracked active-to-terminal job transitions refresh courses", () => {
  const previous = [
    job("completed-before", "completed"),
    job("tracked", "processing"),
    job("still-running", "queued"),
  ];
  const current = [
    job("completed-before", "completed"),
    job("tracked", "completed"),
    job("still-running", "processing"),
    job("new-terminal", "failed"),
  ];

  assert.deepEqual(getTerminalCourseJobIds(previous, current), ["tracked"]);
});

test("new requests abort and supersede older responses", () => {
  const sequencer = createRequestSequencer();
  const first = sequencer.begin();
  const second = sequencer.begin();

  assert.equal(first.signal.aborted, true);
  assert.equal(sequencer.isCurrent(first.id), false);
  assert.equal(sequencer.isCurrent(second.id), true);

  sequencer.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(sequencer.isCurrent(second.id), false);
});

test("silent refresh queues without aborting a foreground list load", () => {
  const coordinator = createCourseRefreshCoordinator();
  const foreground = coordinator.beginForeground();

  assert.equal(coordinator.beginSilent(), null);
  assert.equal(foreground.signal.aborted, false);
  assert.equal(coordinator.finishForeground(foreground.id), true);

  const silent = coordinator.beginSilent();
  assert.ok(silent);
  const newerForeground = coordinator.beginForeground();
  assert.equal(silent.signal.aborted, true);
  assert.equal(
    coordinator.isForegroundCurrent(newerForeground.id),
    true
  );
});

test("active detail jobs retry transient errors with capped backoff", () => {
  assert.equal(shouldPollCourseJob("processing"), true);
  assert.equal(shouldPollCourseJob("completed"), false);
  assert.equal(getJobPollRetryDelay(1), 2_000);
  assert.equal(getJobPollRetryDelay(2), 4_000);
  assert.equal(getJobPollRetryDelay(20), 30_000);
});

test("modal Escape is blocked while busy and Tab wraps", () => {
  assert.equal(shouldDismissModal("Escape", false), true);
  assert.equal(shouldDismissModal("Escape", true), false);
  assert.equal(getNextFocusIndex(2, 3, false), 0);
  assert.equal(getNextFocusIndex(0, 3, true), 2);
});

test("KB load failure blocks implicit AI fallback", () => {
  const selection = createKnowledgeBaseSelection([], true);
  assert.match(
    validateCourseSourceSubmission({
      topic: "Python",
      selection,
      knowledgeBaseError: "加载失败",
      pureAiExplicit: false,
    }) || "",
    /知识库/
  );
  assert.equal(
    validateCourseSourceSubmission({
      topic: "Python",
      selection,
      knowledgeBaseError: "加载失败",
      pureAiExplicit: true,
    }),
    null
  );
});

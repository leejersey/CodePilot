import assert from "node:assert/strict";
import test from "node:test";

import { creatorJobNotice } from "./courseAdmin.ts";
import {
  canRebuildCreatorCourse,
  canSubmitCreatorCourseForReview,
  countCreatorCoursesByStatus,
  creatorCourseStatusHint,
  filterCreatorCourses,
} from "./courseExperience.ts";
import {
  canSubmitKnowledgeBaseForReview,
  knowledgeBaseReviewLabel,
  knowledgeBaseUsageHint,
} from "./creatorStudio.ts";
import {
  creatorRebuildSourceSelection,
  isKnowledgeBaseUnselectable,
} from "./knowledgeBaseSelection.ts";

test("creator course actions follow the shared lifecycle rules", () => {
  assert.equal(canRebuildCreatorCourse("draft"), true);
  assert.equal(canRebuildCreatorCourse("rejected"), true);
  assert.equal(canRebuildCreatorCourse("pending_review"), false);
  assert.equal(canRebuildCreatorCourse("published"), false);
  assert.equal(canRebuildCreatorCourse("archived"), false);
  assert.equal(canSubmitCreatorCourseForReview("draft"), true);
  assert.equal(canSubmitCreatorCourseForReview("rejected"), true);
  assert.equal(canSubmitCreatorCourseForReview("pending_review"), false);
  assert.equal(canSubmitCreatorCourseForReview("published"), false);
});

test("published courses explain that only administrators can rebuild", () => {
  assert.match(creatorCourseStatusHint("published"), /管理员/);
  assert.match(creatorCourseStatusHint("pending_review"), /审核/);
  assert.match(creatorCourseStatusHint("rejected"), /重建/);
  assert.equal(creatorCourseStatusHint("unknown-status"), "");
});

test("status filter keeps every course only for the all tab", () => {
  const courses = [
    { id: "a", status: "draft" },
    { id: "b", status: "published" },
    { id: "c", status: "draft" },
  ];

  assert.deepEqual(
    filterCreatorCourses(courses, "").map((item) => item.id),
    ["a", "b", "c"]
  );
  assert.deepEqual(
    filterCreatorCourses(courses, "draft").map((item) => item.id),
    ["a", "c"]
  );
  assert.deepEqual(filterCreatorCourses(courses, "archived"), []);
});

test("tab counts include a total under the all key", () => {
  const counts = countCreatorCoursesByStatus([
    { status: "draft" },
    { status: "draft" },
    { status: "rejected" },
  ]);

  assert.equal(counts[""], 3);
  assert.equal(counts.draft, 2);
  assert.equal(counts.rejected, 1);
  assert.equal(counts.published ?? 0, 0);
});

test("rebuild defaults to the course's authoritative knowledge bases", () => {
  assert.deepEqual(
    creatorRebuildSourceSelection({
      source_type: "knowledge_base",
      knowledge_base_ids: ["kb-one", "kb-two", "kb-one"],
    }),
    { pureAi: false, knowledgeBaseIds: ["kb-one", "kb-two"] }
  );
  assert.deepEqual(
    creatorRebuildSourceSelection({
      source_type: "ai_generated",
      knowledge_base_ids: [],
    }),
    { pureAi: true, knowledgeBaseIds: [] }
  );
  // A knowledge-base course that lost its bindings degrades to pure AI instead of an invalid request.
  assert.deepEqual(
    creatorRebuildSourceSelection({
      source_type: "knowledge_base",
      knowledge_base_ids: [],
    }),
    { pureAi: true, knowledgeBaseIds: [] }
  );
  assert.deepEqual(
    creatorRebuildSourceSelection({ source_type: null }),
    { pureAi: true, knowledgeBaseIds: [] }
  );
});

test("only finished creator jobs can be dismissed", () => {
  assert.deepEqual(
    creatorJobNotice({ job_type: "course_generate", status: "processing", progress: 40 }),
    { tone: "running", text: "课程生成进行中 · 40%", dismissible: false }
  );
  assert.deepEqual(
    creatorJobNotice({ job_type: "course_rebuild", status: "completed", progress: 100 }),
    { tone: "success", text: "课程重建已完成", dismissible: true }
  );
  assert.deepEqual(
    creatorJobNotice({
      job_type: "course_rebuild",
      status: "failed",
      progress: 60,
      error_message: "知识库暂无就绪内容",
    }),
    { tone: "error", text: "课程重建失败：知识库暂无就绪内容", dismissible: true }
  );
  assert.deepEqual(
    creatorJobNotice({ job_type: "course_generate", status: "failed", progress: 0 }),
    { tone: "error", text: "课程生成失败：未知错误", dismissible: true }
  );
  assert.equal(
    creatorJobNotice({ job_type: "course_generate", status: "cancelled", progress: 10 })
      .dismissible,
    true
  );
  assert.match(
    creatorJobNotice({ job_type: "course_generate", status: "retrying", progress: 20 }).text,
    /重试/
  );
});

test("knowledge base resubmission is offered only for a creator's rejected base", () => {
  assert.equal(
    canSubmitKnowledgeBaseForReview({ approval_status: "rejected" }, false),
    true
  );
  assert.equal(
    canSubmitKnowledgeBaseForReview({ approval_status: "pending" }, false),
    false
  );
  assert.equal(
    canSubmitKnowledgeBaseForReview({ approval_status: "approved" }, false),
    false
  );
  // Administrator knowledge bases are auto-approved; the backend rejects a submit with 409.
  assert.equal(
    canSubmitKnowledgeBaseForReview({ approval_status: "rejected" }, true),
    false
  );
});

test("knowledge base review labels describe sharing, not usability", () => {
  assert.equal(
    knowledgeBaseReviewLabel({
      approval_status: "approved",
      visibility: "platform_public",
    }),
    "已通过 · 平台共享"
  );
  assert.equal(
    knowledgeBaseReviewLabel({ approval_status: "approved", visibility: "private" }),
    "已通过 · 仅自己可用"
  );
  // 审核只决定能否共享给他人，自有库始终可用于自己的课程，标签不得暗示不可用。
  assert.equal(knowledgeBaseReviewLabel({ approval_status: "rejected" }), "共享未通过");
  assert.equal(knowledgeBaseReviewLabel({}), "共享审核中");
});

test("selector only blocks bases that cannot produce content", () => {
  // 后端 /selectable 已保证可选性，待审核的自有库不得在前端再被置灰。
  assert.equal(
    isKnowledgeBaseUnselectable({
      status: "active",
      approval_status: "pending",
      ready_document_count: 4,
    }),
    false
  );
  assert.equal(
    isKnowledgeBaseUnselectable({
      status: "active",
      approval_status: "approved",
      ready_document_count: 0,
      document_count: 3,
    }),
    true
  );
  assert.equal(
    isKnowledgeBaseUnselectable({
      status: "archived",
      approval_status: "approved",
      ready_document_count: 2,
    }),
    true
  );
});

test("own knowledge bases are always usable for one's own courses", () => {
  assert.match(knowledgeBaseUsageHint({ approval_status: "pending" }), /自己的课程/);
  assert.match(knowledgeBaseUsageHint({ approval_status: "rejected" }), /自己的课程/);
  assert.match(
    knowledgeBaseUsageHint({ approval_status: "approved", visibility: "platform_public" }),
    /其他创作者/
  );
  assert.equal(
    knowledgeBaseUsageHint({ approval_status: "approved", visibility: "private" }),
    "仅自己可用于课程生成。"
  );
});

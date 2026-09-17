import assert from "node:assert/strict";
import test from "node:test";

import {
  listCourseJobs,
  listCreatorCourses,
  submitCourseForReview,
  submitKnowledgeBaseReview,
} from "./api.ts";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("creator course list uses the owner-scoped backend route", async () => {
  let url = "";
  globalThis.fetch = async (input) => {
    url = String(input);
    return jsonResponse([
      {
        id: "course-one",
        status: "rejected",
        source_type: "knowledge_base",
        knowledge_base_ids: ["kb-one"],
        knowledge_base_names: ["Python"],
        review_note: "需要补充案例",
      },
    ]);
  };

  const courses = await listCreatorCourses();

  assert.equal(url, "/api/v1/courses/creator/mine");
  assert.equal(courses[0].review_note, "需要补充案例");
  assert.deepEqual(courses[0].knowledge_base_ids, ["kb-one"]);
});

test("submitting a course for review posts to the creator route", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return jsonResponse({
      id: "course-one",
      status: "pending_review",
      review_note: null,
      submitted_for_review_at: "2026-09-17T00:00:00Z",
    });
  };

  const course = await submitCourseForReview("course-one");

  assert.equal(requests[0]?.url, "/api/v1/courses/course-one/submit-review");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(course.status, "pending_review");
  assert.equal(course.submitted_for_review_at, "2026-09-17T00:00:00Z");
});

test("creator job polling reuses the creator-scoped course job route", async () => {
  let url = "";
  globalThis.fetch = async (input) => {
    url = String(input);
    return jsonResponse([]);
  };

  await listCourseJobs();

  assert.equal(url, "/api/v1/jobs/admin/courses?limit=200");
});

test("knowledge base resubmission posts to the creator submit-review route", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return jsonResponse({ id: "kb-one", approval_status: "pending" });
  };

  const kb = await submitKnowledgeBaseReview("kb-one");

  assert.equal(requests[0]?.url, "/api/v1/knowledge-bases/kb-one/submit-review");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(kb.approval_status, "pending");
});

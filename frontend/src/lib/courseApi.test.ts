import assert from "node:assert/strict";
import test from "node:test";

import {
  adminGetCourse,
  adminListCourseJobs,
  adminListCourses,
  enrollCourse,
  generateCourse,
  getCourseJob,
  listMyEnrollments,
  listPublishedCourses,
  listSelectableKnowledgeBases,
  reviewCourse,
} from "./api.ts";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("admin course list sends status and pagination filters", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return jsonResponse({ items: [], total: 0, page: 3, page_size: 12 });
  };

  await adminListCourses({ status: "pending_review", page: 3, pageSize: 12 });

  assert.equal(
    requests[0]?.url,
    "/api/v1/courses/admin/all?status=pending_review&page=3&page_size=12"
  );
});

test("course generation sends an explicit mutually exclusive source", async () => {
  let body = "";
  globalThis.fetch = async (_url, init) => {
    body = String(init?.body);
    return jsonResponse({ id: "job-one" });
  };

  await generateCourse({
    topic: "TypeScript",
    difficulty: "intermediate",
    user_background: "",
    pure_ai: false,
    knowledge_base_ids: ["kb-one"],
  });

  assert.deepEqual(JSON.parse(body), {
    topic: "TypeScript",
    difficulty: "intermediate",
    user_background: "",
    pure_ai: false,
    knowledge_base_ids: ["kb-one"],
  });
});

test("course review trims notes and uses the admin review route", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return jsonResponse({});
  };

  await reviewCourse("course-one", "reject", "  Missing examples  ");

  assert.equal(requests[0]?.url, "/api/v1/courses/admin/course-one/review");
  assert.equal(requests[0]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    decision: "reject",
    note: "Missing examples",
  });
});

test("admin course detail uses the metadata-safe admin route", async () => {
  let url = "";
  globalThis.fetch = async (input) => {
    url = String(input);
    return jsonResponse({
      id: "course-one",
      current_version_number: 4,
      source_type: "knowledge_base",
      knowledge_base_ids: ["kb-one"],
      knowledge_base_names: ["Python"],
      review_note: "Ready",
    });
  };

  const course = await adminGetCourse("course-one");

  assert.equal(url, "/api/v1/courses/admin/course-one");
  assert.equal(course.current_version_number, 4);
  assert.deepEqual(course.knowledge_base_ids, ["kb-one"]);
  assert.equal(course.review_note, "Ready");
});

test("selectable knowledge bases and course job polling use backend routes", async () => {
  const urls: string[] = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return jsonResponse([]);
  };

  await listSelectableKnowledgeBases();
  await getCourseJob("job-one");

  assert.deepEqual(urls, [
    "/api/v1/knowledge-bases/selectable",
    "/api/v1/jobs/job-one",
  ]);
});

test("public catalog only sends the filters the learner picked", async () => {
  const urls: string[] = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return jsonResponse({ items: [], total: 0, page: 1, page_size: 12 });
  };

  await listPublishedCourses({ page: 2, pageSize: 12 });
  await listPublishedCourses({
    search: "  异步编程  ",
    difficulty: "advanced",
  });

  assert.deepEqual(urls, [
    "/api/v1/courses?page=2&page_size=12",
    "/api/v1/courses?page=1&page_size=12&search=%E5%BC%82%E6%AD%A5%E7%BC%96%E7%A8%8B&difficulty=advanced",
  ]);
});

test("enrolling posts to the idempotent course enroll route", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return jsonResponse({
      id: "enrollment-one",
      course_id: "course-one",
      active_version_id: "version-one",
      status: "active",
      enrolled_at: "2026-01-01T00:00:00Z",
    });
  };

  const enrollment = await enrollCourse("course-one");

  assert.equal(requests[0]?.url, "/api/v1/courses/course-one/enroll");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(enrollment.active_version_id, "version-one");
});

test("my enrollments carry the compatible learning target and progress", async () => {
  let url = "";
  globalThis.fetch = async (input) => {
    url = String(input);
    return jsonResponse([
      {
        id: "enrollment-one",
        course_id: "course-one",
        active_version_id: "version-one",
        status: "active",
        enrolled_at: "2026-01-01T00:00:00Z",
        course: { id: "course-one", topic: "Python", difficulty: "beginner" },
        learning_path_id: "path-one",
        completed_chapters: 2,
        total_chapters: 8,
        progress: 25,
      },
    ]);
  };

  const enrollments = await listMyEnrollments({ page: 1, pageSize: 20 });

  assert.equal(url, "/api/v1/courses/me/enrollments?page=1&page_size=20");
  assert.equal(enrollments[0].learning_path_id, "path-one");
  assert.equal(enrollments[0].progress, 25);
  assert.equal(enrollments[0].course.topic, "Python");
});

test("admin course jobs use the platform-wide endpoint", async () => {
  let url = "";
  globalThis.fetch = async (input) => {
    url = String(input);
    return jsonResponse([]);
  };

  await adminListCourseJobs();

  assert.equal(url, "/api/v1/jobs/admin/courses?limit=200");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  chapterCompletionOutcome,
  continueLearningCandidate,
  courseJoinAction,
  creatorActionsForStatus,
  enrollmentLearningTarget,
  isActiveNavRoute,
  isEnrollableAccount,
  isOwnPrivateCourse,
  isPublicRoute,
  learningItemPresentation,
  mergeEnrollmentsWithLegacyPaths,
  navigableEnrollments,
  toLoginWithReturnTo,
} from "./courseExperience.ts";

test("catalog and dynamic course detail routes are public", () => {
  assert.equal(isPublicRoute("/courses"), true);
  assert.equal(isPublicRoute("/courses/course-one"), true);
  assert.equal(isPublicRoute("/courses/course-one/extra"), false);
  assert.equal(isPublicRoute("/creator/courses"), false);
});

test("login returnTo preserves a safe course detail target", () => {
  assert.equal(
    toLoginWithReturnTo("/courses/course-one?ref=home"),
    "/auth/login?returnTo=%2Fcourses%2Fcourse-one%3Fref%3Dhome"
  );
});

test("enrollment target uses authoritative compatible path only", () => {
  assert.equal(
    enrollmentLearningTarget({ learning_path_id: "path-one", legacy_path_id: "legacy" }),
    "/learn/path-one"
  );
  assert.equal(enrollmentLearningTarget({ learning_path_id: null, legacy_path_id: "legacy" }), "/learn/legacy");
  assert.equal(enrollmentLearningTarget({ learning_path_id: null, legacy_path_id: null }), null);
});

test("my-courses hides historical enrollments without a learning entry", () => {
  const items = navigableEnrollments([
    { id: "ok", learning_path_id: "path-one", progress: 29 },
    { id: "legacy-ok", learning_path_id: null, legacy_path_id: "legacy-one", progress: 10 },
    { id: "broken", learning_path_id: null, legacy_path_id: null, progress: 0 },
  ]);
  assert.deepEqual(
    items.map((item) => item.id),
    ["ok", "legacy-ok"]
  );
});

test("enrollments replace matching legacy paths and preserve unmatched paths", () => {
  const merged = mergeEnrollmentsWithLegacyPaths(
    [{ id: "enrollment", learning_path_id: "path-one", course: { topic: "Python" } }],
    [
      { id: "path-one", topic: "Old Python" },
      { id: "path-two", topic: "Rust" },
    ]
  );
  assert.deepEqual(merged.map((item) => [item.kind, item.id]), [
    ["enrollment", "enrollment"],
    ["legacy", "path-two"],
  ]);
});

test("an anonymous signed session is not an enrollable account", () => {
  assert.equal(isEnrollableAccount({ auth_provider: "email" }), true);
  assert.equal(isEnrollableAccount({ auth_provider: "anonymous" }), false);
  assert.equal(isEnrollableAccount(null), false);
});

test("joining a course without a compatible path never navigates", () => {
  assert.deepEqual(
    courseJoinAction({
      user: { auth_provider: "email" },
      course: { learning_path_id: null, legacy_path_id: null },
      returnTo: "/courses/course-one",
    }),
    { kind: "unavailable" }
  );
  assert.deepEqual(
    courseJoinAction({
      user: null,
      course: { learning_path_id: null },
      returnTo: "/courses/course-one",
    }),
    { kind: "unavailable" }
  );
});

test("joining a course sends anonymous visitors to login and members to the workspace", () => {
  assert.deepEqual(
    courseJoinAction({
      user: { auth_provider: "anonymous" },
      course: { learning_path_id: "path-one" },
      returnTo: "/courses/course-one",
    }),
    { kind: "login", href: "/auth/login?returnTo=%2Fcourses%2Fcourse-one" }
  );
  assert.deepEqual(
    courseJoinAction({
      user: { auth_provider: "email" },
      course: { learning_path_id: "path-one" },
      returnTo: "/courses/course-one",
    }),
    { kind: "enroll", target: "/learn/path-one" }
  );
});

test("continue learning prefers the newest unfinished navigable enrollment", () => {
  assert.equal(
    continueLearningCandidate([
      { id: "no-path", learning_path_id: null, progress: 10 },
      { id: "unfinished", learning_path_id: "path-two", progress: 40 },
      { id: "older", learning_path_id: "path-three", progress: 5 },
    ])?.id,
    "unfinished"
  );
  assert.equal(
    continueLearningCandidate([
      { id: "done", learning_path_id: "path-one", progress: 100 },
    ])?.id,
    "done"
  );
  assert.equal(
    continueLearningCandidate([
      { id: "no-path", learning_path_id: null, progress: 0 },
    ]),
    null
  );
  assert.equal(continueLearningCandidate([]), null);
});

test("nav highlighting matches whole segments instead of string prefixes", () => {
  assert.equal(isActiveNavRoute("/learn", "/learn"), true);
  assert.equal(isActiveNavRoute("/learn/path-one", "/learn"), true);
  assert.equal(isActiveNavRoute("/learners", "/learn"), false);
  assert.equal(isActiveNavRoute("/courses/course-one", "/courses"), true);
  assert.equal(isActiveNavRoute("/courses", "/learn"), false);
  assert.equal(isActiveNavRoute("/", "/"), true);
  assert.equal(isActiveNavRoute("/courses", "/"), false);
});

test("a migrated personal path is the viewer's own private course, not a platform listing", () => {
  const own = {
    author_id: "user-one",
    visibility: "private",
    status: "draft",
    topic: "Rust",
  };
  assert.equal(isOwnPrivateCourse(own, "user-one"), true);
  assert.equal(isOwnPrivateCourse({ ...own, visibility: "published", status: "published" }, "user-one"), false);
  assert.equal(isOwnPrivateCourse(own, "someone-else"), false);
});

test("my-courses labels a mapped personal path as self-built and does not offer a doomed delete", () => {
  const item = {
    kind: "enrollment" as const,
    id: "enrollment",
    value: {
      id: "enrollment",
      learning_path_id: "path-one",
      course: {
        topic: "Rust",
        author_id: "user-one",
        visibility: "private",
        status: "draft",
      },
    },
  };
  const learner = learningItemPresentation(item, { id: "user-one", role: "learner" });
  assert.equal(learner.origin, "self");
  assert.equal(learner.badgeLabel, "我的自建路线");
  assert.equal(learner.removal.kind, "blocked");
  if (learner.removal.kind === "blocked") {
    assert.match(learner.removal.reason, /管理员/);
  }

  const admin = learningItemPresentation(item, { id: "user-one", role: "admin" });
  assert.equal(admin.removal.kind, "delete");
  if (admin.removal.kind === "delete") {
    assert.equal(admin.removal.pathId, "path-one");
  }

  const platform = learningItemPresentation(
    {
      ...item,
      value: {
        ...item.value,
        course: {
          topic: "Python 入门",
          author_id: "admin-one",
          visibility: "published",
          status: "published",
        },
      },
    },
    { id: "user-one", role: "learner" }
  );
  assert.equal(platform.origin, "platform");
  assert.equal(platform.badgeLabel, "平台课程");
  assert.equal(platform.removal.kind, "hidden");

  const unmatched = learningItemPresentation(
    { kind: "legacy", id: "path-two", value: { id: "path-two", topic: "Go" } },
    { id: "user-one", role: "learner" }
  );
  assert.equal(unmatched.origin, "self");
  assert.equal(unmatched.removal.kind, "delete");
});

test("preview chapter completion is not treated as a recorded pass", () => {
  assert.equal(chapterCompletionOutcome({ preview: true }).kind, "preview");
  assert.match(chapterCompletionOutcome({ preview: true }).message, /不记录/);
  assert.equal(chapterCompletionOutcome({ preview: false }).kind, "completed");
  assert.equal(chapterCompletionOutcome({}).kind, "completed");
});

test("creator lifecycle actions prevent published rebuilds", () => {
  assert.deepEqual(creatorActionsForStatus("draft"), ["view", "rebuild", "submit_review"]);
  assert.deepEqual(creatorActionsForStatus("rejected"), ["view", "rebuild", "submit_review"]);
  assert.deepEqual(creatorActionsForStatus("pending_review"), ["view"]);
  assert.deepEqual(creatorActionsForStatus("published"), ["view"]);
});

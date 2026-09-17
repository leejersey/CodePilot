import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_REBUILD_CONFIRM_MESSAGE,
  legacyRebuildAffordance,
  type LegacyRebuildEligibility,
} from "./legacyPathRebuild.ts";

function eligibility(
  overrides: Partial<LegacyRebuildEligibility> = {}
): LegacyRebuildEligibility {
  return {
    can_rebuild: true,
    reason: "eligible",
    mapped_course_id: null,
    mapped_course_status: null,
    ...overrides,
  };
}

test("a governed course points at the course flow instead of legacy rebuild", () => {
  const affordance = legacyRebuildAffordance(
    eligibility({
      can_rebuild: false,
      reason: "governed_course",
      mapped_course_id: "course-one",
      mapped_course_status: "published",
    })
  );
  assert.equal(affordance.kind, "governed");
  assert.equal(
    affordance.kind === "governed" ? affordance.courseHref : null,
    "/courses/course-one"
  );
});

test("the governance notice names whoever can actually rebuild", () => {
  const notice = (status: string) => {
    const affordance = legacyRebuildAffordance(
      eligibility({
        can_rebuild: false,
        reason: "governed_course",
        mapped_course_id: "course-one",
        mapped_course_status: status,
      })
    );
    return affordance.kind === "governed" ? affordance.notice : "";
  };

  // 私有草稿/被拒课程由作者在创作台重建；已发布课程必须走管理员，以保护审核。
  assert.match(notice("draft"), /创作者工作台/);
  assert.match(notice("rejected"), /创作者工作台/);
  assert.match(notice("published"), /管理员/);
  assert.doesNotMatch(notice("published"), /创作者工作台/);
  assert.match(notice("pending_review"), /审核/);
});

test("callers who cannot rebuild are never shown a dead button", () => {
  assert.deepEqual(
    legacyRebuildAffordance(eligibility({ can_rebuild: false, reason: "forbidden" })),
    { kind: "hidden" }
  );
  assert.deepEqual(legacyRebuildAffordance(null), { kind: "hidden" });
  assert.deepEqual(legacyRebuildAffordance(undefined), { kind: "hidden" });
});

test("an eligible personal legacy path offers rebuild with truthful copy", () => {
  const affordance = legacyRebuildAffordance(eligibility());
  assert.equal(affordance.kind, "rebuild");
  assert.equal(
    affordance.kind === "rebuild" ? affordance.confirmMessage : "",
    LEGACY_REBUILD_CONFIRM_MESSAGE
  );
  assert.equal(LEGACY_REBUILD_CONFIRM_MESSAGE.includes("学习进度会重置"), false);
  assert.equal(LEGACY_REBUILD_CONFIRM_MESSAGE.includes("归档保留"), true);
});

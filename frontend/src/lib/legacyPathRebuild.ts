/** 后端 GET /paths/{id}/rebuild-eligibility 的返回体。 */
export interface LegacyRebuildEligibility {
  can_rebuild: boolean;
  reason: string;
  mapped_course_id: string | null;
  mapped_course_status: string | null;
}

export type LegacyRebuildAffordance =
  | { kind: "hidden" }
  | { kind: "governed"; courseHref: string; notice: string }
  | { kind: "rebuild"; confirmMessage: string };

/** 旧版重建只归档旧章节，不会删除练习或提交记录；章节进度会从第一章重新开始。 */
export const LEGACY_REBUILD_CONFIRM_MESSAGE =
  "将根据平台知识库重新生成章节大纲。旧章节及其练习、提交记录会归档保留，新章节需要从第一章重新学习。是否继续？";

const GOVERNANCE_PREAMBLE =
  "本课程已纳入平台课程治理，内容更新需要通过课程重建流程发布新版本，以保留所有学员的进度与提交记录。";

/** 谁能重建取决于课程状态：草稿归作者，已发布归管理员。 */
function governedCourseNotice(status: string | null): string {
  if (status === "draft" || status === "rejected") {
    return `${GOVERNANCE_PREAMBLE}该课程仍是私有草稿，作者可在创作者工作台重建（需要创作者权限）。`;
  }
  if (status === "pending_review") {
    return `${GOVERNANCE_PREAMBLE}该课程正在等待审核，审核期间不能重建。`;
  }
  return `${GOVERNANCE_PREAMBLE}该课程已发布，只能由管理员重建。`;
}

export function legacyRebuildAffordance(
  eligibility: LegacyRebuildEligibility | null | undefined
): LegacyRebuildAffordance {
  if (!eligibility) return { kind: "hidden" };
  if (eligibility.mapped_course_id) {
    return {
      kind: "governed",
      courseHref: `/courses/${eligibility.mapped_course_id}`,
      notice: governedCourseNotice(eligibility.mapped_course_status),
    };
  }
  if (!eligibility.can_rebuild) return { kind: "hidden" };
  return { kind: "rebuild", confirmMessage: LEGACY_REBUILD_CONFIRM_MESSAGE };
}

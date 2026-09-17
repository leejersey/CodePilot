/** 创作者知识库审核状态展示规则（纯函数，供创作台使用）。 */

export interface CreatorKnowledgeBaseLike {
  approval_status?: string;
  visibility?: string;
}

/** 管理员知识库自动通过，后端提交审核会返回 409；只有被拒绝的创作者知识库需要重新提交。 */
export function canSubmitKnowledgeBaseForReview(
  kb: CreatorKnowledgeBaseLike,
  isAdmin: boolean
): boolean {
  if (isAdmin) return false;
  return kb.approval_status === "rejected";
}

/** 审核只决定知识库能否共享给他人，不影响作者本人使用。 */
export function knowledgeBaseReviewLabel(kb: CreatorKnowledgeBaseLike): string {
  if (kb.approval_status === "approved") {
    return kb.visibility === "platform_public"
      ? "已通过 · 平台共享"
      : "已通过 · 仅自己可用";
  }
  if (kb.approval_status === "rejected") return "共享未通过";
  return "共享审核中";
}

export function knowledgeBaseUsageHint(kb: CreatorKnowledgeBaseLike): string {
  if (kb.approval_status === "approved" && kb.visibility === "platform_public") {
    return "已共享到平台，其他创作者也可用它生成课程。";
  }
  if (kb.approval_status === "approved") {
    return "仅自己可用于课程生成。";
  }
  return "共享审核不影响使用：随时可用它生成自己的课程，课程上架时再由管理员审核。";
}

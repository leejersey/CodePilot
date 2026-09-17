export interface KnowledgeBaseSelection {
  pureAi: boolean;
  knowledgeBaseIds: string[];
}

export function createKnowledgeBaseSelection(
  knowledgeBaseIds: string[] = [],
  pureAi = knowledgeBaseIds.length === 0
): KnowledgeBaseSelection {
  const uniqueIds = [...new Set(knowledgeBaseIds)];
  const normalizedPureAi = pureAi || uniqueIds.length === 0;
  return {
    pureAi: normalizedPureAi,
    knowledgeBaseIds: normalizedPureAi ? [] : uniqueIds,
  };
}

export interface CourseSourceLike {
  source_type?: "ai_generated" | "knowledge_base" | null;
  knowledge_base_ids?: string[];
}

/** 重建默认沿用课程当前版本权威绑定的知识库；绑定缺失时安全降级为纯 AI。 */
export function creatorRebuildSourceSelection(
  course: CourseSourceLike
): KnowledgeBaseSelection {
  return createKnowledgeBaseSelection(
    course.knowledge_base_ids || [],
    course.source_type !== "knowledge_base"
  );
}

export interface SelectableKnowledgeBaseLike {
  status?: string;
  document_count?: number;
  ready_document_count?: number;
  /** 后端已按授权过滤，审核状态在这里被刻意忽略。 */
  approval_status?: string;
}

/**
 * 后端 /knowledge-bases/selectable 已按授权规则过滤，审核状态不再决定可选性；
 * 这里只拦截确实无法产出内容的库（已归档、或没有就绪文档）。
 */
export function isKnowledgeBaseUnselectable(
  kb: SelectableKnowledgeBaseLike
): boolean {
  const readyCount = kb.ready_document_count ?? kb.document_count ?? 0;
  return (Boolean(kb.status) && kb.status !== "active") || readyCount === 0;
}

export function choosePureAi(): KnowledgeBaseSelection {
  return { pureAi: true, knowledgeBaseIds: [] };
}

export function chooseKnowledgeBase(
  selection: KnowledgeBaseSelection,
  knowledgeBaseId: string
): KnowledgeBaseSelection {
  const selected = selection.knowledgeBaseIds.includes(knowledgeBaseId);
  const knowledgeBaseIds = selected
    ? selection.knowledgeBaseIds.filter((id) => id !== knowledgeBaseId)
    : [...selection.knowledgeBaseIds, knowledgeBaseId];
  return createKnowledgeBaseSelection(knowledgeBaseIds, false);
}

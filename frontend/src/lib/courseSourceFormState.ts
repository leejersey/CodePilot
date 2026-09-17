import type { KnowledgeBaseSelection } from "./knowledgeBaseSelection.ts";

export interface CourseSourceSubmissionState {
  topic: string;
  selection: KnowledgeBaseSelection;
  knowledgeBaseError?: string;
  pureAiExplicit: boolean;
}

export function validateCourseSourceSubmission({
  topic,
  selection,
  knowledgeBaseError,
  pureAiExplicit,
}: CourseSourceSubmissionState): string | null {
  if (topic.trim().length < 2) {
    return "课程主题至少需要 2 个字符。";
  }
  if (knowledgeBaseError && !(selection.pureAi && pureAiExplicit)) {
    return "知识库加载失败。请重试，或明确选择纯 AI 模式。";
  }
  if (!selection.pureAi && selection.knowledgeBaseIds.length === 0) {
    return "请选择知识库，或明确选择纯 AI 模式。";
  }
  return null;
}

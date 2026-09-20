/**
 * API 工具封装 — 全站前后端联调统一入口
 */

import type { LegacyRebuildEligibility } from "./legacyPathRebuild.ts";

// 浏览器默认走 Next.js 同源代理，避免 localhost / 127.0.0.1 / 预览域名导致 CORS。
// 独立部署前后端时仍可通过 NEXT_PUBLIC_API_URL 显式覆盖。
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
export const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

// ══════════════════════════════════════════
//  TypeScript 类型
// ══════════════════════════════════════════

export interface TestCase {
  input: string;
  expected: string;
  hidden: boolean;
}

export interface ExerciseSourceKb {
  id: string;
  name: string;
}

export interface Exercise {
  id: string;
  chapter_id: string | null;
  language: string;
  tags: string[] | null;
  title: string;
  description: string;
  starter_code: string | null;
  test_cases: TestCase[] | null;
  difficulty: string;
  source_kbs?: ExerciseSourceKb[] | null;
  status?: "draft" | "published" | "archived" | string;
  judge_mode?: string;
  validation_status?: "unverified" | "verified" | "failed" | string;
  validated_at?: string | null;
  reference_solution?: string | null;
  created_at: string;
}

export interface ExerciseGenerateRequest {
  language: string;
  difficulty: string;
  topic: string;
  chapter_id?: string;
  knowledge_base_ids: string[];
  publish?: boolean;
}

export type AccountRole = "learner" | "admin" | "super_admin";
export type AccountStatus = "active" | "disabled";

export interface AdminUser {
  id: string;
  email: string | null;
  nickname: string;
  avatar_url: string | null;
  auth_provider: string;
  role: AccountRole;
  status: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface AdminUserList {
  items: AdminUser[];
  total: number;
  page: number;
  page_size: number;
  stats: Record<"total" | "super_admin" | "admin" | "learner" | "active" | "disabled", number>;
}

export interface BackgroundJob {
  id: string;
  job_type:
    | "document_ingest"
    | "exercise_generate"
    | "path_generate"
    | "course_generate"
    | "course_rebuild"
    | string;
  status: "queued" | "processing" | "retrying" | "completed" | "failed" | "cancelled";
  progress: number;
  result_resource_id: string | null;
  error_message: string | null;
  attempts: number;
  payload?: BackgroundJobPayload | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

export interface BackgroundJobPayload {
  topic?: string;
  course_id?: string;
  pure_ai?: boolean;
  knowledge_base_ids?: string[];
  [key: string]: string | number | boolean | string[] | null | undefined;
}

export interface SubmissionResponse {
  submission_id: string;
  submitted_code?: string | null;
  result: "pass" | "fail" | "error";
  score: number | null;
  ai_feedback: string | null;
  test_results: {
    case: number;
    passed: boolean;
    hidden?: boolean;
    status?: string;
    time?: string | null;
    memory?: number | null;
    input?: string;
    expected?: string;
    actual?: string;
    stderr?: string | null;
  }[] | null;
  execution_time?: string | null;
  memory?: number | null;
  trusted: boolean;
  judge_source: "judge0" | "llm" | string;
  created_at?: string | null;
}

export interface ChapterExerciseRecommendation extends Exercise {
  attempted: boolean;
  passed: boolean;
  best_score: number | null;
}

export interface ChapterPractice {
  exercises: ChapterExerciseRecommendation[];
  next_chapter: Chapter | null;
}

export interface ChapterOutline {
  order: number;
  title: string;
  summary: string;
  covers?: string[];
}

export interface RagProvenance {
  used: boolean;
  source_type: "knowledge_base" | "ai_generated" | string;
  kb_ids: string[];
  kb_names: string[];
  doc_count: number;
  doc_filenames: string[];
  uncovered_docs: string[];
  generated_at: string | null;
}

export interface PathOutline {
  total_chapters: number;
  estimated_hours: number;
  prerequisites: string[];
  chapters: ChapterOutline[];
  rag?: RagProvenance | null;
}

export interface LearningPath {
  id: string;
  topic: string;
  difficulty: string;
  outline: PathOutline | null;
  status: string;
  created_at: string;
}

export type CourseStatus =
  | "draft"
  | "pending_review"
  | "rejected"
  | "published"
  | "archived";

export type CourseDifficulty = "beginner" | "intermediate" | "advanced";

/** 公开目录条目：后端 CourseCatalogItem，不含审核与内部主体 ID */
export interface CourseCatalogItem {
  id: string;
  topic: string;
  difficulty: CourseDifficulty | string;
  status: CourseStatus | string;
  visibility: "private" | "published" | string;
  created_at: string;
  updated_at: string;
}

export interface AuthoredCourseItem extends CourseCatalogItem {
  author_id: string;
}

export interface CourseCatalogList {
  items: CourseCatalogItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface CourseDetail extends CourseCatalogItem {
  current_version_id: string | null;
  /** 兼容学习工作区目标，由后端 legacy_path_id 映射而来 */
  learning_path_id: string | null;
}

export interface Enrollment {
  id: string;
  course_id: string;
  active_version_id: string;
  status: string;
  enrolled_at: string;
}

export interface CourseEnrollment extends Enrollment {
  course: AuthoredCourseItem;
  learning_path_id: string | null;
  completed_chapters: number;
  total_chapters: number;
  progress: number;
}

export interface AdminCourse extends CourseDetail {
  author_id: string;
  current_version_number: number | null;
  source_type: "ai_generated" | "knowledge_base" | null;
  knowledge_base_ids: string[];
  knowledge_base_names: string[];
  review_note: string | null;
  reviewer_id: string | null;
  submitted_for_review_at: string | null;
  reviewed_at: string | null;
  published_at: string | null;
}

export type Course = AdminCourse;

/** 提交审核返回体：后端 CourseSubmitReviewResponse */
export interface CourseReviewSubmission extends CourseDetail {
  review_note: string | null;
  submitted_for_review_at: string | null;
}

export interface CourseChapter {
  id: string;
  version_id: string;
  sort_order: number;
  title: string;
  summary: string | null;
  content: Record<string, unknown> | null;
  status: string | null;
  completed_at: string | null;
}

export interface CourseList {
  items: AdminCourse[];
  total: number;
  page: number;
  page_size: number;
}

export interface CourseGenerateRequest {
  topic: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  user_background: string;
  pure_ai: boolean;
  knowledge_base_ids: string[];
}

export interface CourseRebuildRequest extends Omit<CourseGenerateRequest, "topic"> {
  topic?: string;
}

export interface Chapter {
  id: string;
  path_id: string;
  sort_order: number;
  title: string;
  summary: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  preview?: boolean;
}

export interface Conversation {
  id: string;
  chapter_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  token_count: number | null;
  created_at: string;
  metadata?: {
    images?: { key?: string; url?: string; mime?: string; name?: string }[];
  } | null;
}

export interface PathProgress {
  id: string;
  topic: string;
  difficulty: string;
  status: string;
  total_chapters: number;
  completed_chapters: number;
  progress: number;
  source_type?: "knowledge_base" | "ai_generated" | string;
  kb_names?: string[];
  created_at: string;
  updated_at: string;
}

/** 课程来源：知识库 RAG vs 纯 AI */
export function getPathSourceLabel(sourceType?: string | null): {
  type: "knowledge_base" | "ai_generated";
  label: string;
  short: string;
} {
  if (sourceType === "knowledge_base") {
    return { type: "knowledge_base", label: "知识库课程", short: "知识库" };
  }
  return { type: "ai_generated", label: "AI 生成课程", short: "AI 生成" };
}

export interface ProgressStats {
  paths: { total: number };
  chapters: { total: number; completed: number; in_progress: number; completion_rate: number };
  exercises: { total: number; passed: number; pass_rate: number };
  streak_days: number;
}

export interface ActivityItem {
  date: string;
  count: number;
}

export interface SkillItem {
  topic: string;
  total: number;
  completed: number;
  mastery: number;
  attempts?: number;
}

export interface LearningTimeSummary {
  today_seconds: number;
  total_seconds: number;
  daily: { date: string; seconds: number }[];
}

export interface KnowledgePoint {
  topic: string;
  mastery: number;
  attempts: number;
  exercises: number;
  weak: boolean;
}

export interface WeakPoint extends KnowledgePoint {
  recommended_exercises: {
    id: string;
    title: string;
    chapter_id: string | null;
  }[];
}

export interface WeakPointSummary {
  knowledge_points: KnowledgePoint[];
  weak_points: WeakPoint[];
}

export interface CodeRunResponse {
  output: string;
  has_error: boolean;
  status: string;
  stderr?: string | null;
  compile_output?: string | null;
  time?: string | null;
  memory?: number | null;
  trusted: boolean;
  judge_source: "judge0" | "llm" | string;
}

// ══════════════════════════════════════════
//  通用 fetch 封装
// ══════════════════════════════════════════

export function getAuthHeaders(json = true): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("codepilot_token") : null;
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

function parseErrorDetail(err: unknown): string {
  if (!err || typeof err !== "object") return "请求失败";
  const detail = (err as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => (typeof d === "object" && d && "msg" in d ? String((d as { msg: string }).msg) : String(d))).join("; ");
  }
  return "请求失败";
}

export async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "请求失败" }));
    throw new Error(parseErrorDetail(err) || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ══════════════════════════════════════════
//  Learning Path API
// ══════════════════════════════════════════

export async function generatePath(req: {
  topic: string;
  difficulty?: string;
  user_background?: string;
  knowledge_base_ids?: string[];
}): Promise<BackgroundJob> {
  return fetchAPI<BackgroundJob>("/api/v1/paths/generate", {
    method: "POST",
    body: JSON.stringify({
      topic: req.topic,
      difficulty: req.difficulty || "intermediate",
      user_background: req.user_background || "",
      knowledge_base_ids: req.knowledge_base_ids || [],
    }),
  });
}

export async function getPath(pathId: string): Promise<LearningPath> {
  return fetchAPI<LearningPath>(`/api/v1/paths/${pathId}`);
}

export async function deletePath(pathId: string): Promise<void> {
  await fetchAPI<void>(`/api/v1/paths/${pathId}`, { method: "DELETE" });
}

export async function getPathChapters(pathId: string): Promise<Chapter[]> {
  return fetchAPI<Chapter[]>(`/api/v1/paths/${pathId}/chapters`);
}

export async function getPathKnowledgeBases(pathId: string): Promise<KnowledgeBase[]> {
  return fetchAPI<KnowledgeBase[]>(`/api/v1/paths/${pathId}/knowledge-bases`);
}

/** 旧版重建入口是否可用；纳入课程治理的路径必须改走 /courses/{id}/rebuild。 */
export async function getPathRebuildEligibility(
  pathId: string
): Promise<LegacyRebuildEligibility> {
  return fetchAPI<LegacyRebuildEligibility>(
    `/api/v1/paths/${pathId}/rebuild-eligibility`
  );
}

export async function bindPathKnowledgeBases(
  pathId: string,
  knowledge_base_ids: string[]
): Promise<KnowledgeBase[]> {
  return fetchAPI<KnowledgeBase[]>(`/api/v1/paths/${pathId}/knowledge-bases`, {
    method: "PUT",
    body: JSON.stringify({ knowledge_base_ids }),
  });
}

export async function rebuildPathFromKb(
  pathId: string,
  knowledge_base_ids?: string[]
): Promise<LearningPath> {
  return fetchAPI<LearningPath>(`/api/v1/paths/${pathId}/rebuild-from-kb`, {
    method: "POST",
    body: JSON.stringify({ knowledge_base_ids: knowledge_base_ids || [] }),
  });
}

// ══════════════════════════════════════════
//  Course API
// ══════════════════════════════════════════

export async function listPublishedCourses(params: {
  search?: string;
  difficulty?: CourseDifficulty;
  page?: number;
  pageSize?: number;
} = {}, options?: RequestInit): Promise<CourseCatalogList> {
  const query = new URLSearchParams();
  query.set("page", String(params.page || 1));
  query.set("page_size", String(params.pageSize || 12));
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.difficulty) query.set("difficulty", params.difficulty);
  return fetchAPI<CourseCatalogList>(`/api/v1/courses?${query}`, options);
}

export async function enrollCourse(courseId: string): Promise<Enrollment> {
  return fetchAPI<Enrollment>(`/api/v1/courses/${courseId}/enroll`, {
    method: "POST",
  });
}

export async function listMyEnrollments(params: {
  page?: number;
  pageSize?: number;
} = {}, options?: RequestInit): Promise<CourseEnrollment[]> {
  const query = new URLSearchParams();
  query.set("page", String(params.page || 1));
  query.set("page_size", String(params.pageSize || 20));
  return fetchAPI<CourseEnrollment[]>(
    `/api/v1/courses/me/enrollments?${query}`,
    options
  );
}

/** 创作者本人的课程（后端 GET /courses/creator/mine，按 author_id 过滤） */
export async function listCreatorCourses(
  options?: RequestInit
): Promise<AdminCourse[]> {
  return fetchAPI<AdminCourse[]>("/api/v1/courses/creator/mine", options);
}

export async function submitCourseForReview(
  courseId: string
): Promise<CourseReviewSubmission> {
  return fetchAPI<CourseReviewSubmission>(
    `/api/v1/courses/${courseId}/submit-review`,
    { method: "POST" }
  );
}

export async function adminListCourses(params: {
  status?: CourseStatus;
  page?: number;
  pageSize?: number;
} = {}, options?: RequestInit): Promise<CourseList> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  query.set("page", String(params.page || 1));
  query.set("page_size", String(params.pageSize || 20));
  return fetchAPI<CourseList>(`/api/v1/courses/admin/all?${query}`, options);
}

export async function generateCourse(
  body: CourseGenerateRequest
): Promise<BackgroundJob> {
  return fetchAPI<BackgroundJob>("/api/v1/courses/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function reviewCourse(
  courseId: string,
  decision: "approve" | "reject",
  note?: string
): Promise<AdminCourse> {
  return fetchAPI<AdminCourse>(`/api/v1/courses/admin/${courseId}/review`, {
    method: "PATCH",
    body: JSON.stringify({ decision, note: note?.trim() || null }),
  });
}

export async function updateCourseStatus(
  courseId: string,
  status: "published" | "archived"
): Promise<AdminCourse> {
  return fetchAPI<AdminCourse>(`/api/v1/courses/admin/${courseId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function rebuildCourse(
  courseId: string,
  body: CourseRebuildRequest
): Promise<BackgroundJob> {
  return fetchAPI<BackgroundJob>(`/api/v1/courses/${courseId}/rebuild`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getCourse(
  courseId: string,
  options?: RequestInit
): Promise<CourseDetail> {
  return fetchAPI<CourseDetail>(`/api/v1/courses/${courseId}`, options);
}

export async function adminGetCourse(
  courseId: string,
  options?: RequestInit
): Promise<AdminCourse> {
  return fetchAPI<AdminCourse>(`/api/v1/courses/admin/${courseId}`, options);
}

export async function getCourseChapters(
  courseId: string,
  options?: RequestInit
): Promise<CourseChapter[]> {
  return fetchAPI<CourseChapter[]>(
    `/api/v1/courses/${courseId}/chapters`,
    options
  );
}

// ══════════════════════════════════════════
//  Chapter API
// ══════════════════════════════════════════

export async function getChapter(chapterId: string): Promise<Chapter> {
  return fetchAPI<Chapter>(`/api/v1/chapters/${chapterId}`);
}

export async function updateChapterStatus(
  chapterId: string,
  status: "locked" | "unlocked" | "in_progress" | "completed"
): Promise<Chapter> {
  return fetchAPI<Chapter>(`/api/v1/chapters/${chapterId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function recordLearningHeartbeat(
  chapterId: string,
  sessionId: string | null,
  active: boolean
): Promise<{ session_id: string; counted_seconds: number; session_seconds: number }> {
  return fetchAPI(`/api/v1/chapters/${chapterId}/heartbeat`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, active }),
  });
}

export interface ChapterSkill {
  id: string;
  chapter_id: string;
  sort_order: number;
  title: string;
  goal: string | null;
  objectives: string[] | null;
  teach_prompt: string | null;
  status: string;
  estimated_minutes: number | null;
  progress_status: "locked" | "active" | "passed" | "needs_review";
  mastery_score: number;
  attempts: number;
  passed_at: string | null;
}

export async function getChapterSkills(chapterId: string): Promise<{ chapter_id: string; skills: ChapterSkill[] }> {
  return fetchAPI(`/api/v1/chapters/${chapterId}/skills`);
}

export async function startSkill(skillId: string): Promise<ChapterSkill> {
  return fetchAPI(`/api/v1/skills/${skillId}/start`, { method: "POST" });
}

export async function completeSkill(skillId: string): Promise<ChapterSkill> {
  return fetchAPI(`/api/v1/skills/${skillId}/complete`, { method: "POST" });
}

// ══════════════════════════════════════════
//  Conversation API
// ══════════════════════════════════════════

export async function createConversation(req: {
  chapter_id?: string;
  title?: string;
}): Promise<Conversation> {
  return fetchAPI<Conversation>("/api/v1/conversations", {
    method: "POST",
    body: JSON.stringify({
      chapter_id: req.chapter_id || null,
      title: req.title || "学习对话",
    }),
  });
}

export async function getConversation(convId: string): Promise<Conversation> {
  return fetchAPI<Conversation>(`/api/v1/conversations/${convId}`);
}

/** 当前用户在该章节下最近的对话；没有则返回 null */
export async function getConversationByChapter(
  chapterId: string
): Promise<Conversation | null> {
  try {
    return await fetchAPI<Conversation>(
      `/api/v1/conversations/by-chapter/${chapterId}`
    );
  } catch {
    return null;
  }
}

export async function getMessages(convId: string): Promise<Message[]> {
  return fetchAPI<Message[]>(`/api/v1/conversations/${convId}/messages`);
}

// ══════════════════════════════════════════
//  Exercise API
// ══════════════════════════════════════════

export async function listExercises(params?: {
  language?: string;
  difficulty?: string;
  skip?: number;
  limit?: number;
}): Promise<Exercise[]> {
  const query = new URLSearchParams();
  if (params?.language) query.set("language", params.language.toLowerCase());
  if (params?.difficulty) query.set("difficulty", params.difficulty.toLowerCase());
  if (params?.skip) query.set("skip", String(params.skip));
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return fetchAPI<Exercise[]>(`/api/v1/exercises${qs ? `?${qs}` : ""}`);
}

export async function listReadyKnowledgeBasesForExercises(): Promise<
  ExerciseSourceKb[]
> {
  return fetchAPI<ExerciseSourceKb[]>(
    "/api/v1/exercises/ready-knowledge-bases"
  );
}

export async function adminListExercises(params?: {
  status?: string;
  language?: string;
  difficulty?: string;
}): Promise<Exercise[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.language) query.set("language", params.language.toLowerCase());
  if (params?.difficulty) query.set("difficulty", params.difficulty.toLowerCase());
  const qs = query.toString();
  return fetchAPI<Exercise[]>(`/api/v1/exercises/admin${qs ? `?${qs}` : ""}`);
}

export async function adminGetExercise(id: string): Promise<Exercise> {
  return fetchAPI<Exercise>(`/api/v1/exercises/admin/${id}`);
}

export async function adminUpdateExercise(
  id: string,
  body: {
    title: string;
    description: string;
    language: string;
    difficulty: string;
    tags: string[];
    starter_code: string;
    reference_solution: string;
    test_cases: TestCase[];
  }
): Promise<Exercise> {
  return fetchAPI<Exercise>(`/api/v1/exercises/admin/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function adminValidateExercise(id: string): Promise<{
  valid: boolean;
  result: string;
  score: number;
  test_results: SubmissionResponse["test_results"];
}> {
  return fetchAPI(`/api/v1/exercises/admin/${id}/validate`, { method: "POST" });
}

export async function updateExerciseStatus(
  id: string,
  status: "draft" | "published" | "archived"
): Promise<Exercise> {
  return fetchAPI<Exercise>(`/api/v1/exercises/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteExercise(id: string): Promise<void> {
  await fetchAPI<void>(`/api/v1/exercises/${id}`, { method: "DELETE" });
}

export async function getExercise(id: string): Promise<Exercise> {
  return fetchAPI<Exercise>(`/api/v1/exercises/${id}`);
}

export async function getChapterPractice(chapterId: string): Promise<ChapterPractice> {
  return fetchAPI<ChapterPractice>(
    `/api/v1/exercises/chapter/${chapterId}/recommendations`
  );
}

export async function generateExercise(req: ExerciseGenerateRequest): Promise<BackgroundJob> {
  return fetchAPI<BackgroundJob>("/api/v1/exercises/generate", {
    method: "POST",
    body: JSON.stringify({
      language: req.language,
      difficulty: req.difficulty,
      topic: req.topic || "",
      chapter_id: req.chapter_id || null,
      knowledge_base_ids: req.knowledge_base_ids || [],
      publish: req.publish ?? false,
    }),
  });
}

export async function submitExercise(exerciseId: string, code: string): Promise<SubmissionResponse> {
  return fetchAPI<SubmissionResponse>(`/api/v1/exercises/${exerciseId}/submit`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function listExerciseSubmissions(
  exerciseId: string,
  limit: number = 20
): Promise<SubmissionResponse[]> {
  return fetchAPI<SubmissionResponse[]>(
    `/api/v1/exercises/${exerciseId}/submissions?limit=${limit}`
  );
}

// ══════════════════════════════════════════
//  Progress API
// ══════════════════════════════════════════

export async function getProgressStats(): Promise<ProgressStats> {
  return fetchAPI<ProgressStats>("/api/v1/progress/stats");
}

export async function getProgressPaths(): Promise<PathProgress[]> {
  return fetchAPI<PathProgress[]>("/api/v1/progress/paths");
}

export async function getProgressActivity(): Promise<ActivityItem[]> {
  return fetchAPI<ActivityItem[]>("/api/v1/progress/activity");
}

export async function getSkillDistribution(): Promise<SkillItem[]> {
  return fetchAPI<SkillItem[]>("/api/v1/progress/skill-distribution");
}

export async function getLearningTime(): Promise<LearningTimeSummary> {
  return fetchAPI<LearningTimeSummary>("/api/v1/progress/learning-time");
}

export async function getWeakPoints(): Promise<WeakPointSummary> {
  return fetchAPI<WeakPointSummary>("/api/v1/progress/weak-points");
}

// ══════════════════════════════════════════
//  Code API
// ══════════════════════════════════════════

export async function runCode(
  code: string,
  language: string = "python",
  stdin: string = ""
): Promise<CodeRunResponse> {
  return fetchAPI<CodeRunResponse>("/api/v1/code/run", {
    method: "POST",
    body: JSON.stringify({ code, language, stdin }),
  });
}

export async function runModalCode(
  code: string,
  language: string = "python",
  dotenv: string = "",
  pathId: string,
  chapterId: string,
): Promise<CodeRunResponse> {
  return fetchAPI<CodeRunResponse>("/api/v1/code/run-modal", {
    method: "POST",
    body: JSON.stringify({
      code,
      language,
      dotenv,
      path_id: pathId,
      chapter_id: chapterId,
    }),
  });
}

// ══════════════════════════════════════════
//  Animation API
// ══════════════════════════════════════════

export async function generateAnimation(req: {
  topic: string;
  chapter_title?: string;
  chapter_summary?: string;
  lesson_content?: string;
}): Promise<unknown> {
  return fetchAPI("/api/v1/animation/generate", {
    method: "POST",
    body: JSON.stringify({
      topic: req.topic,
      chapter_title: req.chapter_title || "",
      chapter_summary: req.chapter_summary || "",
      lesson_content: req.lesson_content || "",
    }),
  });
}

/** 单知识点讲解（代码块旁「讲解」） */
export async function generateSnippetExplain(req: {
  code: string;
  language: string;
  context?: string;
}): Promise<unknown> {
  return fetchAPI("/api/v1/animation/generate-snippet", {
    method: "POST",
    body: JSON.stringify({
      code: req.code,
      language: req.language || "python",
      context: req.context || "",
    }),
  });
}

// ══════════════════════════════════════════
//  Knowledge Base API
// ══════════════════════════════════════════

export interface KnowledgeDocument {
  id: string;
  kb_id: string;
  filename: string;
  mime_type: string | null;
  byte_size: number;
  status: string;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  document_count: number;
  ready_document_count?: number;
  visibility?: "private" | "platform_public" | string;
  approval_status?: "pending" | "approved" | "rejected" | string;
  review_note?: string | null;
}

export interface KnowledgeBaseDetail extends KnowledgeBase {
  documents: KnowledgeDocument[];
}

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  return fetchAPI<KnowledgeBase[]>("/api/v1/knowledge-bases");
}

export async function listSelectableKnowledgeBases(
  options?: RequestInit
): Promise<KnowledgeBase[]> {
  return fetchAPI<KnowledgeBase[]>("/api/v1/knowledge-bases/selectable", options);
}

export async function createKnowledgeBase(req: {
  name: string;
  description?: string;
}): Promise<KnowledgeBase> {
  return fetchAPI<KnowledgeBase>("/api/v1/knowledge-bases", {
    method: "POST",
    body: JSON.stringify({
      name: req.name,
      description: req.description || "",
    }),
  });
}

/** 创作者重新提交自己的知识库审核；管理员知识库后端返回 409。 */
export async function submitKnowledgeBaseReview(
  kbId: string
): Promise<KnowledgeBase> {
  return fetchAPI<KnowledgeBase>(
    `/api/v1/knowledge-bases/${kbId}/submit-review`,
    { method: "POST" }
  );
}

export async function getKnowledgeBase(kbId: string): Promise<KnowledgeBaseDetail> {
  return fetchAPI<KnowledgeBaseDetail>(`/api/v1/knowledge-bases/${kbId}`);
}

export async function deleteKnowledgeBase(kbId: string): Promise<void> {
  await fetchAPI<void>(`/api/v1/knowledge-bases/${kbId}`, { method: "DELETE" });
}

export async function uploadKnowledgeDocument(
  kbId: string,
  file: File
): Promise<BackgroundJob> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/v1/knowledge-bases/${kbId}/documents`, {
    method: "POST",
    headers: getAuthHeaders(false),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "上传失败" }));
    throw new Error(parseErrorDetail(err) || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function deleteKnowledgeDocument(kbId: string, docId: string): Promise<void> {
  await fetchAPI<void>(`/api/v1/knowledge-bases/${kbId}/documents/${docId}`, {
    method: "DELETE",
  });
}

export async function getBackgroundJob(
  jobId: string,
  options?: RequestInit
): Promise<BackgroundJob> {
  return fetchAPI<BackgroundJob>(`/api/v1/jobs/${jobId}`, options);
}

export async function listBackgroundJobs(params: {
  jobType?: string;
  status?: string;
  limit?: number;
} = {}): Promise<BackgroundJob[]> {
  const query = new URLSearchParams();
  if (params.jobType) query.set("job_type", params.jobType);
  if (params.status) query.set("status", params.status);
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString();
  return fetchAPI<BackgroundJob[]>(`/api/v1/jobs${suffix ? `?${suffix}` : ""}`);
}

export async function getCourseJob(
  jobId: string,
  options?: RequestInit
): Promise<BackgroundJob> {
  return getBackgroundJob(jobId, options);
}

/**
 * 课程后台任务：后端按角色收窄可见范围 —— 管理员看全平台，创作者只看自己发起的任务。
 */
export async function listCourseJobs(
  options?: RequestInit
): Promise<BackgroundJob[]> {
  return fetchAPI<BackgroundJob[]>(
    "/api/v1/jobs/admin/courses?limit=200",
    options
  );
}

export async function adminListCourseJobs(
  options?: RequestInit
): Promise<BackgroundJob[]> {
  return listCourseJobs(options);
}

export async function retryBackgroundJob(jobId: string): Promise<BackgroundJob> {
  return fetchAPI<BackgroundJob>(`/api/v1/jobs/${jobId}/retry`, { method: "POST" });
}

// ══════════════════════════════════════════
//  Document learning mode
// ══════════════════════════════════════════

export interface DocStage {
  id: string;
  title: string;
  content: string;
  from_doc?: string;
}

export interface LearningDocsPayload {
  chapter_id: string;
  chapter_title: string;
  sources: {
    handout: {
      available: boolean;
      label: string;
      stages: DocStage[];
    };
    knowledge_base: {
      available: boolean;
      label: string;
      documents: { id: string; filename: string; byte_size: number }[];
    };
  };
}

export async function getChapterLearningDocs(
  chapterId: string
): Promise<LearningDocsPayload> {
  return fetchAPI<LearningDocsPayload>(
    `/api/v1/chapters/${chapterId}/learning-docs`
  );
}

export async function getChapterKbDocStages(
  chapterId: string,
  docId: string
): Promise<{ doc_id: string; filename: string; stages: DocStage[] }> {
  return fetchAPI(`/api/v1/chapters/${chapterId}/learning-docs/kb/${docId}`);
}

// ══════════════════════════════════════════
//  User LLM Settings（多档案）
// ══════════════════════════════════════════

export interface LlmPreset {
  id: string;
  label: string;
  base_url: string;
  default_model: string;
  hint: string;
}

export interface LlmProfile {
  id: string;
  name: string;
  provider: string;
  api_key_masked: string | null;
  has_api_key: boolean;
  base_url: string;
  model: string;
}

export interface LlmSettings {
  active_id: string | null;
  profiles: LlmProfile[];
  active_source: "platform" | "user" | string;
  active_provider: string;
  active_model: string;
  active_base_url: string;
  platform_model: string;
  platform_base_url: string;
  presets: LlmPreset[];
}

export interface LlmUsageSummary {
  month: string;
  monthly_token_quota: number;
  platform_tokens: number;
  remaining_platform_tokens: number;
  quota_percent: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  byok_tokens: number;
  request_count: number;
  estimated_cost_usd: number;
  pricing_configured: boolean;
  daily: { date: string; tokens: number }[];
}

export interface AdminLlmUsageSummary {
  month: string;
  request_count: number;
  total_tokens: number;
  estimated_cost_usd: number;
  pricing_configured: boolean;
  top_users: {
    user_id: string;
    email: string | null;
    nickname: string;
    tokens: number;
    estimated_cost_usd: number;
  }[];
}

export async function getMyLlmUsage(): Promise<LlmUsageSummary> {
  return fetchAPI<LlmUsageSummary>("/api/v1/usage/me");
}

export async function getAdminLlmUsage(): Promise<AdminLlmUsageSummary> {
  return fetchAPI<AdminLlmUsageSummary>("/api/v1/usage/admin/summary");
}

export async function updateUserLlmQuota(
  userId: string,
  monthlyTokenQuota: number
): Promise<{ user_id: string; monthly_token_quota: number }> {
  return fetchAPI(`/api/v1/usage/admin/users/${userId}/quota`, {
    method: "PUT",
    body: JSON.stringify({ monthly_token_quota: monthlyTokenQuota }),
  });
}

export interface ServiceHealth {
  status: string;
  version: string;
  services: Record<string, "ready" | "unavailable" | string>;
  monitoring: {
    sentry: "configured" | "disabled";
    webhook_alerts: "configured" | "disabled";
  };
}

export interface ErrorEvent {
  id: string;
  error_id: string;
  service: string;
  level: string;
  message: string;
  exception_type: string | null;
  request_id: string | null;
  user_id: string | null;
  path: string | null;
  method: string | null;
  status_code: number | null;
  details: Record<string, unknown>;
  resolved_at: string | null;
  created_at: string;
}

export interface ObservabilitySummary {
  errors_24h: number;
  unresolved: number;
  failed_jobs_24h: number;
  by_service: Record<string, number>;
  trend: { hour: string; count: number }[];
}

export async function getServiceHealth(): Promise<ServiceHealth> {
  return fetchAPI<ServiceHealth>("/health");
}

export async function getObservabilitySummary(): Promise<ObservabilitySummary> {
  return fetchAPI<ObservabilitySummary>("/api/v1/observability/admin/summary");
}

export async function listErrorEvents(params: {
  page?: number;
  pageSize?: number;
  service?: string;
  resolved?: boolean;
} = {}): Promise<{ items: ErrorEvent[]; total: number; page: number; page_size: number }> {
  const query = new URLSearchParams();
  query.set("page", String(params.page || 1));
  query.set("page_size", String(params.pageSize || 20));
  if (params.service) query.set("service", params.service);
  if (params.resolved !== undefined) query.set("resolved", String(params.resolved));
  return fetchAPI(`/api/v1/observability/admin/errors?${query}`);
}

export async function resolveErrorEvent(eventId: string): Promise<ErrorEvent> {
  return fetchAPI<ErrorEvent>(
    `/api/v1/observability/admin/errors/${eventId}/resolve`,
    { method: "PATCH" }
  );
}

export async function reportClientError(body: {
  message: string;
  stack?: string;
  path?: string;
  source?: string;
}): Promise<void> {
  await fetchAPI("/api/v1/observability/client-errors", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getLlmSettings(): Promise<LlmSettings> {
  return fetchAPI<LlmSettings>("/api/v1/settings/llm");
}

export async function setActiveLlmProfile(activeId: string | null): Promise<LlmSettings> {
  return fetchAPI<LlmSettings>("/api/v1/settings/llm/active", {
    method: "PUT",
    body: JSON.stringify({ active_id: activeId }),
  });
}

export async function createLlmProfile(body: {
  name: string;
  provider: string;
  api_key: string;
  base_url?: string;
  model?: string;
  set_active?: boolean;
}): Promise<LlmSettings> {
  return fetchAPI<LlmSettings>("/api/v1/settings/llm/profiles", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateLlmProfile(
  profileId: string,
  body: {
    name?: string;
    provider?: string;
    api_key?: string;
    base_url?: string;
    model?: string;
    keep_api_key?: boolean;
  }
): Promise<LlmSettings> {
  return fetchAPI<LlmSettings>(`/api/v1/settings/llm/profiles/${profileId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteLlmProfile(profileId: string): Promise<LlmSettings> {
  return fetchAPI<LlmSettings>(`/api/v1/settings/llm/profiles/${profileId}`, {
    method: "DELETE",
  });
}

export async function testLlmSettings(): Promise<{
  ok: boolean;
  source: string;
  provider: string;
  model: string;
  reply: string;
}> {
  return fetchAPI("/api/v1/settings/llm/test", { method: "POST", body: "{}" });
}

export async function listAdminUsers(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  role?: AccountRole | "";
  status?: AccountStatus | "";
} = {}): Promise<AdminUserList> {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("page_size", String(params.pageSize));
  if (params.keyword) search.set("keyword", params.keyword);
  if (params.role) search.set("role", params.role);
  if (params.status) search.set("status", params.status);
  const query = search.toString();
  return fetchAPI<AdminUserList>(`/api/v1/admin/users${query ? `?${query}` : ""}`);
}

export async function updateAdminUserRole(
  userId: string,
  role: AccountRole
): Promise<AdminUser> {
  return fetchAPI<AdminUser>(`/api/v1/admin/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function updateAdminUserStatus(
  userId: string,
  status: AccountStatus
): Promise<AdminUser> {
  return fetchAPI<AdminUser>(`/api/v1/admin/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function resetAdminUserPassword(
  userId: string,
  temporaryPassword: string
): Promise<AdminUser> {
  return fetchAPI<AdminUser>(`/api/v1/admin/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ temporary_password: temporaryPassword }),
  });
}


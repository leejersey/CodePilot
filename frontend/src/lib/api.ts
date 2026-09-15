/**
 * API 工具封装 — 全站前后端联调统一入口
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

// ══════════════════════════════════════════
//  TypeScript 类型
// ══════════════════════════════════════════

export interface TestCase {
  input: string;
  expected: string;
  hidden: boolean;
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
  created_at: string;
}

export interface ExerciseGenerateRequest {
  language: string;
  difficulty: string;
  topic?: string;
  chapter_id?: string;
  knowledge_base_ids?: string[];
}

export interface SubmissionResponse {
  submission_id: string;
  result: "pass" | "fail" | "error";
  score: number | null;
  ai_feedback: string | null;
  test_results: { case: number; passed: boolean }[] | null;
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

export interface Chapter {
  id: string;
  path_id: string;
  sort_order: number;
  title: string;
  summary: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
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
}

export interface CodeRunResponse {
  output: string;
  has_error: boolean;
}

// ══════════════════════════════════════════
//  通用 fetch 封装
// ══════════════════════════════════════════

/** 获取或创建匿名用户 ID */
export function getAnonymousId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  let id = localStorage.getItem("anonymous_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("anonymous_id", id);
  }
  return id;
}

function getAuthHeaders(json = true): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("codepilot_token") : null;
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    headers["X-Anonymous-ID"] = getAnonymousId();
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
}): Promise<LearningPath> {
  return fetchAPI<LearningPath>("/api/v1/paths/generate", {
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

// ══════════════════════════════════════════
//  Conversation API
// ══════════════════════════════════════════

export async function createConversation(req: {
  chapter_id?: string;
  title?: string;
}): Promise<Conversation> {
  return fetchAPI<Conversation>("/api/v1/conversations/", {
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

export async function getExercise(id: string): Promise<Exercise> {
  return fetchAPI<Exercise>(`/api/v1/exercises/${id}`);
}

export async function generateExercise(req: ExerciseGenerateRequest): Promise<Exercise> {
  return fetchAPI<Exercise>("/api/v1/exercises/generate", {
    method: "POST",
    body: JSON.stringify({
      language: req.language,
      difficulty: req.difficulty,
      topic: req.topic || "",
      chapter_id: req.chapter_id || null,
      knowledge_base_ids: req.knowledge_base_ids || [],
    }),
  });
}

export async function submitExercise(exerciseId: string, code: string): Promise<SubmissionResponse> {
  return fetchAPI<SubmissionResponse>(`/api/v1/exercises/${exerciseId}/submit`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
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

// ══════════════════════════════════════════
//  Code API
// ══════════════════════════════════════════

export async function runCode(code: string, language: string = "python"): Promise<CodeRunResponse> {
  return fetchAPI<CodeRunResponse>("/api/v1/code/run", {
    method: "POST",
    body: JSON.stringify({ code, language }),
  });
}

// ══════════════════════════════════════════
//  Animation API
// ══════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateAnimation(req: {
  topic: string;
  chapter_title?: string;
  chapter_summary?: string;
  lesson_content?: string;
}): Promise<any> {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateSnippetExplain(req: {
  code: string;
  language: string;
  context?: string;
}): Promise<any> {
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
}

export interface KnowledgeBaseDetail extends KnowledgeBase {
  documents: KnowledgeDocument[];
}

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  return fetchAPI<KnowledgeBase[]>("/api/v1/knowledge-bases/");
}

export async function createKnowledgeBase(req: {
  name: string;
  description?: string;
}): Promise<KnowledgeBase> {
  return fetchAPI<KnowledgeBase>("/api/v1/knowledge-bases/", {
    method: "POST",
    body: JSON.stringify({
      name: req.name,
      description: req.description || "",
    }),
  });
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
): Promise<KnowledgeDocument> {
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


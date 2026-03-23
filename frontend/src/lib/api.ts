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
}

export interface PathOutline {
  total_chapters: number;
  estimated_hours: number;
  prerequisites: string[];
  chapters: ChapterOutline[];
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
  created_at: string;
  updated_at: string;
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

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("codepilot_token") : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    headers["X-Anonymous-ID"] = getAnonymousId();
  }
  return headers;
}

export async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "请求失败" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ══════════════════════════════════════════
//  Learning Path API
// ══════════════════════════════════════════

export async function generatePath(req: {
  topic: string;
  difficulty?: string;
  user_background?: string;
}): Promise<LearningPath> {
  return fetchAPI<LearningPath>("/api/v1/paths/generate", {
    method: "POST",
    body: JSON.stringify({
      topic: req.topic,
      difficulty: req.difficulty || "intermediate",
      user_background: req.user_background || "",
    }),
  });
}

export async function getPath(pathId: string): Promise<LearningPath> {
  return fetchAPI<LearningPath>(`/api/v1/paths/${pathId}`);
}

export async function getPathChapters(pathId: string): Promise<Chapter[]> {
  return fetchAPI<Chapter[]>(`/api/v1/paths/${pathId}/chapters`);
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
    body: JSON.stringify(req),
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
export async function generateAnimation(topic: string): Promise<any> {
  return fetchAPI("/api/v1/animation/generate", {
    method: "POST",
    body: JSON.stringify({ topic }),
  });
}

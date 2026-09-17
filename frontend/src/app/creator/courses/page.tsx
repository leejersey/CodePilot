"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  BookOpen,
  Eye,
  Info,
  Loader2,
  PenLine,
  Plus,
  RefreshCw,
  SearchX,
  Send,
  X,
} from "lucide-react";
import { Card } from "@/components/common/Card";
import { CardSkeleton } from "@/components/common/Skeleton";
import { DifficultyBadge } from "@/components/common/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import {
  CourseSourceModal,
  type CourseSourceFormValue,
} from "@/components/admin/CourseSourceModal";
import { useDialog } from "@/components/DialogProvider";
import {
  generateCourse,
  listCourseJobs,
  listCreatorCourses,
  rebuildCourse,
  submitCourseForReview,
  type BackgroundJob,
  type Course,
} from "@/lib/api";
import {
  creatorJobNotice,
  getCourseStatusLabel,
  getTerminalCourseJobIds,
  getVisibleCourseJobs,
} from "@/lib/courseAdmin";
import {
  canRebuildCreatorCourse,
  canSubmitCreatorCourseForReview,
  countCreatorCoursesByStatus,
  creatorCourseStatusHint,
  filterCreatorCourses,
  type CreatorCourseStatusFilter,
} from "@/lib/courseExperience";
import {
  createKnowledgeBaseSelection,
  creatorRebuildSourceSelection,
} from "@/lib/knowledgeBaseSelection";
import {
  createCourseRefreshCoordinator,
  createRequestSequencer,
} from "@/lib/requestSequencing";

const STATUS_TABS: { key: CreatorCourseStatusFilter; label: string }[] = [
  { key: "", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "pending_review", label: "待审核" },
  { key: "rejected", label: "已拒绝" },
  { key: "published", label: "已发布" },
  { key: "archived", label: "已归档" },
];

const NOTICE_TONES: Record<string, string> = {
  running: "border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200",
  success:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  error: "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-300",
};

function statusTone(status: string) {
  if (status === "published")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
  if (status === "pending_review")
    return "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
  if (status === "rejected")
    return "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300";
  return "border-slate-300 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300";
}

export default function CreatorCoursesPage() {
  const { alert, confirm } = useDialog();
  const [courses, setCourses] = useState<Course[]>([]);
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<CreatorCourseStatusFilter>("");
  const [dismissedJobs, setDismissedJobs] = useState<Set<string>>(
    () => new Set()
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sourceModal, setSourceModal] = useState<
    { mode: "create" } | { mode: "rebuild"; course: Course } | null
  >(null);
  const courseRefreshes = useRef(createCourseRefreshCoordinator());
  const jobRequests = useRef(createRequestSequencer());
  const previousJobs = useRef<BackgroundJob[]>([]);

  const loadCourses = useCallback(async (silent = false) => {
    const refreshes = courseRefreshes.current;
    const request = silent
      ? refreshes.beginSilent()
      : refreshes.beginForeground();
    if (!request) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const items = await listCreatorCourses({ signal: request.signal });
      const current = silent
        ? refreshes.isSilentCurrent(request.id)
        : refreshes.isForegroundCurrent(request.id);
      if (!current) return;
      setCourses(items);
    } catch (err) {
      if (request.signal.aborted) return;
      setError(err instanceof Error ? err.message : "课程加载失败");
    } finally {
      if (!silent) {
        if (refreshes.isForegroundCurrent(request.id)) setLoading(false);
        if (refreshes.finishForeground(request.id)) {
          void loadCourses(true);
        }
      }
    }
  }, []);

  useEffect(() => {
    const refreshes = courseRefreshes.current;
    void loadCourses();
    return () => refreshes.cancel();
  }, [loadCourses]);

  const loadJobs = useCallback(async () => {
    const request = jobRequests.current.begin();
    try {
      const nextJobs = await listCourseJobs({ signal: request.signal });
      if (!jobRequests.current.isCurrent(request.id)) return;
      const finished = getTerminalCourseJobIds(previousJobs.current, nextJobs);
      previousJobs.current = nextJobs;
      setJobs(nextJobs);
      if (finished.length > 0) void loadCourses(true);
    } catch (err) {
      if (!request.signal.aborted) {
        setError(err instanceof Error ? err.message : "课程任务加载失败");
      }
    }
  }, [loadCourses]);

  useEffect(() => {
    const requests = jobRequests.current;
    let stopped = false;
    let timer: number | undefined;
    const poll = async () => {
      await loadJobs();
      if (!stopped) timer = window.setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      requests.cancel();
    };
  }, [loadJobs]);

  const visibleJobs = useMemo(
    () => getVisibleCourseJobs(jobs, dismissedJobs),
    [dismissedJobs, jobs]
  );
  const counts = useMemo(
    () => countCreatorCoursesByStatus(courses),
    [courses]
  );
  const visibleCourses = useMemo(
    () => filterCreatorCourses(courses, status),
    [courses, status]
  );

  function trackJob(job: BackgroundJob) {
    setJobs((current) => {
      const next = [job, ...current.filter((item) => item.id !== job.id)];
      previousJobs.current = next;
      return next;
    });
  }

  async function submitCreate(value: CourseSourceFormValue) {
    setBusyId("create");
    try {
      const job = await generateCourse({
        topic: value.topic,
        difficulty: value.difficulty,
        user_background: value.background,
        pure_ai: value.selection.pureAi,
        knowledge_base_ids: value.selection.knowledgeBaseIds,
      });
      trackJob(job);
      setSourceModal(null);
    } catch (err) {
      await alert({
        title: "创建失败",
        message: err instanceof Error ? err.message : "创建课程失败",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function submitRebuild(course: Course, value: CourseSourceFormValue) {
    setBusyId(course.id);
    try {
      const job = await rebuildCourse(course.id, {
        topic: value.topic,
        difficulty: value.difficulty,
        user_background: value.background,
        pure_ai: value.selection.pureAi,
        knowledge_base_ids: value.selection.knowledgeBaseIds,
      });
      trackJob(job);
      setSourceModal(null);
    } catch (err) {
      await alert({
        title: "重建失败",
        message: err instanceof Error ? err.message : "重建失败",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function requestReview(course: Course) {
    const ok = await confirm({
      title: "提交审核",
      message: `「${course.topic}」将提交管理员审核，审核期间不能继续重建。`,
      confirmText: "提交审核",
    });
    if (!ok) return;
    setBusyId(course.id);
    try {
      await submitCourseForReview(course.id);
      await loadCourses();
    } catch (err) {
      await alert({
        title: "提交失败",
        message: err instanceof Error ? err.message : "提交审核失败",
      });
    } finally {
      setBusyId(null);
    }
  }

  const modalCourse = sourceModal?.mode === "rebuild" ? sourceModal.course : null;
  const sourceInitialValue: CourseSourceFormValue = modalCourse
    ? {
        topic: modalCourse.topic,
        difficulty:
          modalCourse.difficulty as CourseSourceFormValue["difficulty"],
        background: "",
        selection: creatorRebuildSourceSelection(modalCourse),
      }
    : {
        topic: "",
        difficulty: "intermediate",
        background: "",
        selection: createKnowledgeBaseSelection([], true),
      };

  return (
    <>
      <div className="space-y-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 font-mono text-xs font-semibold text-secondary">
              CREATOR · STUDIO
            </p>
            <h1 className="flex items-center gap-2.5 font-headline text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              <PenLine size={26} className="text-secondary" />
              课程创作台
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-400">
              用纯 AI 或自己的知识库生成课程，重建到满意后提交管理员审核发布。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSourceModal({ mode: "create" })}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-primary-dim active:scale-95"
          >
            <Plus size={16} /> 创建课程
          </button>
        </div>

        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/5 dark:bg-white/5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key || "all"}
              type="button"
              onClick={() => setStatus(tab.key)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs ${
                status === tab.key
                  ? "bg-white font-bold text-primary shadow-xs dark:bg-primary/20"
                  : "text-slate-500"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 font-mono text-[10px] text-slate-400">
                {counts[tab.key] || 0}
              </span>
            </button>
          ))}
        </div>

        {visibleJobs.map((job) => {
          const notice = creatorJobNotice(job);
          return (
            <div
              key={job.id}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${NOTICE_TONES[notice.tone]}`}
            >
              <span className="flex items-center gap-2">
                {notice.tone === "running" && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                {notice.text}
              </span>
              {notice.dismissible && (
                <button
                  type="button"
                  aria-label="关闭任务提示"
                  onClick={() =>
                    setDismissedJobs((ids) => new Set(ids).add(job.id))
                  }
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 px-4 py-3 text-sm text-rose-500"
          >
            {error}
          </div>
        )}

        {loading ? (
          <CardSkeleton count={4} />
        ) : visibleCourses.length === 0 ? (
          <EmptyState
            icon={<SearchX size={28} />}
            title={courses.length === 0 ? "还没有创作课程" : "该状态下暂无课程"}
            description={
              courses.length === 0
                ? "创建第一门课程，AI 会生成章节大纲；你可以反复重建直到满意。"
                : "切换上方状态筛选查看其他课程。"
            }
            actionText="创建课程"
            onAction={() => setSourceModal({ mode: "create" })}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleCourses.map((course) => {
              const hint = creatorCourseStatusHint(course.status);
              const canRebuild = canRebuildCreatorCourse(course.status);
              const canSubmit = canSubmitCreatorCourseForReview(course.status);
              return (
                <Card key={course.id} className="p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${statusTone(course.status)}`}
                    >
                      {getCourseStatusLabel(course.status)}
                    </span>
                    <DifficultyBadge difficulty={course.difficulty} />
                    {course.source_type && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/20 px-2 py-0.5 text-[10px] text-violet-600 dark:text-violet-300">
                        {course.source_type === "ai_generated" ? (
                          <Bot size={10} />
                        ) : (
                          <BookOpen size={10} />
                        )}
                        {course.source_type === "ai_generated"
                          ? "纯 AI"
                          : `知识库 · ${course.knowledge_base_names.join("、")}`}
                      </span>
                    )}
                    {course.current_version_number !== null && (
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500 dark:border-white/10">
                        版本 {course.current_version_number}
                      </span>
                    )}
                  </div>
                  <h2 className="font-headline text-lg font-bold text-slate-900 dark:text-white">
                    {course.topic}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    更新于 {new Date(course.updated_at).toLocaleString("zh-CN")}
                  </p>
                  {course.status === "rejected" && (
                    <p className="mt-3 rounded-lg bg-rose-500/8 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
                      审核意见：{course.review_note || "管理员未填写具体意见"}
                    </p>
                  )}
                  {hint && (
                    <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
                      <Info size={13} className="mt-0.5 shrink-0" />
                      {hint}
                    </p>
                  )}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      href={`/courses/${course.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 px-3 py-1.5 text-xs text-cyan-700 dark:text-cyan-300"
                    >
                      <Eye size={13} /> 查看
                    </Link>
                    {canRebuild && (
                      <button
                        type="button"
                        disabled={busyId === course.id}
                        onClick={() =>
                          setSourceModal({ mode: "rebuild", course })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 px-3 py-1.5 text-xs text-violet-600 disabled:opacity-50 dark:text-violet-300"
                      >
                        <RefreshCw size={13} /> 重建
                      </button>
                    )}
                    {canSubmit && (
                      <button
                        type="button"
                        disabled={busyId === course.id}
                        onClick={() => void requestReview(course)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-600 disabled:opacity-50 dark:text-emerald-300"
                      >
                        <Send size={13} /> 提交审核
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {sourceModal && (
        <CourseSourceModal
          key={modalCourse?.id || "create"}
          title={modalCourse ? `重建「${modalCourse.topic}」` : "创建课程"}
          warning={
            modalCourse
              ? "重建会生成新版本并替换当前草稿内容，已有学习进度按章节标题迁移。"
              : ""
          }
          initialValue={sourceInitialValue}
          initialPureAiExplicit={modalCourse?.source_type === "ai_generated"}
          busy={busyId === "create" || busyId === modalCourse?.id}
          submitLabel={modalCourse ? "开始重建" : "加入生成队列"}
          onClose={() => setSourceModal(null)}
          onSubmit={(value) =>
            modalCourse ? submitRebuild(modalCourse, value) : submitCreate(value)
          }
        />
      )}
    </>
  );
}

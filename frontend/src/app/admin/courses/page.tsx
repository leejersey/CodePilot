"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BookOpen,
  Bot,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  SearchX,
  Send,
  X,
} from "lucide-react";
import { Card } from "@/components/common/Card";
import { CardSkeleton } from "@/components/common/Skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { AccessibleModal } from "@/components/AccessibleModal";
import {
  CourseSourceModal,
  type CourseSourceFormValue,
} from "@/components/admin/CourseSourceModal";
import { useDialog } from "@/components/DialogProvider";
import {
  adminListCourseJobs,
  adminListCourses,
  generateCourse,
  rebuildCourse,
  reviewCourse,
  updateCourseStatus,
  type BackgroundJob,
  type Course,
  type CourseStatus,
} from "@/lib/api";
import {
  getCourseActions,
  getCourseStatusLabel,
  getPublishCopy,
  getTerminalCourseJobIds,
  getVisibleCourseJobs,
} from "@/lib/courseAdmin";
import { createKnowledgeBaseSelection } from "@/lib/knowledgeBaseSelection";
import {
  createCourseRefreshCoordinator,
  createRequestSequencer,
} from "@/lib/requestSequencing";

const STATUS_TABS = [
  { key: "", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "pending_review", label: "待审核" },
  { key: "rejected", label: "已拒绝" },
  { key: "published", label: "已发布" },
  { key: "archived", label: "已归档" },
] as const;

const PAGE_SIZE = 12;

function statusTone(status: string) {
  if (status === "published") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
  if (status === "pending_review") return "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
  if (status === "rejected") return "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300";
  return "border-slate-300 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300";
}

export default function AdminCoursesPage() {
  const { alert, confirm } = useDialog();
  const [items, setItems] = useState<Course[]>([]);
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]["key"]>("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dismissedJobs, setDismissedJobs] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sourceModal, setSourceModal] = useState<
    { mode: "create" } | { mode: "rebuild"; course: Course } | null
  >(null);
  const [reviewing, setReviewing] = useState<Course | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"approve" | "reject">("approve");
  const [reviewNote, setReviewNote] = useState("");
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
      const courseData = await adminListCourses(
        {
          status: status ? (status as CourseStatus) : undefined,
          page,
          pageSize: PAGE_SIZE,
        },
        { signal: request.signal }
      );
      const current = silent
        ? refreshes.isSilentCurrent(request.id)
        : refreshes.isForegroundCurrent(request.id);
      if (!current) return;
      setItems(courseData.items);
      setTotal(courseData.total);
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
  }, [page, status]);

  useEffect(() => {
    const refreshes = courseRefreshes.current;
    void loadCourses();
    return () => refreshes.cancel();
  }, [loadCourses]);

  const loadJobs = useCallback(async () => {
    const request = jobRequests.current.begin();
    try {
      const nextJobs = await adminListCourseJobs({ signal: request.signal });
      if (!jobRequests.current.isCurrent(request.id)) return;
      const completed = getTerminalCourseJobIds(previousJobs.current, nextJobs);
      previousJobs.current = nextJobs;
      setJobs(nextJobs);
      if (completed.length > 0) void loadCourses(true);
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
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
      await alert({ title: "创建失败", message: err instanceof Error ? err.message : "创建课程失败" });
    } finally {
      setBusyId(null);
    }
  }

  async function submitReview() {
    if (!reviewing) return;
    if (reviewDecision === "reject" && !reviewNote.trim()) {
      await alert({ title: "需要审核意见", message: "拒绝课程时必须填写审核意见。" });
      return;
    }
    setBusyId(reviewing.id);
    try {
      await reviewCourse(reviewing.id, reviewDecision, reviewNote);
      setReviewing(null);
      await loadCourses();
    } catch (err) {
      await alert({ title: "审核失败", message: err instanceof Error ? err.message : "审核失败" });
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(course: Course, next: "published" | "archived") {
    const publishCopy = getPublishCopy(course.status);
    const ok = await confirm({
      title: next === "published" ? publishCopy.title : "归档课程",
      message: next === "published" ? publishCopy.message : "课程将从公开目录移除。",
      confirmText: next === "published" ? publishCopy.label : "归档",
      tone: next === "archived" ? "danger" : "default",
    });
    if (!ok) return;
    setBusyId(course.id);
    try {
      await updateCourseStatus(course.id, next);
      await loadCourses();
    } catch (err) {
      await alert({ title: "操作失败", message: err instanceof Error ? err.message : "状态更新失败" });
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
      await alert({ title: "重建失败", message: err instanceof Error ? err.message : "重建失败" });
    } finally {
      setBusyId(null);
    }
  }

  const modalCourse =
    sourceModal?.mode === "rebuild" ? sourceModal.course : null;
  const sourceInitialValue: CourseSourceFormValue = modalCourse
    ? {
        topic: modalCourse.topic,
        difficulty:
          modalCourse.difficulty as CourseSourceFormValue["difficulty"],
        background: "",
        selection: createKnowledgeBaseSelection(
          modalCourse.knowledge_base_ids,
          modalCourse.source_type !== "knowledge_base"
        ),
      }
    : {
        topic: "",
        difficulty: "intermediate",
        background: "",
        selection: createKnowledgeBaseSelection([], true),
      };

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-mono font-semibold text-primary">ADMIN · COURSES</p>
            <h1 className="font-headline text-3xl font-bold tracking-tight text-slate-900 dark:text-white">课程管理</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-400">
              创建、审核并维护平台课程版本与发布状态。管理员创建的草稿可直接发布；创作者提交的课程需先通过审核。
            </p>
          </div>
          <button type="button" onClick={() => setSourceModal({ mode: "create" })} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">
            <Plus size={16} /> 创建课程
          </button>
        </div>

        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/5 dark:bg-white/5">
          {STATUS_TABS.map((tab) => (
            <button key={tab.key || "all"} type="button" onClick={() => { setStatus(tab.key); setPage(1); }} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs ${status === tab.key ? "bg-white font-bold text-primary shadow-xs dark:bg-primary/20" : "text-slate-500"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {visibleJobs.map((job) => (
          <div key={job.id} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${job.status === "failed" ? "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-300" : "border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200"}`}>
            <span className="flex items-center gap-2">
              {["queued", "processing", "retrying"].includes(job.status) && <Loader2 size={14} className="animate-spin" />}
              {job.status === "completed" ? "课程后台任务已完成" : job.status === "failed" ? `任务失败：${job.error_message || "未知错误"}` : `课程后台任务进行中 · ${job.progress}%`}
            </span>
            {["completed", "failed", "cancelled"].includes(job.status) && (
              <button type="button" aria-label="关闭任务提示" onClick={() => setDismissedJobs((ids) => new Set(ids).add(job.id))}><X size={14} /></button>
            )}
          </div>
        ))}

        {error && <div role="alert" className="rounded-xl border border-rose-500/30 px-4 py-3 text-sm text-rose-500">{error}</div>}

        {loading ? <CardSkeleton count={4} /> : items.length === 0 ? (
          <EmptyState icon={<SearchX size={28} />} title="暂无课程" description="创建课程或切换状态筛选查看。" actionText="创建课程" onAction={() => setSourceModal({ mode: "create" })} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((course) => {
              const actions = getCourseActions(course.status);
              return (
                <Card key={course.id} className="p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono ${statusTone(course.status)}`}>{getCourseStatusLabel(course.status)}</span>
                    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500 dark:border-white/10">{course.difficulty}</span>
                    {course.source_type && <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/20 px-2 py-0.5 text-[10px] text-violet-600 dark:text-violet-300">{course.source_type === "ai_generated" ? <Bot size={10} /> : <BookOpen size={10} />}{course.source_type === "ai_generated" ? "纯 AI" : `知识库 · ${course.knowledge_base_names.join("、")}`}</span>}
                    {course.current_version_number !== null && <span title={course.current_version_id || undefined} className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500 dark:border-white/10">版本 {course.current_version_number}</span>}
                  </div>
                  <h2 className="font-headline text-lg font-bold text-slate-900 dark:text-white">{course.topic}</h2>
                  <p className="mt-1 text-xs text-slate-500">更新于 {new Date(course.updated_at).toLocaleString("zh-CN")}</p>
                  {course.review_note && <p className="mt-3 rounded-lg bg-rose-500/8 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">审核意见：{course.review_note}</p>}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link href={`/admin/courses/${course.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 px-3 py-1.5 text-xs text-cyan-700 dark:text-cyan-300"><Eye size={13} /> 查看</Link>
                    {actions.includes("review") && <button type="button" onClick={() => { setReviewing(course); setReviewDecision("approve"); setReviewNote(""); }} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-300"><Send size={13} /> 审核</button>}
                    {actions.includes("publish") && <button disabled={busyId === course.id} type="button" onClick={() => changeStatus(course, "published")} className="rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-300">{getPublishCopy(course.status).label}</button>}
                    {actions.includes("archive") && <button disabled={busyId === course.id} type="button" onClick={() => changeStatus(course, "archived")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-500 dark:border-white/10"><Archive size={13} /> 归档</button>}
                    {actions.includes("rebuild") && <button type="button" onClick={() => setSourceModal({ mode: "rebuild", course })} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 px-3 py-1.5 text-xs text-violet-600 dark:text-violet-300"><RefreshCw size={13} /> 重建</button>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {pageCount > 1 && <div className="flex items-center justify-center gap-3 text-xs"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">上一页</button><span>{page} / {pageCount} · 共 {total} 门</span><button disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">下一页</button></div>}
      </div>

      {sourceModal && (
        <CourseSourceModal
          key={modalCourse?.id || "create"}
          title={modalCourse ? `重建「${modalCourse.topic}」` : "创建课程"}
          warning={modalCourse?.status === "published" ? "已发布课程重建会强制生成并切换到新版本；此操作仅管理员可执行，现有学员将按后端版本策略更新。" : ""}
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

      {reviewing && (
        <AccessibleModal
          title="审核课程"
          className="max-w-md"
          busy={busyId === reviewing.id}
          onClose={() => setReviewing(null)}
        >
            <p className="mt-1 text-xs text-slate-500">{reviewing.topic}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(["approve", "reject"] as const).map((decision) => <button key={decision} data-autofocus={decision === "approve" ? "" : undefined} type="button" onClick={() => setReviewDecision(decision)} className={`rounded-xl border px-3 py-2 text-sm ${reviewDecision === decision ? "border-primary bg-primary/10 text-primary" : "border-slate-200 dark:border-white/10"}`}>{decision === "approve" ? "批准并发布" : "拒绝"}</button>)}
            </div>
            <label className="mt-4 block text-xs font-bold" htmlFor="review-note">审核意见{reviewDecision === "reject" ? "（必填）" : "（可选）"}</label>
            <textarea id="review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm outline-none focus:border-primary dark:border-white/10 dark:bg-surface-container-low" />
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busyId === reviewing.id} onClick={() => setReviewing(null)} className="rounded-xl border px-4 py-2 text-xs disabled:opacity-50">取消</button><button type="button" disabled={busyId === reviewing.id} onClick={submitReview} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-50">提交审核</button></div>
        </AccessibleModal>
      )}
    </>
  );
}

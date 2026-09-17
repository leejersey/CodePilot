"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Archive, BookOpen, Bot, Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/common/Card";
import {
  CourseSourceModal,
  type CourseSourceFormValue,
} from "@/components/admin/CourseSourceModal";
import { useDialog } from "@/components/DialogProvider";
import {
  adminGetCourse,
  getCourseJob,
  getCourseChapters,
  rebuildCourse,
  reviewCourse,
  updateCourseStatus,
  type AdminCourse,
  type BackgroundJob,
  type CourseChapter,
} from "@/lib/api";
import {
  getJobPollRetryDelay,
  getCourseActions,
  getCourseStatusLabel,
  getPublishCopy,
  shouldPollCourseJob,
} from "@/lib/courseAdmin";
import {
  createKnowledgeBaseSelection,
} from "@/lib/knowledgeBaseSelection";
import {
  createCourseRefreshCoordinator,
  createRequestSequencer,
} from "@/lib/requestSequencing";

export default function AdminCourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  const { alert, confirm } = useDialog();
  const [course, setCourse] = useState<AdminCourse | null>(null);
  const [chapters, setChapters] = useState<CourseChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [jobError, setJobError] = useState("");
  const [reviewDecision, setReviewDecision] = useState<"approve" | "reject">("approve");
  const [reviewNote, setReviewNote] = useState("");
  const [showRebuild, setShowRebuild] = useState(false);
  const [trackedJob, setTrackedJob] = useState<BackgroundJob | null>(null);
  const dataRefreshes = useRef(createCourseRefreshCoordinator());
  const jobRequests = useRef(createRequestSequencer());

  const load = useCallback(async (silent = false) => {
    const refreshes = dataRefreshes.current;
    const request = silent
      ? refreshes.beginSilent()
      : refreshes.beginForeground();
    if (!request) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const [courseData, chapterData] = await Promise.all([
        adminGetCourse(courseId, { signal: request.signal }),
        getCourseChapters(courseId, { signal: request.signal }),
      ]);
      const current = silent
        ? refreshes.isSilentCurrent(request.id)
        : refreshes.isForegroundCurrent(request.id);
      if (!current) return;
      setCourse(courseData);
      setChapters(chapterData);
    } catch (err) {
      if (request.signal.aborted) return;
      setError(err instanceof Error ? err.message : "课程详情加载失败");
    } finally {
      if (!silent) {
        if (refreshes.isForegroundCurrent(request.id)) setLoading(false);
        if (refreshes.finishForeground(request.id)) void load(true);
      }
    }
  }, [courseId]);

  useEffect(() => {
    const refreshes = dataRefreshes.current;
    void load();
    return () => refreshes.cancel();
  }, [load]);

  const trackedJobId = trackedJob?.id;
  const trackedJobActive = trackedJob
    ? shouldPollCourseJob(trackedJob.status)
    : false;
  useEffect(() => {
    if (!trackedJobId || !trackedJobActive) return;
    const requests = jobRequests.current;
    let stopped = false;
    let timer: number | undefined;
    let failureCount = 0;
    const poll = async () => {
      const request = jobRequests.current.begin();
      try {
        const next = await getCourseJob(trackedJobId, {
          signal: request.signal,
        });
        if (stopped || !jobRequests.current.isCurrent(request.id)) return;
        failureCount = 0;
        setJobError("");
        setTrackedJob(next);
        if (!shouldPollCourseJob(next.status)) {
          await load(true);
          return;
        }
        timer = window.setTimeout(poll, 2000);
      } catch (err) {
        if (request.signal.aborted || stopped) return;
        failureCount += 1;
        setJobError(
          err instanceof Error ? err.message : "重建任务状态暂时不可用"
        );
        timer = window.setTimeout(
          poll,
          getJobPollRetryDelay(failureCount)
        );
      }
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      requests.cancel();
    };
  }, [load, trackedJobActive, trackedJobId]);

  async function submitReview() {
    if (!course) return;
    if (reviewDecision === "reject" && !reviewNote.trim()) {
      await alert({ title: "需要审核意见", message: "拒绝课程时必须填写审核意见。" });
      return;
    }
    setBusy(true);
    try {
      await reviewCourse(course.id, reviewDecision, reviewNote);
      setReviewNote("");
      await load();
    } catch (err) {
      await alert({ title: "审核失败", message: err instanceof Error ? err.message : "审核失败" });
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: "published" | "archived") {
    if (!course) return;
    const publishCopy = getPublishCopy(course.status);
    const ok = await confirm({
      title: status === "published" ? publishCopy.title : "归档课程",
      message: status === "published" ? publishCopy.message : "课程将从公开目录移除。",
      confirmText: status === "published" ? publishCopy.label : "归档",
      tone: status === "archived" ? "danger" : "default",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await updateCourseStatus(course.id, status);
      await load();
    } catch (err) {
      await alert({ title: "操作失败", message: err instanceof Error ? err.message : "状态更新失败" });
    } finally {
      setBusy(false);
    }
  }

  async function submitRebuild(value: CourseSourceFormValue) {
    if (!course) return;
    setBusy(true);
    try {
      const job = await rebuildCourse(course.id, {
        topic: value.topic,
        difficulty: value.difficulty,
        user_background: value.background,
        pure_ai: value.selection.pureAi,
        knowledge_base_ids: value.selection.knowledgeBaseIds,
      });
      setJobError("");
      setTrackedJob(job);
      setShowRebuild(false);
      await alert({ title: "已加入重建队列", message: "此页面会跟踪任务，并在完成后刷新课程详情。" });
    } catch (err) {
      await alert({ title: "重建失败", message: err instanceof Error ? err.message : "重建失败" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  if (!course) return <div role="alert" className="mx-auto max-w-4xl rounded-xl border border-rose-500/30 p-5 text-rose-500">{error || "课程不存在"}</div>;

  const actions = getCourseActions(course.status);
  const rebuildInitialValue: CourseSourceFormValue = {
    topic: course.topic,
    difficulty: course.difficulty as CourseSourceFormValue["difficulty"],
    background: "",
    selection: createKnowledgeBaseSelection(
      course.knowledge_base_ids,
      course.source_type !== "knowledge_base"
    ),
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/admin/courses" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-primary"><ArrowLeft size={15} /> 返回课程管理</Link>
      {error && <div role="alert" className="rounded-xl border border-rose-500/30 px-4 py-3 text-sm text-rose-500">{error}</div>}

      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap gap-2 text-[10px]">
              <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-primary">{getCourseStatusLabel(course.status)}</span>
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-500 dark:border-white/10">{course.difficulty}</span>
              {course.source_type && <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/25 px-2 py-0.5 text-violet-600 dark:text-violet-300">{course.source_type === "ai_generated" ? <Bot size={10} /> : <BookOpen size={10} />}{course.source_type === "ai_generated" ? "纯 AI" : `知识库 · ${course.knowledge_base_names.join("、")}`}</span>}
            </div>
            <h1 className="font-headline text-3xl font-bold text-slate-900 dark:text-white">{course.topic}</h1>
            <p className="mt-2 text-xs text-slate-500">课程 ID：{course.id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.includes("publish") && <button disabled={busy} onClick={() => changeStatus("published")} className="rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-300">{getPublishCopy(course.status).label}</button>}
            {actions.includes("archive") && <button disabled={busy} onClick={() => changeStatus("archived")} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs"><Archive size={13} /> 归档</button>}
            {actions.includes("rebuild") && <button disabled={busy} onClick={() => setShowRebuild(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 px-3 py-1.5 text-xs text-violet-600 dark:text-violet-300"><RefreshCw size={13} /> 重建</button>}
          </div>
        </div>
        <dl className="mt-6 grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="作者 ID" value={course.author_id} />
          <Meta label="可见性" value={course.visibility} />
          <Meta label="当前版本" value={course.current_version_number === null ? "尚无版本" : `v${course.current_version_number} · ${course.current_version_id}`} />
          <Meta label="更新时间" value={new Date(course.updated_at).toLocaleString("zh-CN")} />
        </dl>
      </Card>

      {(course.review_note || course.submitted_for_review_at || course.reviewed_at) && (
        <Card className="p-5">
          <h2 className="font-headline text-lg font-bold">审核信息</h2>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{course.review_note || "无审核意见"}</p>
          <p className="mt-2 text-xs text-slate-500">
            {course.submitted_for_review_at && `提交：${new Date(course.submitted_for_review_at).toLocaleString("zh-CN")}`}
            {course.reviewed_at && ` · 审核：${new Date(course.reviewed_at).toLocaleString("zh-CN")}`}
          </p>
        </Card>
      )}

      {trackedJob && (
        <div
          role="status"
          className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-700 dark:text-cyan-200"
        >
          {["queued", "processing", "retrying"].includes(trackedJob.status)
            ? jobError
              ? `任务状态暂时不可用，正在重试：${jobError}`
              : `重建任务进行中 · ${trackedJob.progress}%`
            : trackedJob.status === "completed"
              ? "重建任务已完成，课程详情已刷新。"
              : `重建任务失败：${trackedJob.error_message || "未知错误"}`}
        </div>
      )}

      {actions.includes("review") && (
        <Card className="p-5">
          <h2 className="font-headline text-lg font-bold">课程审核</h2>
          <div className="mt-3 flex gap-2">{(["approve", "reject"] as const).map((value) => <button key={value} onClick={() => setReviewDecision(value)} className={`rounded-lg border px-3 py-1.5 text-xs ${reviewDecision === value ? "border-primary bg-primary/10 text-primary" : ""}`}>{value === "approve" ? "批准并发布" : "拒绝"}</button>)}</div>
          <label htmlFor="detail-review-note" className="mt-4 block text-xs font-bold">审核意见{reviewDecision === "reject" ? "（必填）" : "（可选）"}</label>
          <textarea id="detail-review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:border-white/10 dark:bg-surface-container-low" />
          <button disabled={busy} onClick={submitReview} className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-50">提交审核</button>
        </Card>
      )}

      {showRebuild && (
        <CourseSourceModal
          key={course.id}
          title={`重建「${course.topic}」`}
          warning={course.status === "published" ? "重建已发布课程会强制生成并切换新版本。此操作仅管理员可执行，现有学员将按后端版本策略更新。" : ""}
          initialValue={rebuildInitialValue}
          initialPureAiExplicit={course.source_type === "ai_generated"}
          busy={busy}
          submitLabel="开始重建"
          onClose={() => setShowRebuild(false)}
          onSubmit={submitRebuild}
        />
      )}

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-headline text-xl font-bold">当前章节</h2><span className="text-xs text-slate-500">{chapters.length} 章</span></div>
        {chapters.length === 0 ? <Card className="p-8 text-center text-sm text-slate-500">当前版本暂无章节。</Card> : <div className="space-y-3">{chapters.map((chapter) => <Card key={chapter.id} className="p-4"><div className="flex gap-3"><span className="font-mono text-xs text-primary">{String(chapter.sort_order).padStart(2, "0")}</span><div><h3 className="font-bold text-slate-900 dark:text-white">{chapter.title}</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{chapter.summary || "暂无章节摘要"}</p><p className="mt-2 text-[10px] text-slate-500">版本 {chapter.version_id.slice(0, 8)}</p></div></div></Card>)}</div>}
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-all font-medium text-slate-800 dark:text-slate-200">{value}</dd></div>;
}

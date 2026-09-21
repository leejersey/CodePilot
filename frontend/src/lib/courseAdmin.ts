import type { BackgroundJob } from "./api.ts";

export type CourseStatus =
  | "draft"
  | "pending_review"
  | "rejected"
  | "published"
  | "archived";

export type CourseAdminAction =
  | "view"
  | "review"
  | "publish"
  | "archive"
  | "rebuild"
  | "delete";

const STATUS_LABELS: Record<CourseStatus, string> = {
  draft: "草稿",
  pending_review: "待审核",
  rejected: "已拒绝",
  published: "已发布",
  archived: "已归档",
};

export function getCourseStatusLabel(status: string): string {
  return STATUS_LABELS[status as CourseStatus] || status;
}

export function getCourseActions(status: string): CourseAdminAction[] {
  if (status === "pending_review") {
    return ["view", "review", "rebuild"];
  }
  // Administrators publish their own generated courses without a review round
  // trip, and restore archived courses the same way. Drafts/rejected can be
  // permanently deleted; published courses use archive instead.
  if (status === "draft") {
    return ["view", "publish", "rebuild", "delete"];
  }
  if (status === "rejected") {
    return ["view", "rebuild", "delete"];
  }
  if (status === "archived") {
    return ["view", "publish", "rebuild"];
  }
  if (status === "published") return ["view", "archive", "rebuild"];
  return ["view", "rebuild"];
}

export function getCourseDeleteCopy(topic: string): { title: string; message: string } {
  return {
    title: "删除课程",
    message: `确定永久删除「${topic}」？草稿内容、章节与学习路线将一并清理，且不可恢复。已发布课程请改用归档。`,
  };
}

export interface CoursePublishCopy {
  label: string;
  title: string;
  message: string;
}

export function getPublishCopy(status: string): CoursePublishCopy {
  if (status === "archived") {
    return {
      label: "重新发布",
      title: "重新发布课程",
      message: "课程将恢复公开可见，并重新出现在课程目录中。",
    };
  }
  return {
    label: "直接发布",
    title: "直接发布课程",
    message: "管理员可跳过审核直接发布草稿：课程将立即进入公开目录。",
  };
}

const RUNNING_JOB_STATUSES = new Set(["queued", "processing", "retrying"]);
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "cancelled"]);

export function hasRunningCourseJobs(jobs: BackgroundJob[]): boolean {
  return jobs.some((job) => RUNNING_JOB_STATUSES.has(job.status));
}

export function getVisibleCourseJobs(
  jobs: BackgroundJob[],
  dismissedJobIds: ReadonlySet<string>,
  limit = 4
): BackgroundJob[] {
  return jobs.filter((job) => !dismissedJobIds.has(job.id)).slice(0, limit);
}

export function getTerminalCourseJobIds(
  previousJobs: BackgroundJob[],
  currentJobs: BackgroundJob[]
): string[] {
  const previousStatuses = new Map(
    previousJobs.map((job) => [job.id, job.status])
  );
  return currentJobs
    .filter(
      (job) =>
        RUNNING_JOB_STATUSES.has(previousStatuses.get(job.id) || "") &&
        TERMINAL_JOB_STATUSES.has(job.status)
    )
    .map((job) => job.id);
}

export interface CourseJobNotice {
  tone: "running" | "success" | "error";
  text: string;
  /** 仅终态任务提示可以被关闭，进行中的提示不能被误关。 */
  dismissible: boolean;
}

export function creatorJobNotice(job: {
  job_type: string;
  status: string;
  progress: number;
  error_message?: string | null;
}): CourseJobNotice {
  const action = job.job_type === "course_rebuild" ? "课程重建" : "课程生成";
  if (job.status === "failed") {
    return {
      tone: "error",
      text: `${action}失败：${job.error_message || "未知错误"}`,
      dismissible: true,
    };
  }
  if (job.status === "cancelled") {
    return { tone: "error", text: `${action}已取消`, dismissible: true };
  }
  if (job.status === "completed") {
    return { tone: "success", text: `${action}已完成`, dismissible: true };
  }
  if (job.status === "retrying") {
    return {
      tone: "running",
      text: `${action}自动重试中 · ${job.progress}%`,
      dismissible: false,
    };
  }
  return {
    tone: "running",
    text: `${action}进行中 · ${job.progress}%`,
    dismissible: false,
  };
}

export function shouldPollCourseJob(status: string): boolean {
  return RUNNING_JOB_STATUSES.has(status);
}

export function getJobPollRetryDelay(failureCount: number): number {
  const exponent = Math.max(0, failureCount - 1);
  return Math.min(2_000 * 2 ** exponent, 30_000);
}

export interface CompatibleLearningTarget {
  learning_path_id?: string | null;
  legacy_path_id?: string | null;
}

export function isPublicRoute(pathname: string): boolean {
  if (pathname === "/" || pathname === "/auth/login" || pathname === "/courses") {
    return true;
  }
  return /^\/courses\/[^/]+$/.test(pathname);
}

export function toLoginWithReturnTo(returnTo: string): string {
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function isActiveNavRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 匿名签发会话不算真实账号，不能报名课程。 */
export function isEnrollableAccount(
  user: { auth_provider: string } | null | undefined
): boolean {
  return Boolean(user && user.auth_provider !== "anonymous");
}

export type CourseJoinAction =
  | { kind: "unavailable" }
  | { kind: "login"; href: string }
  | { kind: "enroll"; target: string };

export function courseJoinAction(input: {
  user: { auth_provider: string } | null | undefined;
  course: CompatibleLearningTarget;
  returnTo: string;
}): CourseJoinAction {
  const target = enrollmentLearningTarget(input.course);
  if (!target) return { kind: "unavailable" };
  if (!isEnrollableAccount(input.user)) {
    return { kind: "login", href: toLoginWithReturnTo(input.returnTo) };
  }
  return { kind: "enroll", target };
}

export function enrollmentLearningTarget(target: CompatibleLearningTarget): string | null {
  const pathId = target.learning_path_id || target.legacy_path_id;
  return pathId ? `/learn/${pathId}` : null;
}

/** 「我的课程」只展示能进入学习工作区的选课，过滤掉迁移残留等无入口历史项。 */
export function navigableEnrollments<E extends CompatibleLearningTarget & { id: string }>(
  enrollments: readonly E[]
): E[] {
  return enrollments.filter((item) => enrollmentLearningTarget(item) !== null);
}

type EnrollmentLike = CompatibleLearningTarget & {
  id: string;
  course: {
    topic: string;
    author_id?: string | null;
    visibility?: string | null;
    status?: string | null;
  };
};

type LegacyPathLike = {
  id: string;
  topic: string;
};

const MAPPED_DELETABLE_STATUSES = new Set(["draft", "rejected"]);

export type LearningItemOrigin = "self" | "platform";

export type LearningItemRemoval =
  | { kind: "hidden" }
  | { kind: "blocked"; reason: string }
  | { kind: "delete"; pathId: string; confirmMessage: string };

export type LearningItemPresentation = {
  origin: LearningItemOrigin;
  badgeLabel: string;
  removal: LearningItemRemoval;
};

function isAdminRole(role?: string | null): boolean {
  return role === "admin" || role === "super_admin";
}

/** 用户自己的私有课程（含迁移过来的个人路径），不是平台上架课。 */
export function isOwnPrivateCourse(
  course: EnrollmentLike["course"],
  viewerId?: string | null
): boolean {
  if (!viewerId || !course.author_id || course.author_id !== viewerId) return false;
  return course.visibility !== "published" && course.status !== "published";
}

function deleteConfirmMessage(topic: string): string {
  return `确定删除自建学习路线「${topic}」？章节与相关进度将一并删除。`;
}

export function learningItemPresentation<
  E extends EnrollmentLike,
  P extends LegacyPathLike,
>(
  item: CourseLearningItem<E, P>,
  viewer: { id?: string | null; role?: string | null } | null | undefined
): LearningItemPresentation {
  if (item.kind === "legacy") {
    return {
      origin: "self",
      badgeLabel: "我的自建路线",
      removal: {
        kind: "delete",
        pathId: item.value.id,
        confirmMessage: deleteConfirmMessage(item.value.topic),
      },
    };
  }

  const course = item.value.course;
  if (!isOwnPrivateCourse(course, viewer?.id)) {
    return { origin: "platform", badgeLabel: "平台课程", removal: { kind: "hidden" } };
  }

  const pathId = item.value.learning_path_id || item.value.legacy_path_id;
  if (!pathId) {
    return {
      origin: "self",
      badgeLabel: "我的自建路线",
      removal: {
        kind: "blocked",
        reason: "该课程还没有可删除的学习入口。",
      },
    };
  }

  if (MAPPED_DELETABLE_STATUSES.has(String(course.status)) && isAdminRole(viewer?.role)) {
    return {
      origin: "self",
      badgeLabel: "我的自建路线",
      removal: {
        kind: "delete",
        pathId,
        confirmMessage: deleteConfirmMessage(course.topic),
      },
    };
  }

  if (MAPPED_DELETABLE_STATUSES.has(String(course.status))) {
    return {
      origin: "self",
      badgeLabel: "我的自建路线",
      removal: {
        kind: "blocked",
        reason: "该路线已纳入课程治理，删除学习入口仅管理员可在草稿或驳回状态下操作。",
      },
    };
  }

  return {
    origin: "self",
    badgeLabel: "我的自建路线",
    removal: {
      kind: "blocked",
      reason: "该课程已进入审核或发布流程，不能再删除学习入口。",
    },
  };
}

export function chapterCompletionOutcome(response: { preview?: boolean } | null | undefined): {
  kind: "completed" | "preview";
  message: string;
} {
  if (response?.preview) {
    return {
      kind: "preview",
      message: "预览模式不记录学习进度。加入课程后才会保存完成状态。",
    };
  }
  return { kind: "completed", message: "" };
}

export type CourseLearningItem<E, P> =
  | { kind: "enrollment"; id: string; value: E }
  | { kind: "legacy"; id: string; value: P };

export function mergeEnrollmentsWithLegacyPaths<
  E extends EnrollmentLike,
  P extends LegacyPathLike,
>(enrollments: E[], paths: P[]): CourseLearningItem<E, P>[] {
  const mappedPathIds = new Set(
    enrollments.flatMap((item) =>
      [item.learning_path_id, item.legacy_path_id].filter(
        (id): id is string => Boolean(id)
      )
    )
  );
  return [
    ...enrollments.map((value) => ({
      kind: "enrollment" as const,
      id: value.id,
      value,
    })),
    ...paths
      .filter((path) => !mappedPathIds.has(path.id))
      .map((value) => ({ kind: "legacy" as const, id: value.id, value })),
  ];
}

/** 继续学习入口：优先最近一门未完成且可跳转的课程。 */
export function continueLearningCandidate<
  E extends CompatibleLearningTarget & { progress: number },
>(enrollments: E[]): E | null {
  const navigable = enrollments.filter(
    (item) => enrollmentLearningTarget(item) !== null
  );
  return navigable.find((item) => item.progress < 100) || navigable[0] || null;
}

export type CreatorCourseAction = "view" | "rebuild" | "submit_review";

export function creatorActionsForStatus(status: string): CreatorCourseAction[] {
  if (status === "draft" || status === "rejected") {
    return ["view", "rebuild", "submit_review"];
  }
  return ["view"];
}

export type CreatorCourseStatusFilter =
  | ""
  | "draft"
  | "pending_review"
  | "rejected"
  | "published"
  | "archived";

export function canRebuildCreatorCourse(status: string): boolean {
  return creatorActionsForStatus(status).includes("rebuild");
}

export function canSubmitCreatorCourseForReview(status: string): boolean {
  return creatorActionsForStatus(status).includes("submit_review");
}

const CREATOR_STATUS_HINTS: Record<string, string> = {
  draft: "草稿仅自己可见，重建到满意后再提交审核。",
  pending_review: "已提交审核，等待管理员处理期间不能重建或再次提交。",
  rejected: "审核未通过，可按审核意见重建后重新提交。",
  published: "已发布课程只能由管理员强制更新版本；需要修订请联系管理员。",
  archived: "课程已归档，需要恢复发布请联系管理员。",
};

export function creatorCourseStatusHint(status: string): string {
  return CREATOR_STATUS_HINTS[status] || "";
}

export function filterCreatorCourses<T extends { status: string }>(
  courses: readonly T[],
  filter: string
): T[] {
  if (!filter) return [...courses];
  return courses.filter((course) => course.status === filter);
}

/** 状态页签计数；空字符串键为全部课程总数。 */
export function countCreatorCoursesByStatus<T extends { status: string }>(
  courses: readonly T[]
): Record<string, number> {
  const counts: Record<string, number> = { "": courses.length };
  for (const course of courses) {
    counts[course.status] = (counts[course.status] || 0) + 1;
  }
  return counts;
}

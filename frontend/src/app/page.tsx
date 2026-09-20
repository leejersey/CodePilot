"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/common/Card";
import { CardSkeleton } from "@/components/common/Skeleton";
import { DifficultyBadge } from "@/components/common/Badge";
import {
  getBackgroundJob,
  listMyEnrollments,
  listPublishedCourses,
  type BackgroundJob,
  type CourseCatalogItem,
  type CourseEnrollment,
} from "@/lib/api";
import { shouldOfferSignIn } from "@/lib/accountAccess";
import {
  continueLearningCandidate,
  enrollmentLearningTarget,
  isEnrollableAccount,
  toLoginWithReturnTo,
} from "@/lib/courseExperience";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowRight,
  BookOpen,
  Compass,
  Cpu,
  GitBranch,
  Loader2,
  PenLine,
  PlayCircle,
  Rocket,
  X,
} from "lucide-react";

const PATH_JOB_STORAGE_KEY = "codepilot_path_generation_job";

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, isCreator, init } = useAuth();
  const [courses, setCourses] = useState<CourseCatalogItem[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [continueTarget, setContinueTarget] = useState<CourseEnrollment | null>(null);
  const [legacyJob, setLegacyJob] = useState<BackgroundJob | null>(null);

  useEffect(() => { void init(); }, [init]);

  useEffect(() => {
    listPublishedCourses({ pageSize: 6 })
      .then((data) => setCourses(data.items))
      .catch(() => undefined)
      .finally(() => setCoursesLoading(false));
  }, []);

  const canContinue = isEnrollableAccount(user);
  useEffect(() => {
    if (!canContinue) return;
    let cancelled = false;
    listMyEnrollments({ pageSize: 20 })
      .then((enrollments) => {
        if (!cancelled) setContinueTarget(continueLearningCandidate(enrollments));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [canContinue]);

  // 兼容处理：旧版首页生成的学习路径任务仍需被跟踪，避免任务被遗弃。
  const legacyJobId = legacyJob?.id;
  const legacyJobStatus = legacyJob?.status;
  useEffect(() => {
    const savedJobId = localStorage.getItem(PATH_JOB_STORAGE_KEY);
    if (!savedJobId) return;
    getBackgroundJob(savedJobId)
      .then((job) => {
        if (job.status === "completed" && job.result_resource_id) {
          localStorage.removeItem(PATH_JOB_STORAGE_KEY);
          router.push(`/learn/${job.result_resource_id}`);
          return;
        }
        setLegacyJob(job);
      })
      .catch(() => localStorage.removeItem(PATH_JOB_STORAGE_KEY));
  }, [router]);

  useEffect(() => {
    if (!legacyJobId || !legacyJobStatus) return;
    if (["completed", "failed", "cancelled"].includes(legacyJobStatus)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const job = await getBackgroundJob(legacyJobId);
        if (cancelled) return;
        setLegacyJob(job);
        if (job.status === "completed" && job.result_resource_id) {
          localStorage.removeItem(PATH_JOB_STORAGE_KEY);
          router.push(`/learn/${job.result_resource_id}`);
          return;
        }
        if (!["failed", "cancelled"].includes(job.status)) {
          timer = setTimeout(poll, 2000);
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, 3000);
      }
    };
    timer = setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [legacyJobId, legacyJobStatus, router]);

  // 退出登录后立即失效，无需在 effect 里重置 state。
  const continueEnrollment = canContinue ? continueTarget : null;
  const continueHref = continueEnrollment
    ? enrollmentLearningTarget(continueEnrollment)
    : null;

  return (
    <>
      <Header />
      <main className="relative min-h-screen flex flex-col items-center px-6 bg-gradient-mesh pt-32 pb-20">
        {/* Ambient Glow Elements */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-secondary/15 blur-[140px] rounded-full pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary/15 blur-[140px] rounded-full pointer-events-none" />

        {/* Hero */}
        <div className="w-full max-w-4xl z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary-container/20 text-secondary text-xs font-bold tracking-[0.1em] uppercase mb-8 border border-secondary/20 shadow-[0_0_20px_rgba(172,138,255,0.15)]">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            Next-Gen AI Learning
          </div>
          <h1 className="font-headline text-5xl md:text-7xl font-bold text-on-surface mb-6 tracking-tight leading-[1.15]">
            开启你的{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_auto] animate-text-shimmer">
              编程进化
            </span>{" "}
            之旅
          </h1>
          <p className="text-on-surface-variant text-lg md:text-xl max-w-2xl mx-auto mb-10 font-light leading-relaxed">
            精选结构化课程与 AI 实时辅导，从课程中心挑一门开始，逐章掌握底层原理与实战技能。
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href={
                !authLoading && shouldOfferSignIn(user)
                  ? toLoginWithReturnTo("/courses")
                  : "/courses"
              }
              className="inline-flex items-center gap-2 bg-primary text-white dark:text-on-primary-container px-7 py-3.5 rounded-xl font-bold font-headline text-sm hover:bg-primary-dim transition-all active:scale-95 shadow-[0_4px_20px_rgba(2,132,199,0.25)] dark:shadow-[0_4px_20px_rgba(83,221,252,0.25)]"
            >
              <Compass size={16} /> 我要学习
            </Link>
            {continueHref && (
              <Link
                href={continueHref}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-bold font-headline text-sm hover:bg-cyan-500/20 transition-all active:scale-95"
              >
                <PlayCircle size={16} />
                继续学习「{continueEnrollment?.course.topic}」
              </Link>
            )}
            {isCreator && (
              <Link
                href="/creator/courses"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-secondary/30 bg-secondary/10 text-secondary font-bold font-headline text-sm hover:bg-secondary/20 transition-all active:scale-95"
              >
                <PenLine size={16} /> 我要创作课程
              </Link>
            )}
          </div>

          {legacyJob && (
            <div className="mt-8 mx-auto max-w-2xl glass-card border border-slate-200/90 dark:border-white/10 rounded-2xl p-5 text-left">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${legacyJob.status === "failed" ? "bg-rose-500/10 text-rose-500" : "bg-primary/10 text-primary"}`}>
                    {legacyJob.status === "failed"
                      ? <Rocket size={19} />
                      : <Loader2 size={19} className="animate-spin" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {legacyJob.status === "failed" ? "此前的学习路径生成任务失败" : "此前提交的学习路径仍在生成"}
                    </p>
                    <h3 className="font-headline font-bold text-on-surface truncate">
                      {legacyJob.payload?.topic || "旧版学习路径任务"}
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-lg font-bold text-primary">{legacyJob.progress}%</span>
                  <button
                    type="button"
                    aria-label="不再跟踪该任务"
                    onClick={() => {
                      localStorage.removeItem(PATH_JOB_STORAGE_KEY);
                      setLegacyJob(null);
                    }}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${legacyJob.status === "failed" ? "bg-rose-500" : "bg-gradient-to-r from-primary to-secondary"}`}
                  style={{ width: `${legacyJob.progress}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                完成后会自动进入对应学习路径，你也可以在
                <Link href="/learn" className="mx-1 font-bold text-primary hover:underline">我的课程</Link>
                中查看。
              </p>
            </div>
          )}
        </div>

        {/* 已发布课程推荐 */}
        <section className="mt-20 w-full max-w-5xl z-10">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <h2 className="font-headline text-2xl font-bold text-on-surface">精选课程</h2>
              <p className="mt-1 text-sm text-on-surface-variant">平台已发布并通过审核的结构化课程</p>
            </div>
            <Link href="/courses" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-primary hover:underline">
              查看全部 <ArrowRight size={14} />
            </Link>
          </div>
          {coursesLoading ? (
            <CardSkeleton count={3} />
          ) : courses.length === 0 ? (
            <Card className="p-8 text-center text-sm text-on-surface-variant">
              课程正在筹备中，敬请期待。
            </Card>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <Link key={course.id} href={`/courses/${course.id}`} className="group block">
                  <Card className="flex h-full flex-col p-5 transition-all hover:border-cyan-500/30" interactive>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-500 dark:text-cyan-400">
                        <BookOpen size={18} />
                      </span>
                      <DifficultyBadge difficulty={course.difficulty} />
                    </div>
                    <h3 className="font-headline text-base font-bold text-on-surface transition-colors group-hover:text-cyan-600 dark:group-hover:text-cyan-400">
                      {course.topic}
                    </h3>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-cyan-600 dark:text-cyan-400">
                      加入学习 <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Bento Interactive Features Section */}
        <div className="mt-20 w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-5 z-10">
          <Card className="p-6 flex items-start gap-4" interactive>
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <Cpu size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-on-surface mb-1 font-headline">自适应引擎</h4>
              <p className="text-xs text-on-surface-variant/80 leading-relaxed">
                根据你的编程基础实时调整难度，精准填补知识盲区。
              </p>
            </div>
          </Card>

          <Card className="p-6 flex items-start gap-4" interactive>
            <div className="w-11 h-11 rounded-xl bg-secondary/10 border border-secondary/20 text-secondary flex items-center justify-center shrink-0">
              <GitBranch size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-on-surface mb-1 font-headline">知识图谱</h4>
              <p className="text-xs text-on-surface-variant/80 leading-relaxed">
                体系化呈现章节大纲与进度，每个技术栈都有清晰里程碑。
              </p>
            </div>
          </Card>

          <Card className="p-6 flex items-start gap-4" interactive>
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
              <Rocket size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-on-surface mb-1 font-headline">实战驱动</h4>
              <p className="text-xs text-on-surface-variant/80 leading-relaxed">
                浏览器内置 Monaco + Python 沙箱，结合 AI 实时出题判题。
              </p>
            </div>
          </Card>
        </div>
      </main>

      {/* Background Animation Layer */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[10%] left-[15%] w-64 h-64 bg-secondary/5 rounded-full blur-[90px]" />
        <div className="absolute top-[60%] right-[10%] w-96 h-96 bg-primary/5 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>
    </>
  );
}

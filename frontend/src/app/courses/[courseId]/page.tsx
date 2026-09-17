"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Loader2, Rocket } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/common/Card";
import { DifficultyBadge, KnowledgeBadge } from "@/components/common/Badge";
import { useAuth } from "@/hooks/useAuth";
import {
  enrollCourse,
  getCourse,
  getCourseChapters,
  getPath,
  getPathSourceLabel,
  type CourseChapter,
  type CourseDetail,
  type LearningPath,
} from "@/lib/api";
import { getCourseStatusLabel } from "@/lib/courseAdmin";
import { courseJoinAction } from "@/lib/courseExperience";
import { createRequestSequencer } from "@/lib/requestSequencing";

export default function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading, init } = useAuth();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [chapters, setChapters] = useState<CourseChapter[]>([]);
  const [sourcePath, setSourcePath] = useState<LearningPath | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const requests = useRef(createRequestSequencer());

  useEffect(() => { void init(); }, [init]);

  const load = useCallback(async () => {
    const request = requests.current.begin();
    setLoading(true);
    setError("");
    try {
      const [courseData, chapterData] = await Promise.all([
        getCourse(courseId, { signal: request.signal }),
        getCourseChapters(courseId, { signal: request.signal }),
      ]);
      if (!requests.current.isCurrent(request.id)) return;
      setCourse(courseData);
      setChapters(chapterData);
    } catch (err) {
      if (request.signal.aborted) return;
      setError(err instanceof Error ? err.message : "课程加载失败");
    } finally {
      if (requests.current.isCurrent(request.id)) setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    const sequencer = requests.current;
    void load();
    return () => sequencer.cancel();
  }, [load]);

  // 课程来源信息只存在于兼容学习路径上，取不到时静默降级。
  const legacyPathId = course?.learning_path_id;
  useEffect(() => {
    if (!legacyPathId) return;
    let cancelled = false;
    getPath(legacyPathId)
      .then((path) => { if (!cancelled) setSourcePath(path); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [legacyPathId]);

  async function handleJoin() {
    if (!course) return;
    const action = courseJoinAction({ user, course, returnTo: pathname });
    if (action.kind === "unavailable") return;
    if (action.kind === "login") {
      router.push(action.href);
      return;
    }
    setJoining(true);
    setJoinError("");
    try {
      await enrollCourse(course.id);
      router.push(action.target);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "加入课程失败");
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <>
        <Header />
        <main className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </>
    );
  }

  if (!course) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-background px-6 pt-24">
          <div role="alert" className="mx-auto max-w-3xl rounded-xl border border-rose-500/30 p-5 text-sm text-rose-500">
            {error || "课程不存在或未公开"}
          </div>
        </main>
      </>
    );
  }

  const action = courseJoinAction({ user, course, returnTo: pathname });
  const source = sourcePath ? getPathSourceLabel(sourcePath.outline?.rag?.source_type) : null;
  const kbNames = sourcePath?.outline?.rag?.kb_names || [];

  return (
    <>
      <Header />
      <main className="min-h-screen bg-background px-6 pt-24 pb-20">
        <div className="mx-auto max-w-4xl space-y-6">
          <Link href="/courses" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-primary">
            <ArrowLeft size={15} /> 返回课程中心
          </Link>

          <Card className="p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                {getCourseStatusLabel(course.status)}
              </span>
              <DifficultyBadge difficulty={course.difficulty} />
              {source?.type === "knowledge_base" ? (
                <KnowledgeBadge kbName={kbNames[0]} />
              ) : source ? (
                <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500 dark:border-white/10">
                  {source.label}
                </span>
              ) : null}
            </div>
            <h1 className="font-headline text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {course.topic}
            </h1>
            <p className="mt-2 text-xs text-slate-500">
              共 {chapters.length} 章 · 更新于 {new Date(course.updated_at).toLocaleString("zh-CN")}
              {sourcePath?.outline?.estimated_hours
                ? ` · 预计 ${sourcePath.outline.estimated_hours} 小时`
                : ""}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleJoin}
                disabled={action.kind === "unavailable" || joining || authLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {joining ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
                {joining ? "正在加入..." : action.kind === "login" ? "登录后加入学习" : "加入学习"}
              </button>
              {action.kind === "unavailable" && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  该课程尚未生成可学习的内容映射，暂时无法加入，请稍后再来查看。
                </p>
              )}
            </div>
            {joinError && (
              <p role="alert" className="mt-3 text-xs text-rose-500">{joinError}</p>
            )}
          </Card>

          {sourcePath?.outline?.prerequisites?.length ? (
            <Card className="p-5">
              <h2 className="font-headline text-lg font-bold text-slate-900 dark:text-white">前置基础</h2>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
                {sourcePath.outline.prerequisites.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-headline text-xl font-bold text-slate-900 dark:text-white">课程章节</h2>
              <span className="text-xs text-slate-500">{chapters.length} 章</span>
            </div>
            {chapters.length === 0 ? (
              <Card className="p-8 text-center text-sm text-slate-500">当前版本暂无章节。</Card>
            ) : (
              <div className="space-y-3">
                {chapters.map((chapter) => (
                  <Card key={chapter.id} className="p-4">
                    <div className="flex gap-3">
                      <span className="font-mono text-xs text-primary">
                        {String(chapter.sort_order).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                          <BookOpen size={14} className="shrink-0 text-cyan-500" />
                          {chapter.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          {chapter.summary || "暂无章节摘要"}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import {
  listMyEnrollments,
  type CourseEnrollment,
} from "@/lib/api";
import {
  enrollmentLearningTarget,
  isEnrollableAccount,
  learningItemPresentation,
  navigableEnrollments,
} from "@/lib/courseExperience";
import { AuthGuard } from "@/components/AuthGuard";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { CardSkeleton } from "@/components/common/Skeleton";
import { DifficultyBadge } from "@/components/common/Badge";
import {
  Compass,
  ChevronRight,
  GraduationCap,
  Terminal,
  Rocket,
  ArrowRight,
  PlusCircle,
  CheckCircle2,
} from "lucide-react";

const DIFFICULTY_ICON_MAP = {
  beginner: GraduationCap,
  intermediate: Terminal,
  advanced: Rocket,
};

function difficultyIcon(difficulty: string) {
  return DIFFICULTY_ICON_MAP[difficulty as keyof typeof DIFFICULTY_ICON_MAP] || Terminal;
}

export default function LearnPage() {
  const { init, user } = useAuth();
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { init(); }, [init]);

  const canListEnrollments = isEnrollableAccount(user);

  useEffect(() => {
    async function fetchLearning() {
      if (!canListEnrollments) {
        setEnrollments([]);
        setLoading(false);
        return;
      }
      try {
        setEnrollments(await listMyEnrollments({ pageSize: 50 }));
      } catch {
        setEnrollments([]);
      } finally {
        setLoading(false);
      }
    }
    void fetchLearning();
  }, [canListEnrollments]);

  // 只展示能真正进入学习的选课；迁移残留、无学习入口的历史项一律不出现。
  const items = navigableEnrollments(enrollments);

  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto w-full pb-20 p-6 md:p-10 h-full overflow-y-auto space-y-8">
        <div className="border-b border-slate-200 dark:border-white/5 pb-6">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs mb-3 font-mono">
            <Link href="/" className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">首页</Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
            <span className="text-cyan-600 dark:text-cyan-400 font-medium">我的课程</span>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold font-headline tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3">
                <Compass className="w-8 h-8 text-cyan-600 dark:text-cyan-400" />
                我的课程
              </h1>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-1.5">
                继续推进已加入的课程，随时回到上次的学习位置
              </p>
            </div>
            <Link
              href="/courses"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-700 dark:text-cyan-300"
            >
              <Compass className="w-4 h-4" /> 浏览课程中心
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((index) => (
              <CardSkeleton key={index} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="还没有加入任何课程"
            description="前往课程中心，挑一门已发布的课程加入学习"
            action={{
              label: "去课程中心看看",
              href: "/courses",
            }}
          />
        ) : (
          <div className="grid gap-4">
            {items.map((enrollment) => {
              const target = enrollmentLearningTarget(enrollment)!;
              const topic = enrollment.course.topic;
              const difficulty = enrollment.course.difficulty;
              const {
                progress,
                completed_chapters: completed,
                total_chapters: totalChapters,
              } = enrollment;
              const presentation = learningItemPresentation(
                { kind: "enrollment", id: enrollment.id, value: enrollment },
                user
              );
              const DiffIcon = difficultyIcon(difficulty);
              const isCompleted = progress === 100;

              return (
                <Link key={enrollment.id} href={target} className="group block">
                  <Card className="p-6 hover:border-cyan-500/30 transition-all duration-300">
                    <div className="flex items-center gap-5">
                      <div className="w-13 h-13 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 group-hover:scale-105 group-hover:bg-cyan-500/20 transition-all">
                        <DiffIcon className="w-6 h-6" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5 mb-2">
                          <h3 className="text-lg font-bold font-headline text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors truncate">
                            {topic}
                          </h3>
                          <span
                            className={
                              presentation.origin === "self"
                                ? "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/20"
                                : "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/25"
                            }
                          >
                            {presentation.badgeLabel}
                          </span>
                          <DifficultyBadge difficulty={difficulty} />
                          {isCompleted && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                              <CheckCircle2 className="w-3 h-3" />
                              已通关
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono">
                          <span>{completed}/{totalChapters} 章节</span>
                          <span>·</span>
                          <span className={`font-bold ${isCompleted ? "text-emerald-600 dark:text-emerald-400" : "text-cyan-600 dark:text-cyan-400"}`}>
                            完成度 {progress}%
                          </span>
                        </div>

                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden mt-3 border border-slate-200/80 dark:border-white/5">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              isCompleted
                                ? "bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                                : "bg-gradient-to-r from-cyan-500 to-primary shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-surface-container flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 group-hover:bg-cyan-50 dark:group-hover:bg-cyan-500/10 group-hover:translate-x-0.5 transition-all shrink-0">
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}

            <Link
              href="/courses"
              className="flex items-center justify-center gap-2 py-4 rounded-2xl border border-dashed border-slate-300 dark:border-white/10 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:border-cyan-500/40 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              从课程中心加入更多课程
            </Link>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}

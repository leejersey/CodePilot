"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { AuthGuard } from "@/components/AuthGuard";
import { ActivityHeatmap } from "@/components/charts/ActivityHeatmap";
import { SkillRadar } from "@/components/charts/SkillRadar";
import { TrendChart } from "@/components/charts/TrendChart";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { CardSkeleton } from "@/components/common/Skeleton";
import {
  Compass,
  CheckCircle2,
  Flame,
  Award,
  BookOpen,
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
  Target,
} from "lucide-react";
import {
  getProgressStats, getProgressPaths, getSkillDistribution,
  getLearningTime, getWeakPoints,
  type ProgressStats, type PathProgress, type ActivityItem, type SkillItem,
  type LearningTimeSummary, type WeakPointSummary,
} from "@/lib/api";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`;
}

export default function DashboardPage() {
  const { user, init } = useAuth();
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [paths, setPaths] = useState<PathProgress[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [learningTime, setLearningTime] = useState<LearningTimeSummary | null>(null);
  const [weakPoints, setWeakPoints] = useState<WeakPointSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [s, p, sk, time, weak] = await Promise.all([
          getProgressStats(),
          getProgressPaths(),
          getSkillDistribution(),
          getLearningTime(),
          getWeakPoints(),
        ]);
        setStats(s);
        setPaths(p);
        setActivity(
          time.daily.map((item) => ({
            date: item.date,
            count: Math.round(item.seconds / 60),
          }))
        );
        setSkills(
          weak.knowledge_points.length
            ? weak.knowledge_points.map((item) => ({
                topic: item.topic,
                total: item.exercises,
                completed: item.mastery >= 60 ? item.exercises : 0,
                mastery: item.mastery,
                attempts: item.attempts,
              }))
            : sk
        );
        setLearningTime(time);
        setWeakPoints(weak);
      } catch { /* ignore */ }
      setLoading(false);
    }
    fetchData();
  }, []);

  const DIFFICULTY_LABEL: Record<string, { text: string; color: string }> = {
    beginner: { text: "入门", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    intermediate: { text: "中级", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    advanced: { text: "高级", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-background transition-colors duration-200">
        <Header />
        <div className="pt-24 px-6 pb-16">
          <div className="max-w-6xl mx-auto space-y-8">
            {/* 顶栏标题区 */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200/80 dark:border-white/5 pb-6">
              <div>
                <div className="flex items-center gap-2 text-primary text-xs font-mono tracking-wider uppercase mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Performance & Analytics</span>
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight font-headline text-slate-900 dark:text-white">
                  数据统计面板
                </h1>
                <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
                  {user ? `${user.nickname} 的专属学习与练习技能图谱` : "正在分析学习轨迹..."}
                </p>
              </div>

              {stats && (
                <div className="flex items-center gap-3 self-start md:self-auto bg-surface-container/60 border border-white/5 px-4 py-2 rounded-xl text-xs text-slate-300">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span>今日状态良好 · 保持学习节奏</span>
                </div>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : (
              <>
                {/* 核心指标统计卡片 */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <StatCard
                    icon={Compass}
                    label="学习路线"
                    value={stats?.paths.total ?? 0}
                    trend="进行中"
                    accentColor="cyan"
                  />
                  <StatCard
                    icon={CheckCircle2}
                    label="已完成章节"
                    value={stats?.chapters.completed ?? 0}
                    sub={stats ? `/${stats.chapters.total} 章` : ""}
                    trend={stats?.chapters.total ? `${stats.chapters.completion_rate}%` : undefined}
                    accentColor="emerald"
                  />
                  <StatCard
                    icon={Clock}
                    label="今日学习"
                    value={formatDuration(learningTime?.today_seconds ?? 0)}
                    trend={learningTime ? `累计 ${formatDuration(learningTime.total_seconds)}` : undefined}
                    accentColor="cyan"
                  />
                  <StatCard
                    icon={Flame}
                    label="连续学习"
                    value={stats?.streak_days ?? 0}
                    sub="天"
                    trend="🔥 状态火热"
                    accentColor="amber"
                  />
                  <StatCard
                    icon={Award}
                    label="练习通过率"
                    value={stats?.exercises.pass_rate ?? 0}
                    sub="%"
                    trend="AI 实时判题"
                    accentColor="purple"
                  />
                </div>

                {/* 总体进度条横幅 */}
                {stats && stats.chapters.total > 0 && (
                  <Card className="p-6 bg-gradient-to-r from-surface-container/80 to-surface-container/40">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <TrendingUp className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-sm font-semibold text-slate-200">总体课程通关率</h3>
                      </div>
                      <span className="text-2xl font-black font-mono text-cyan-400">
                        {stats.chapters.completion_rate}%
                      </span>
                    </div>

                    <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-white/5">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 via-primary to-indigo-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                        style={{ width: `${stats.chapters.completion_rate}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-6 mt-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                        已完成 {stats.chapters.completed}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
                        进行中 {stats.chapters.in_progress}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-600" />
                        未开始 {Math.max(0, stats.chapters.total - stats.chapters.completed - stats.chapters.in_progress)}
                      </span>
                    </div>
                  </Card>
                )}

                {/* 图表区域 — 贡献热力图 + 技能雷达图 */}
                <div className="grid md:grid-cols-2 gap-6">
                  <ActivityHeatmap data={activity} />
                  <SkillRadar data={skills} />
                </div>

                <Card className="p-6">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-bold font-headline text-slate-900 dark:text-white">
                        <Target className="h-5 w-5 text-rose-500 dark:text-rose-400" />
                        薄弱知识点
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        仅依据 Judge0 可信判题，综合最佳成绩与重复尝试次数计算
                      </p>
                    </div>
                  </div>
                  {!weakPoints || weakPoints.knowledge_points.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-500">
                      完成可信判题练习后，将自动生成知识点掌握度。
                    </p>
                  ) : weakPoints.weak_points.length === 0 ? (
                    <p className="py-6 text-center text-sm text-emerald-600 dark:text-emerald-400">
                      当前已分析的知识点掌握度均达到 60%。
                    </p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {weakPoints.weak_points.map((item) => (
                        <div key={item.topic} className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.topic}</h3>
                            <span className="font-mono text-sm font-bold text-rose-500">{item.mastery}%</span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {item.exercises} 道题 · {item.attempts} 次可信作答
                          </p>
                          {item.recommended_exercises.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {item.recommended_exercises.map((exercise) => (
                                <Link
                                  key={exercise.id}
                                  href={`/exercise/${exercise.id}?returnTo=/dashboard`}
                                  className="rounded-lg border border-rose-500/20 bg-white/60 dark:bg-white/5 px-2.5 py-1.5 text-[11px] text-rose-600 dark:text-rose-300 hover:border-rose-500/40"
                                >
                                  练习：{exercise.title}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* 趋势图 */}
                <div>
                  <TrendChart data={activity} />
                </div>

                {/* 学习路线列表 */}
                <div className="space-y-4 pt-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold font-headline text-slate-100 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-cyan-400" />
                      我的学习路线
                    </h2>
                    <Link
                      href="/learn"
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 transition-colors"
                    >
                      探索更多路线
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  {paths.length === 0 ? (
                    <EmptyState
                      icon={BookOpen}
                      title="还没有开始任何学习路线"
                      description="选择感兴趣的技术栈，生成你专属的结构化 AI 编程成长图谱"
                      action={{
                        label: "立即探索路线",
                        href: "/learn",
                      }}
                    />
                  ) : (
                    <div className="grid gap-4">
                      {paths.map(path => (
                        <Link key={path.id} href={`/learn/${path.id}`} className="group block">
                          <Card className="p-5 hover:border-cyan-500/30 transition-all duration-300">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-105 group-hover:bg-cyan-500/20 transition-all">
                                  <BookOpen className="w-5 h-5" />
                                </div>
                                <div>
                                  <h3 className="font-bold text-slate-100 group-hover:text-cyan-400 transition-colors">
                                    {path.topic}
                                  </h3>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${DIFFICULTY_LABEL[path.difficulty]?.color || "text-slate-400"}`}>
                                      {DIFFICULTY_LABEL[path.difficulty]?.text || path.difficulty}
                                    </span>
                                    <span className="text-xs text-slate-500 font-mono">
                                      {path.completed_chapters}/{path.total_chapters} 章节
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-2xl font-black font-mono text-cyan-400">
                                  {path.progress}%
                                </span>
                                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                              </div>
                            </div>
                            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-900 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-cyan-500 to-primary rounded-full transition-all duration-700"
                                style={{ width: `${path.progress}%` }}
                              />
                            </div>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  accentColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: string;
  trend?: string;
  accentColor: "cyan" | "emerald" | "amber" | "purple";
}) {
  const colorMap = {
    cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.1)]",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_20px_rgba(52,211,153,0.1)]",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20 shadow-[0_0_20px_rgba(251,191,36,0.1)]",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.1)]",
  };

  const badgeColorMap = {
    cyan: "text-cyan-700 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-500/10",
    emerald: "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10",
    amber: "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/10",
    purple: "text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-500/10",
  };

  return (
    <Card className="p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${colorMap[accentColor]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${badgeColorMap[accentColor]}`}>
            {trend}
          </span>
        )}
      </div>
      <div>
        <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tracking-tight">
          {value}
          {sub && <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-1">{sub}</span>}
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{label}</p>
      </div>
    </Card>
  );
}


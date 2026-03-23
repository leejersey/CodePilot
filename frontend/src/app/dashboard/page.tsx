"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { AuthGuard } from "@/components/AuthGuard";
import { ActivityHeatmap } from "@/components/charts/ActivityHeatmap";
import { SkillRadar } from "@/components/charts/SkillRadar";
import { TrendChart } from "@/components/charts/TrendChart";
import {
  getProgressStats, getProgressPaths, getProgressActivity, getSkillDistribution,
  type ProgressStats, type PathProgress, type ActivityItem, type SkillItem,
} from "@/lib/api";

export default function DashboardPage() {
  const { user, init } = useAuth();
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [paths, setPaths] = useState<PathProgress[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [s, p, a, sk] = await Promise.all([
          getProgressStats(),
          getProgressPaths(),
          getProgressActivity(),
          getSkillDistribution(),
        ]);
        setStats(s);
        setPaths(p);
        setActivity(a);
        setSkills(sk);
      } catch { /* ignore */ }
      setLoading(false);
    }
    fetchData();
  }, []);

  const DIFFICULTY_LABEL: Record<string, { text: string; color: string }> = {
    beginner: { text: "入门", color: "text-green-400 bg-green-500/10 border-green-500/20" },
    intermediate: { text: "中级", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
    advanced: { text: "高级", color: "text-red-400 bg-red-500/10 border-red-500/20" },
  };

  return (
    <AuthGuard>
    <div className="min-h-screen bg-surface">
      <Header />
      <div className="pt-24 px-6 pb-12">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-on-surface font-headline tracking-tight">
            数据统计面板
          </h1>
          <p className="text-on-surface-variant mt-1">
            {user ? `${user.nickname} 的学习数据分析` : "加载中..."}
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="glass-panel bg-surface-container/50 rounded-2xl p-6 border border-white/5 animate-pulse h-32" />
            ))}
          </div>
        ) : (
          <>
            {/* Row 1: 统计卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard icon="route" label="学习路线" value={stats?.paths.total ?? 0} color="from-cyan-500/20 to-blue-500/20" iconColor="text-cyan-400" />
              <StatCard icon="check_circle" label="已完成章节" value={stats?.chapters.completed ?? 0} sub={stats ? `/${stats.chapters.total} 章` : ""} color="from-green-500/20 to-emerald-500/20" iconColor="text-green-400" />
              <StatCard icon="local_fire_department" label="连续学习" value={stats?.streak_days ?? 0} sub="天" color="from-orange-500/20 to-amber-500/20" iconColor="text-orange-400" />
              <StatCard icon="quiz" label="练习通过率" value={stats?.exercises.pass_rate ?? 0} sub="%" color="from-purple-500/20 to-pink-500/20" iconColor="text-purple-400" />
            </div>

            {/* Row 2: 总体进度条 */}
            {stats && stats.chapters.total > 0 && (
              <div className="glass-panel bg-surface-container/50 rounded-2xl p-6 border border-white/5 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-on-surface-variant">总体学习进度</h3>
                  <span className="text-2xl font-bold text-primary">{stats.chapters.completion_rate}%</span>
                </div>
                <div className="w-full h-3 bg-surface-container-low rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-1000 ease-out" style={{ width: `${stats.chapters.completion_rate}%` }} />
                </div>
                <div className="flex items-center gap-6 mt-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" /> 已完成 {stats.chapters.completed}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" /> 进行中 {stats.chapters.in_progress}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-600" /> 未开始 {stats.chapters.total - stats.chapters.completed - stats.chapters.in_progress}</span>
                </div>
              </div>
            )}

            {/* Row 3: 图表区域 — 活动热力图 + 技能分布 */}
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <ActivityHeatmap data={activity} />
              <SkillRadar data={skills} />
            </div>

            {/* Row 4: 趋势图 */}
            <div className="mb-6">
              <TrendChart data={activity} />
            </div>

            {/* Row 5: 学习路线列表 */}
            <div>
              <h2 className="text-lg font-bold text-on-surface font-headline mb-4">我的学习路线</h2>
              {paths.length === 0 ? (
                <div className="glass-panel bg-surface-container/50 rounded-2xl p-12 border border-white/5 text-center">
                  <span className="material-symbols-outlined text-5xl text-slate-600 mb-4 block">school</span>
                  <p className="text-on-surface-variant mb-4">还没有开始任何学习路线</p>
                  <Link href="/" className="bg-primary/15 hover:bg-primary/25 text-primary px-5 py-2.5 rounded-xl text-sm font-medium transition-all border border-primary/20">
                    开始学习
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4">
                  {paths.map(path => (
                    <Link key={path.id} href={`/learn/${path.id}`} className="glass-panel bg-surface-container/50 rounded-2xl p-5 border border-white/5 hover:border-primary/20 transition-all group">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                            <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
                          </div>
                          <div>
                            <h3 className="font-bold text-on-surface group-hover:text-primary transition-colors">{path.topic}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${DIFFICULTY_LABEL[path.difficulty]?.color || "text-slate-400"}`}>
                                {DIFFICULTY_LABEL[path.difficulty]?.text || path.difficulty}
                              </span>
                              <span className="text-xs text-slate-600">{path.completed_chapters}/{path.total_chapters} 章节</span>
                            </div>
                          </div>
                        </div>
                        <span className="text-2xl font-bold text-primary">{path.progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-surface-container-low rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-700" style={{ width: `${path.progress}%` }} />
                      </div>
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

function StatCard({ icon, label, value, sub, color, iconColor }: {
  icon: string; label: string; value: number; sub?: string; color: string; iconColor: string;
}) {
  return (
    <div className={`glass-panel bg-gradient-to-br ${color} rounded-2xl p-5 border border-white/5`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`material-symbols-outlined ${iconColor} text-xl`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
      </div>
      <div className="text-3xl font-bold text-on-surface tracking-tight">
        {value}<span className="text-sm font-normal text-on-surface-variant ml-1">{sub}</span>
      </div>
      <p className="text-xs text-on-surface-variant mt-1">{label}</p>
    </div>
  );
}

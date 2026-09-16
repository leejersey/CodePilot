"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { AuthGuard } from "@/components/AuthGuard";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { CardSkeleton } from "@/components/common/Skeleton";
import { DifficultyBadge, KnowledgeBadge } from "@/components/common/Badge";
import {
  History,
  Compass,
  Code2,
  Clock,
  Sparkles,
  Search,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  BrainCircuit,
  Eye,
} from "lucide-react";
import {
  getProgressStats, getProgressPaths,
  type ProgressStats, type PathProgress,
  getPathSourceLabel,
} from "@/lib/api";

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return `${diffInSeconds}秒前`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}分钟前`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}小时前`;
  return `${Math.floor(diffInSeconds / 86400)}天前`;
}

export default function HistoryPage() {
  const { init } = useAuth();
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [paths, setPaths] = useState<PathProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "in_progress" | "completed">("all");
  const [search, setSearch] = useState("");

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [s, p] = await Promise.all([
          getProgressStats(),
          getProgressPaths(),
        ]);
        setStats(s);
        setPaths(p);
      } catch { /* ignore */ }
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredPaths = paths.filter(path => {
    if (search && !path.topic.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "in_progress" && path.progress === 100) return false;
    if (filter === "completed" && path.progress < 100) return false;
    return true;
  });

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-background transition-colors duration-200">
        <Header />

        <main className="pt-24 pb-24 px-6 md:px-10 max-w-6xl mx-auto space-y-8">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200/80 dark:border-white/5 pb-6">
            <div>
              <div className="flex items-center gap-2 text-primary text-xs font-mono uppercase tracking-wider mb-2">
                <History className="w-4 h-4" />
                <span>Learning History & Archive</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold font-headline tracking-tight text-slate-900 dark:text-slate-100">
                学习历史轨迹
              </h1>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-1.5">
                同步您的知识脉络，追踪记录每一次代码演练与学习跃迁
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  className="bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 text-xs py-2 pl-9 pr-4 rounded-xl focus:outline-none focus:border-primary w-56 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-500" 
                  placeholder="搜索路线或主题..." 
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200 dark:border-white/10">
                <button 
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === "all" ? "bg-white dark:bg-cyan-500 text-sky-700 dark:text-slate-950 font-bold shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"}`}
                  onClick={() => setFilter("all")}
                >全部</button>
                <button 
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === "in_progress" ? "bg-white dark:bg-cyan-500 text-sky-700 dark:text-slate-950 font-bold shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"}`}
                  onClick={() => setFilter("in_progress")}
                >进行中</button>
                <button 
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === "completed" ? "bg-white dark:bg-cyan-500 text-sky-700 dark:text-slate-950 font-bold shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"}`}
                  onClick={() => setFilter("completed")}
                >已完成</button>
              </div>
            </div>
          </div>

          {/* Stats Bento Grid */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5">
              <div className="flex justify-between items-start mb-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <Clock className="w-4 h-4" />
                </div>
                <span className="text-[10px] text-slate-500 font-mono uppercase">ESTIMATED HOURS</span>
              </div>
              <div className="text-3xl font-extrabold font-mono text-cyan-400">
                {stats ? Math.floor(stats.chapters.completed * 0.5) : 0}h {stats ? (stats.chapters.completed % 2) * 30 : 0}m
              </div>
              <div className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">预估累计学习投入时长</div>
            </Card>

            <Card className="p-5">
              <div className="flex justify-between items-start mb-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="text-[10px] text-slate-500 font-mono uppercase">MASTERED CHAPTERS</span>
              </div>
              <div className="text-3xl font-extrabold font-mono text-emerald-400">
                {stats?.chapters.completed ?? 0}
              </div>
              <div className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">已成功通关的核心知识章节</div>
            </Card>

            <Card className="p-5">
              <div className="flex justify-between items-start mb-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <span className="text-[10px] text-slate-500 font-mono uppercase">ACTIVE TRACKS</span>
              </div>
              <div className="text-3xl font-extrabold font-mono text-purple-400">
                {(stats?.chapters.in_progress ?? 0).toString().padStart(2, '0')}
              </div>
              <div className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">当前正在推进探索的章节任务</div>
            </Card>
          </section>

          {/* History Cards List */}
          <div className="space-y-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : filteredPaths.length === 0 ? (
              <EmptyState
                icon={History}
                title="没有找到相关的学习历史"
                description={search ? `未找到与「${search}」相匹配的记录` : "还没有学习轨迹，立即开启第一条路线吧"}
                action={{
                  label: "探索学习路线",
                  href: "/learn",
                }}
              />
            ) : (
              filteredPaths.map(path => {
                const isCompleted = path.progress === 100;
                const src = getPathSourceLabel(path.source_type);

                return (
                  <Card
                    key={path.id}
                    className={`p-6 transition-all duration-300 hover:border-cyan-500/30 ${
                      isCompleted ? "opacity-80" : ""
                    }`}
                  >
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                          <Compass className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                              {path.topic}
                            </h3>
                            {src.type === "knowledge_base" && (
                              <KnowledgeBadge kbName={path.kb_names?.[0]} />
                            )}
                            <DifficultyBadge difficulty={path.difficulty} />
                            {isCompleted && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                COMPLETED
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono">
                            <span>{path.completed_chapters}/{path.total_chapters} 章节</span>
                            <span>·</span>
                            <span className={isCompleted ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-sky-600 dark:text-cyan-400 font-bold"}>
                              {path.progress}%
                            </span>
                            <span>·</span>
                            <span className="text-slate-400 dark:text-slate-500">
                              上次活动: {timeAgo(path.updated_at)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                        <div className="w-32 hidden md:block">
                          <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-900 rounded-full overflow-hidden border border-slate-300/40 dark:border-white/5">
                            <div 
                              className={`h-full transition-all duration-500 ${isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-sky-500 to-primary'}`} 
                              style={{ width: `${path.progress}%` }}
                            />
                          </div>
                        </div>

                        <Link href={`/learn/${path.id}`}>
                          <button className={isCompleted 
                            ? "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all border border-slate-200 dark:border-white/5 shadow-xs"
                            : "bg-gradient-to-r from-sky-500 to-primary text-white dark:text-slate-950 font-bold px-5 py-2 rounded-xl text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-[0_2px_10px_rgba(2,132,199,0.25)]"
                          }>
                            {isCompleted ? (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                <span>回顾路线</span>
                              </>
                            ) : (
                              <>
                                <span>继续学习</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>
                        </Link>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}

            {/* AI 推荐横幅卡片 */}
            {!loading && filteredPaths.length > 0 && (
              <Card className="p-6 border-sky-300 dark:border-cyan-500/20 bg-gradient-to-r from-sky-50/80 via-white to-sky-50/40 dark:from-surface-container/90 dark:via-surface-container/60 dark:to-surface-container/40 flex flex-col md:flex-row items-center justify-between gap-6 mt-8 shadow-xs">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-sky-100 dark:bg-cyan-500/10 border border-sky-300 dark:border-cyan-500/20 rounded-2xl flex items-center justify-center text-sky-600 dark:text-cyan-400 shrink-0 shadow-xs">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">AI 智能进阶推荐</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      根据您当前的技术栈掌握度与实战演练记录，AI 助教已准备好进阶架构演练。
                    </p>
                  </div>
                </div>
                <Link href="/">
                  <button className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 dark:bg-cyan-500 text-white dark:text-slate-950 font-bold text-xs transition-all shadow-xs whitespace-nowrap">
                    定制全新路线
                  </button>
                </Link>
              </Card>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}


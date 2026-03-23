"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { AuthGuard } from "@/components/AuthGuard";
import {
  getProgressStats, getProgressPaths,
  type ProgressStats, type PathProgress,
} from "@/lib/api";

const DIFFICULTY_CONFIG: Record<string, { label: string; class: string; icon: string }> = {
  beginner: { label: "初级 (BEG)", class: "bg-surface-variant text-on-surface-variant border border-outline-variant/30", icon: "database" },
  intermediate: { label: "中级 (INT)", class: "bg-secondary-container/30 text-secondary border border-secondary/20", icon: "terminal" },
  advanced: { label: "高级 (ADV)", class: "bg-primary/20 text-primary border border-primary/30", icon: "layers" },
};

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
    if (filter === "in_progress" && path.progress === 0 && path.status !== "in_progress") return false; // maybe not started
    return true;
  });

  return (
    <AuthGuard>
    <div className="min-h-screen bg-background text-on-background selection:bg-primary/30 cyber-grid">
      <Header />
      
      {/* SideNavBar Shell Execution */}
      <aside className="h-screen w-64 fixed left-0 top-0 hidden lg:flex flex-col bg-[#091328] py-8 space-y-2 z-40 mt-16">
        <div className="px-6 mb-8 mt-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-bright flex items-center justify-center border border-primary/20">
              <span className="material-symbols-outlined text-primary">psychology</span>
            </div>
            <div>
              <h3 className="text-cyan-400 font-bold font-headline text-sm">Navigator Admin</h3>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">Level 42 Architect</p>
            </div>
          </div>
        </div>
        
        <div className="flex-1 px-4 space-y-1">
          <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-[#1f2b49] hover:text-cyan-200 transition-all cursor-pointer active:translate-x-1 rounded-lg">
            <span className="material-symbols-outlined">dashboard</span>
            <span className="font-medium text-sm">Overview</span>
          </Link>
          <Link href="/learn" className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-[#1f2b49] hover:text-cyan-200 transition-all cursor-pointer active:translate-x-1 rounded-lg">
            <span className="material-symbols-outlined">route</span>
            <span className="font-medium text-sm">Learning Path</span>
          </Link>
          {/* Active State Logic: History is Active */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#141f38] text-cyan-400 border-r-4 border-cyan-400 shadow-[0_0_15px_rgba(83,221,252,0.2)] cursor-pointer active:translate-x-1 rounded-l-lg">
            <span className="material-symbols-outlined">history</span>
            <span className="font-medium text-sm">History</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-[#1f2b49] hover:text-cyan-200 transition-all cursor-pointer active:translate-x-1 rounded-lg">
            <span className="material-symbols-outlined">military_tech</span>
            <span className="font-medium text-sm">Achievements</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-[#1f2b49] hover:text-cyan-200 transition-all cursor-pointer active:translate-x-1 rounded-lg">
            <span className="material-symbols-outlined">psychology</span>
            <span className="font-medium text-sm">AI Mentor</span>
          </div>
        </div>
        
        <div className="px-6 pt-4 border-t border-outline-variant/10">
          <button className="w-full bg-primary/10 border border-primary/30 text-primary py-2.5 rounded-xl font-headline text-sm hover:bg-primary/20 transition-all flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-sm">add</span>
            New Mission
          </button>
        </div>
      </aside>

      <main className="lg:ml-64 pt-24 pb-24 px-6 md:px-10 max-w-7xl mx-auto">
        {/* Header Section */}
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-headline font-bold text-on-surface tracking-tighter mb-2">学习历史</h1>
            <p className="text-on-surface-variant">同步您的神经脉络，追踪每一次代码跃迁</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <input 
                className="bg-surface-container-low border border-outline-variant/30 text-sm py-2 pl-10 pr-4 rounded-xl focus:ring-1 focus:ring-primary focus:border-primary w-64 transition-all text-on-surface" 
                placeholder="搜索主题..." 
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-sm">search</span>
            </div>
            <div className="flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/30">
              <button 
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === "all" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"}`}
                onClick={() => setFilter("all")}
              >全部</button>
              <button 
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === "in_progress" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"}`}
                onClick={() => setFilter("in_progress")}
              >进行中</button>
              <button 
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === "completed" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"}`}
                onClick={() => setFilter("completed")}
              >已完成</button>
            </div>
          </div>
        </header>

        {/* Stats Bento Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="p-[1px] rounded-2xl bg-gradient-to-br from-primary/40 to-transparent shadow-lg shadow-primary/5">
            <div className="bg-surface-container-high rounded-[15px] p-6 h-full">
              <div className="flex justify-between items-start mb-4">
                <span className="material-symbols-outlined text-primary-dim">schedule</span>
                <span className="text-[10px] text-on-surface-variant font-mono uppercase tracking-widest">Aggregate Time</span>
              </div>
              {/* Roughly estimate time: 30 mins per completed chapter */}
              <div className="text-4xl font-headline font-bold text-primary glow-text tracking-tight">
                {stats ? Math.floor(stats.chapters.completed * 0.5) : 0}h {stats ? (stats.chapters.completed % 2) * 30 : 0}m
              </div>
              <div className="mt-2 text-xs text-on-surface-variant">累计学习时长 · 击败 92% 用户</div>
            </div>
          </div>
          
          <div className="p-[1px] rounded-2xl bg-gradient-to-br from-secondary/40 to-transparent shadow-lg shadow-secondary/5">
            <div className="bg-surface-container-high rounded-[15px] p-6 h-full">
              <div className="flex justify-between items-start mb-4">
                <span className="material-symbols-outlined text-secondary">extension</span>
                <span className="text-[10px] text-on-surface-variant font-mono uppercase tracking-widest">Mastery Nodes</span>
              </div>
              <div className="text-4xl font-headline font-bold text-secondary glow-text tracking-tight">
                {stats?.chapters.completed ?? 0}
              </div>
              <div className="mt-2 text-xs text-on-surface-variant">已攻克核心知识点 · 神经连接稳定</div>
            </div>
          </div>
          
          <div className="p-[1px] rounded-2xl bg-gradient-to-br from-tertiary/40 to-transparent shadow-lg shadow-tertiary/5">
            <div className="bg-surface-container-high rounded-[15px] p-6 h-full">
              <div className="flex justify-between items-start mb-4">
                <span className="material-symbols-outlined text-tertiary">rocket_launch</span>
                <span className="text-[10px] text-on-surface-variant font-mono uppercase tracking-widest">Active Missions</span>
              </div>
              <div className="text-4xl font-headline font-bold text-tertiary glow-text tracking-tight">
                {(stats?.chapters.in_progress ?? 0).toString().padStart(2, '0')}
              </div>
              <div className="mt-2 text-xs text-on-surface-variant">当前正在进行的任务 · AI 待命中</div>
            </div>
          </div>
        </section>

        {/* History Cards List */}
        <div className="space-y-6">
          {loading ? (
            <div className="glass-card rounded-2xl p-6 h-32 animate-pulse border border-white/5" />
          ) : filteredPaths.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center border border-white/5">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-4">history_off</span>
              <p className="text-on-surface-variant">没有找到相关的学习历史记录</p>
            </div>
          ) : (
            filteredPaths.map(path => {
              const isCompleted = path.progress === 100;
              const config = DIFFICULTY_CONFIG[path.difficulty] || DIFFICULTY_CONFIG.intermediate;
              const iconColor = isCompleted ? "text-on-surface-variant" : (path.difficulty === "advanced" ? "text-secondary" : "text-primary");
              const glowClass = isCompleted ? "" : "shadow-[0_0_10px_rgba(83,221,252,0.5)]";

              return (
                <div key={path.id} className="glass-card rounded-2xl border border-outline-variant/10 group hover:border-primary/30 hover:shadow-[0_0_30px_rgba(83,221,252,0.1)] transition-all duration-300 transform hover:scale-[1.01] overflow-hidden">
                  <div className={`p-6 flex flex-col md:flex-row items-center gap-8 ${isCompleted ? 'opacity-70' : ''}`}>
                    <div className="w-16 h-16 rounded-xl bg-surface-bright flex items-center justify-center shrink-0 border border-outline-variant/20">
                      <span className={`material-symbols-outlined text-3xl ${iconColor}`}>{config.icon}</span>
                    </div>
                    
                    <div className="flex-1 space-y-3 w-full">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h3 className="text-xl font-headline font-semibold text-on-surface">{path.topic}</h3>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${config.class}`}>
                            {config.label}
                          </span>
                        </div>
                        <span className="text-xs text-on-surface-variant font-mono">
                          上次活动: {timeAgo(path.updated_at)}
                        </span>
                      </div>
                      
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-end text-xs mb-1">
                          <span className="text-on-surface-variant">学习进度: <span className="text-on-surface">{path.completed_chapters}/{path.total_chapters} 章节</span></span>
                          <span className={`font-mono font-bold ${isCompleted ? 'text-tertiary' : 'text-primary'}`}>
                            {isCompleted ? 'COMPLETED' : `${path.progress}%`}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-surface-variant rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${isCompleted ? 'bg-tertiary' : `bg-primary ${glowClass}`}`} 
                            style={{ width: `${path.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="shrink-0">
                      <Link href={`/learn/${path.id}`}>
                        <button className={isCompleted 
                          ? "bg-surface-bright text-on-surface px-6 py-3 rounded-xl font-headline font-bold text-sm flex items-center gap-2 hover:bg-surface-container-highest transition-all border border-outline-variant/30"
                          : "bg-primary text-on-primary px-6 py-3 rounded-xl font-headline font-bold text-sm flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-primary/20"
                        }>
                          {isCompleted ? "回顾内容" : "继续学习"}
                          <span className="material-symbols-outlined text-sm">{isCompleted ? "visibility" : "arrow_forward"}</span>
                        </button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          
          {/* AI Recommendation Card */}
          {!loading && filteredPaths.length > 0 && (
            <div className="relative group mt-12">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-secondary to-primary rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative bg-surface-container-highest rounded-2xl p-6 border border-primary/20 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-secondary/20 rounded-full flex items-center justify-center animate-pulse shrink-0">
                    <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                  </div>
                  <div>
                    <h4 className="text-on-surface font-headline font-bold">AI 学习建议</h4>
                    <p className="text-xs text-on-surface-variant mt-1">根据您的学习分布，建议开启 [算法与数据结构实战] 模块，契合度 98%</p>
                  </div>
                </div>
                <Link href="/">
                  <button className="bg-secondary text-on-secondary px-5 py-2.5 rounded-xl font-bold text-xs hover:scale-105 transition-transform active:scale-95 whitespace-nowrap">
                    立即开启新任务
                  </button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
      
      {/* Required styles from HTML */}
      <style dangerouslySetInnerHTML={{__html: `
        .cyber-grid {
            background-image: linear-gradient(to right, rgba(83, 221, 252, 0.05) 1px, transparent 1px),
                              linear-gradient(to bottom, rgba(83, 221, 252, 0.05) 1px, transparent 1px);
            background-size: 40px 40px;
        }
        .glass-card {
            backdrop-filter: blur(12px);
            background: rgba(20, 31, 56, 0.6);
        }
        .glow-text {
            text-shadow: 0 0 10px rgba(83, 221, 252, 0.5);
        }
      `}} />
    </div>
    </AuthGuard>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { getProgressPaths, type PathProgress } from "@/lib/api";
import { AuthGuard } from "@/components/AuthGuard";

const DIFFICULTY_LABEL: Record<string, { text: string; color: string; icon: string }> = {
  beginner: { text: "入门", color: "bg-green-500/15 text-green-400 border-green-500/20", icon: "school" },
  intermediate: { text: "中级", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20", icon: "terminal" },
  advanced: { text: "高级", color: "bg-red-500/15 text-red-400 border-red-500/20", icon: "rocket_launch" },
};

export default function LearnPage() {
  const { init } = useAuth();
  const [paths, setPaths] = useState<PathProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    async function fetchPaths() {
      try {
        setPaths(await getProgressPaths());
      } catch { /* ignore */ }
      setLoading(false);
    }
    fetchPaths();
  }, []);

  return (
    <AuthGuard>
    <div className="max-w-5xl mx-auto w-full pb-20 p-6 md:p-10 h-full overflow-y-auto">
      {/* Page Header */}
      <div className="mb-10">
        <div className="flex items-center gap-2 text-on-surface-variant text-xs mb-4 font-label tracking-widest uppercase">
          <Link href="/" className="hover:text-primary transition-colors">首页</Link>
          <span className="material-symbols-outlined text-[10px]">chevron_right</span>
          <span className="text-primary">学习路线</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold font-headline mb-3 tracking-tight">我的学习路线</h1>
        <p className="text-on-surface-variant">选择一条路线，开始你的编程进化之旅</p>
      </div>

      {loading ? (
        <div className="grid gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-surface-container-high rounded-2xl p-8 border border-outline-variant/10 animate-pulse h-36" />
          ))}
        </div>
      ) : paths.length === 0 ? (
        /* 空状态 */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-24 h-24 rounded-full bg-surface-container-high flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant">explore</span>
          </div>
          <h2 className="text-xl font-bold font-headline mb-2 text-on-surface">还没有学习路线</h2>
          <p className="text-on-surface-variant mb-6 max-w-md">
            去首页输入你感兴趣的编程主题，AI 将为你量身定制一条学习路线。
          </p>
          <Link
            href="/"
            className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-95 shadow-lg shadow-primary/20 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">auto_awesome</span>
            开始探索
          </Link>
        </div>
      ) : (
        /* 路线列表 */
        <div className="grid gap-5">
          {paths.map(path => {
            const diff = DIFFICULTY_LABEL[path.difficulty] || DIFFICULTY_LABEL.intermediate;
            const isCompleted = path.progress === 100;

            return (
              <Link
                key={path.id}
                href={`/learn/${path.id}`}
                className="group relative bg-surface-container-high rounded-2xl p-6 border border-outline-variant/10 hover:border-primary/30 hover:shadow-[0_0_30px_rgba(83,221,252,0.08)] transition-all duration-300"
              >
                <div className="flex items-center gap-6">
                  {/* Icon */}
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0 group-hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {diff.icon}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <h3 className="text-lg font-bold font-headline text-on-surface group-hover:text-primary transition-colors truncate">
                        {path.topic}
                      </h3>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${diff.color}`}>
                        {diff.text}
                      </span>
                      {isCompleted && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20 shrink-0">
                          已完成
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                      <span>{path.completed_chapters}/{path.total_chapters} 章节</span>
                      <span>·</span>
                      <span className={`font-mono font-bold ${isCompleted ? "text-green-400" : "text-primary"}`}>
                        {path.progress}%
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="h-1.5 w-full bg-surface-container-low rounded-full overflow-hidden mt-3">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${isCompleted ? "bg-green-400" : "bg-gradient-to-r from-primary to-secondary"}`}
                        style={{ width: `${path.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Arrow */}
                  <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0">
                    arrow_forward
                  </span>
                </div>
              </Link>
            );
          })}

          {/* CTA: 创建新路线 */}
          <Link
            href="/"
            className="group flex items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed border-outline-variant/20 hover:border-primary/40 text-on-surface-variant hover:text-primary transition-all"
          >
            <span className="material-symbols-outlined text-2xl">add_circle</span>
            <span className="font-medium">创建新的学习路线</span>
          </Link>
        </div>
      )}
    </div>
    </AuthGuard>
  );
}

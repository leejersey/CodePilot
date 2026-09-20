"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  GitFork,
  CheckCircle2,
  PlayCircle,
  Lock,
  BookOpen,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { getPath, getPathChapters, type Chapter, type LearningPath } from "@/lib/api";

export function Sidebar() {
  const params = useParams();
  const router = useRouter();
  const pathId = params.pathId as string | undefined;
  const chapterId = params.chapterId as string | undefined;

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [pathInfo, setPathInfo] = useState<Pick<LearningPath, "topic"> | null>(null);

  useEffect(() => {
    if (!pathId) return;

    async function fetchData() {
      try {
        const [path, chapterList] = await Promise.all([
          getPath(pathId!),
          getPathChapters(pathId!),
        ]);
        setPathInfo({ topic: path.topic });
        setChapters(chapterList);
      } catch { /* ignore */ }
    }
    fetchData();

    // 监听章节状态变化事件
    const handler = () => fetchData();
    window.addEventListener("chapter-status-changed", handler);
    return () => window.removeEventListener("chapter-status-changed", handler);
  }, [pathId]);

  const completedCount = chapters.filter(c => c.status === "completed").length;
  const totalCount = chapters.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const currentChapter = chapters.find(c => c.status === "unlocked" || c.status === "in_progress");

  return (
    <aside className="hidden lg:flex flex-col h-[calc(100vh-64px)] w-64 fixed left-0 top-16 bg-white/90 dark:bg-[#070b14]/95 backdrop-blur-xl border-r border-slate-200/80 dark:border-white/5 py-4 px-4 z-40 transition-colors duration-200">
      {/* Header */}
      <div className="mb-5 px-2">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-500 dark:text-cyan-400 shrink-0">
            <GitFork className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-headline leading-tight truncate">
              {pathInfo?.topic || "学习路径"}
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              {progressPercent}% · {completedCount}/{totalCount} 章节
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-900 rounded-full overflow-hidden mt-3 mb-3 border border-slate-300/40 dark:border-white/5">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-primary rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {currentChapter && (
          <button
            className="w-full py-2 bg-gradient-to-r from-cyan-500 to-primary text-slate-950 font-bold rounded-xl text-xs transition-all active:scale-95 duration-150 shadow-[0_0_12px_rgba(6,182,212,0.2)] hover:opacity-90 flex items-center justify-center gap-1.5"
            onClick={() => router.push(`/learn/${pathId}/${currentChapter.id}`)}
          >
            <Sparkles className="w-3.5 h-3.5" />
            继续学习本章
          </button>
        )}
      </div>

      {/* Chapter List */}
      <nav className="flex-1 space-y-1 overflow-y-auto no-scrollbar pr-1">
        {chapters.map((ch) => {
          const isActive = ch.id === chapterId;
          const isLocked = ch.status === "locked";
          const isCompleted = ch.status === "completed";
          const isInProgress = ch.status === "in_progress" || ch.status === "unlocked";

          return (
            <div
              key={ch.id}
              className={`group flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all cursor-pointer text-xs ${
                isActive
                  ? "bg-sky-500/15 dark:bg-cyan-500/15 text-sky-800 dark:text-cyan-300 font-semibold border border-sky-400/40 dark:border-cyan-500/30 shadow-xs"
                  : isLocked
                  ? "text-slate-400 dark:text-slate-600 cursor-not-allowed"
                  : "text-slate-700 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              onClick={() => {
                if (!isLocked && pathId) router.push(`/learn/${pathId}/${ch.id}`);
              }}
            >
              <div className="shrink-0">
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                ) : isInProgress ? (
                  <PlayCircle className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400 animate-pulse" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
                )}
              </div>
              <span className="truncate">
                {ch.sort_order}. {ch.title}
              </span>
            </div>
          );
        })}

        {chapters.length === 0 && (
          <div className="text-center py-10 text-slate-500 dark:text-slate-600 text-xs">
            <BookOpen className="w-6 h-6 mx-auto mb-2 opacity-50" />
            选择学习路线后<br />章节目录将在此显现
          </div>
        )}
      </nav>

      {/* Footer: Back to path */}
      {pathId && (
        <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-white/5 px-2">
          <button
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors w-full py-1.5"
            onClick={() => router.push(`/learn/${pathId}`)}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回路线大纲</span>
          </button>
        </div>
      )}
    </aside>
  );
}


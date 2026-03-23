"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Chapter {
  id: string;
  sort_order: number;
  title: string;
  status: string;
}

interface PathInfo {
  topic: string;
}

export function Sidebar() {
  const params = useParams();
  const router = useRouter();
  const pathId = params.pathId as string | undefined;
  const chapterId = params.chapterId as string | undefined;

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [pathInfo, setPathInfo] = useState<PathInfo | null>(null);

  useEffect(() => {
    if (!pathId) return;

    async function fetchData() {
      try {
        const [pathRes, chRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/paths/${pathId}`),
          fetch(`${API_BASE}/api/v1/paths/${pathId}/chapters`),
        ]);
        if (pathRes.ok) setPathInfo(await pathRes.json());
        if (chRes.ok) setChapters(await chRes.json());
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

  const STATUS_ICON: Record<string, { icon: string; style: string }> = {
    completed: { icon: "check_circle", style: "text-primary" },
    unlocked: { icon: "play_circle", style: "text-secondary" },
    in_progress: { icon: "play_circle", style: "text-secondary animate-pulse" },
    locked: { icon: "lock", style: "text-slate-600" },
  };

  return (
    <aside className="hidden lg:flex flex-col h-[calc(100vh-64px)] w-64 fixed left-0 top-16 bg-[#091328] border-r border-white/5 py-4 px-4 z-40">
      {/* Header */}
      <div className="mb-6 px-2">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>account_tree</span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-cyan-400 font-headline leading-tight truncate">
              {pathInfo?.topic || "Learning Path"}
            </h2>
            <p className="text-xs text-slate-500">{progressPercent}% · {completedCount}/{totalCount} 章节</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden mt-3 mb-4">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>

        {currentChapter && (
          <button
            className="w-full py-2 bg-primary text-on-primary font-medium rounded-lg text-sm transition-all active:scale-95 duration-150"
            onClick={() => router.push(`/learn/${pathId}/${currentChapter.id}`)}
          >
            继续学习
          </button>
        )}
      </div>

      {/* Chapter List */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto no-scrollbar">
        {chapters.map((ch) => {
          const isActive = ch.id === chapterId;
          const isLocked = ch.status === "locked";
          const iconInfo = STATUS_ICON[ch.status] || STATUS_ICON.locked;

          return (
            <div
              key={ch.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                isActive
                  ? "bg-cyan-500/10 text-cyan-400 border-r-2 border-cyan-400 font-medium"
                  : isLocked
                  ? "text-slate-600 cursor-not-allowed"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
              onClick={() => {
                if (!isLocked && pathId) router.push(`/learn/${pathId}/${ch.id}`);
              }}
            >
              <span
                className={`material-symbols-outlined text-sm ${iconInfo.style}`}
                style={ch.status === "completed" ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {iconInfo.icon}
              </span>
              <span className="text-sm truncate">{ch.sort_order}. {ch.title}</span>
            </div>
          );
        })}

        {chapters.length === 0 && (
          <div className="text-center py-8 text-slate-600 text-xs">
            <span className="material-symbols-outlined text-2xl block mb-2">menu_book</span>
            选择学习路线后<br />章节将在此显示
          </div>
        )}
      </nav>

      {/* Footer: Back to path */}
      {pathId && (
        <div className="mt-4 pt-4 border-t border-white/5 px-2">
          <button
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors w-full"
            onClick={() => router.push(`/learn/${pathId}`)}
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            返回路线总览
          </button>
        </div>
      )}
    </aside>
  );
}

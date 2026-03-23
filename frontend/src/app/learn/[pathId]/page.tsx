"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getPath, getPathChapters,
  type LearningPath, type Chapter,
} from "@/lib/api";

const CHAPTER_ICONS = [
  "lightbulb", "bolt", "refresh", "database", "architecture",
  "psychology", "terminal", "code", "rocket_launch", "auto_awesome",
];

export default function LearningPathPage() {
  const params = useParams();
  const router = useRouter();
  const pathId = params.pathId as string;

  const [path, setPath] = useState<LearningPath | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const [pathData, chaptersData] = await Promise.all([
          getPath(pathId),
          getPathChapters(pathId),
        ]);
        setPath(pathData);
        setChapters(chaptersData);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }

    if (pathId) fetchData();
  }, [pathId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
          <p className="mt-4 text-on-surface-variant">加载学习路线...</p>
        </div>
      </div>
    );
  }

  if (error || !path) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-red-400">error</span>
          <p className="mt-4 text-red-400">{error || "路线不存在"}</p>
          <button
            className="mt-6 px-6 py-2.5 rounded-lg bg-primary text-on-primary-container font-medium"
            onClick={() => router.push("/")}
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  const completedCount = chapters.filter((c) => c.status === "completed").length;
  const totalCount = chapters.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const currentChapter = chapters.find((c) => c.status === "unlocked" || c.status === "in_progress");

  return (
    <div className="max-w-6xl mx-auto w-full pb-20 p-6 md:p-10 h-full overflow-y-auto">
      {/* Breadcrumbs & Header */}
      <div className="mb-10">
        <div className="flex items-center gap-2 text-on-surface-variant text-xs mb-4 font-label tracking-widest uppercase">
          <button onClick={() => router.push("/")} className="hover:text-primary transition-colors">首页</button>
          <span className="material-symbols-outlined text-[10px]">chevron_right</span>
          <span className="text-primary">{path.topic}</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold font-headline mb-4 tracking-tight">{path.topic}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-primary/20 text-primary uppercase">
            {path.difficulty}
          </span>
          {path.outline?.prerequisites?.map((p, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* Overall Progress Section */}
      <section className="mb-12 bg-surface-container-low rounded-xl p-6 border border-outline-variant/10 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-primary shadow-[0_0_15px_rgba(83,221,252,0.5)]"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <div className="flex justify-between items-end mb-3">
              <span className="text-sm font-medium text-on-surface">总体进度</span>
              <span className="text-2xl font-bold font-headline text-primary">{progressPercent}%</span>
            </div>
            <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className="h-full bg-primary shadow-[0_0_10px_rgba(83,221,252,0.3)] transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="text-center px-4">
              <div className="text-xs text-on-surface-variant mb-1 uppercase font-label tracking-tighter">已完成章节</div>
              <div className="text-xl font-bold font-headline">{completedCount}/{totalCount}</div>
            </div>
            <div className="w-px h-10 bg-outline-variant/30 hidden md:block"></div>
            <div className="text-center px-4">
              <div className="text-xs text-on-surface-variant mb-1 uppercase font-label tracking-tighter">预计时长</div>
              <div className="text-xl font-bold font-headline">{path.outline?.estimated_hours || "?"}h</div>
            </div>
          </div>
        </div>
      </section>

      {/* Learning Path Cards - Bento Style Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {chapters.map((chapter, idx) => {
          const isCompleted = chapter.status === "completed";
          const isActive = chapter.status === "unlocked" || chapter.status === "in_progress";
          const isLocked = chapter.status === "locked";
          const icon = CHAPTER_ICONS[idx % CHAPTER_ICONS.length];

          // Active chapter: large card spanning 2 columns
          if (isActive) {
            return (
              <div
                key={chapter.id}
                className="group relative col-span-1 md:col-span-2 bg-gradient-to-br from-surface-container-highest to-surface-container-high rounded-xl p-8 border border-secondary/30 shadow-[0_0_20px_rgba(172,138,255,0.05)] cursor-pointer hover:border-secondary/60 transition-colors"
                onClick={() => router.push(`/learn/${pathId}/${chapter.id}`)}
              >
                <div className="flex flex-col md:flex-row gap-8">
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center text-secondary shadow-[0_0_15px_rgba(172,138,255,0.2)]">
                        <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                      </div>
                      <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-secondary/20 text-secondary uppercase tracking-widest animate-pulse">
                        {chapter.status === "in_progress" ? "进行中" : "可开始"}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold mb-3 font-headline text-white">
                      {chapter.sort_order}. {chapter.title}
                    </h3>
                    <p className="text-on-surface-variant mb-6 text-base leading-relaxed">
                      {chapter.summary}
                    </p>
                    <button className="bg-secondary text-on-secondary px-8 py-3 rounded-lg font-bold text-sm tracking-wide transition-all active:scale-95 shadow-lg shadow-secondary/10">
                      开始学习
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          // Completed chapter
          if (isCompleted) {
            return (
              <div key={chapter.id} className="group relative bg-surface-container-high rounded-xl p-6 border border-primary/20 transition-all hover:bg-surface-bright/50">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary/20 text-primary uppercase tracking-tighter">已完成</span>
                </div>
                <h3 className="text-lg font-bold mb-2 font-headline">{chapter.sort_order}. {chapter.title}</h3>
                <p className="text-sm text-on-surface-variant line-clamp-2 mb-6">{chapter.summary}</p>
                <div className="flex items-center justify-end mt-auto">
                  <button
                    className="text-primary text-sm font-medium flex items-center gap-1 hover:underline"
                    onClick={() => router.push(`/learn/${pathId}/${chapter.id}`)}
                  >
                    回顾内容 <span className="material-symbols-outlined text-xs">arrow_forward</span>
                  </button>
                </div>
              </div>
            );
          }

          // Locked chapter
          return (
            <div key={chapter.id} className="group relative bg-surface-container-low rounded-xl p-6 border border-outline-variant/10 opacity-70">
              <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[2px] rounded-xl z-10 group-hover:backdrop-blur-none transition-all">
                <span className="material-symbols-outlined text-4xl text-outline-variant">lock</span>
              </div>
              <div className="mb-6">
                <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-outline">
                  <span className="material-symbols-outlined">{icon}</span>
                </div>
              </div>
              <h3 className="text-lg font-bold mb-2 font-headline text-on-surface-variant">{chapter.sort_order}. {chapter.title}</h3>
              <p className="text-sm text-on-surface-variant line-clamp-2">{chapter.summary}</p>
            </div>
          );
        })}
      </div>

      {/* Footer AI Hint */}
      {currentChapter && (
        <div className="mt-16 p-8 rounded-2xl bg-surface-container-high border border-outline-variant/20 flex flex-col md:flex-row items-center gap-8">
          <div className="w-16 h-16 rounded-full bg-tertiary/10 flex items-center justify-center text-tertiary">
            <span className="material-symbols-outlined text-3xl">psychology</span>
          </div>
          <div className="flex-1 text-center md:text-left">
            <h4 className="text-lg font-bold font-headline mb-1">AI 学习助手提示</h4>
            <p className="text-on-surface-variant text-sm">
              你的下一步是学习「{currentChapter.title}」。准备好了就点击开始吧！
            </p>
          </div>
          <button
            className="px-6 py-2.5 rounded-lg border border-outline-variant text-sm font-medium hover:bg-white/5 transition-colors"
            onClick={() => router.push(`/learn/${pathId}/${currentChapter.id}`)}
          >
            开始学习
          </button>
        </div>
      )}
    </div>
  );
}

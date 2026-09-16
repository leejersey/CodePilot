"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { getProgressPaths, deletePath, type PathProgress, getPathSourceLabel } from "@/lib/api";
import { AuthGuard } from "@/components/AuthGuard";
import { useDialog } from "@/components/DialogProvider";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { CardSkeleton } from "@/components/common/Skeleton";
import { DifficultyBadge, KnowledgeBadge } from "@/components/common/Badge";
import {
  Compass,
  ChevronRight,
  GraduationCap,
  Terminal,
  Rocket,
  Sparkles,
  Trash2,
  ArrowRight,
  PlusCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";

const DIFFICULTY_ICON_MAP = {
  beginner: GraduationCap,
  intermediate: Terminal,
  advanced: Rocket,
};

export default function LearnPage() {
  const { init } = useAuth();
  const { confirm, alert } = useDialog();
  const [paths, setPaths] = useState<PathProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  async function handleDelete(e: MouseEvent, path: PathProgress) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm({
      title: "删除学习路线",
      message: `确定删除学习路线「${path.topic}」？章节与相关进度将一并删除。`,
      confirmText: "删除",
      tone: "danger",
    });
    if (!ok) return;
    setDeletingId(path.id);
    try {
      await deletePath(path.id);
      setPaths((prev) => prev.filter((p) => p.id !== path.id));
    } catch (err) {
      await alert({
        title: "删除失败",
        message: err instanceof Error ? err.message : "删除失败",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto w-full pb-20 p-6 md:p-10 h-full overflow-y-auto space-y-8">
        {/* Page Header */}
        <div className="border-b border-slate-200 dark:border-white/5 pb-6">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs mb-3 font-mono">
            <Link href="/" className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">首页</Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
            <span className="text-cyan-600 dark:text-cyan-400 font-medium">学习路线</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold font-headline tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3">
            <Compass className="w-8 h-8 text-cyan-600 dark:text-cyan-400" />
            我的定制学习路线
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1.5">
            选择正在推进的技术路线，循序渐进掌握底层原理与实战技能
          </p>
        </div>

        {loading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map(i => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : paths.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="还没有任何学习路线"
            description="在首页输入想要掌握的技术栈或业务主题，AI 将为你规划结构化的全套进阶路线"
            action={{
              label: "前往首页生成路线",
              href: "/",
            }}
          />
        ) : (
          <div className="grid gap-4">
            {paths.map(path => {
              const diffKey = (path.difficulty as keyof typeof DIFFICULTY_ICON_MAP) || "intermediate";
              const DiffIcon = DIFFICULTY_ICON_MAP[diffKey] || Terminal;
              const isCompleted = path.progress === 100;
              const src = getPathSourceLabel(path.source_type);

              return (
                <Link
                  key={path.id}
                  href={`/learn/${path.id}`}
                  className="group block"
                >
                  <Card className="p-6 hover:border-cyan-500/30 transition-all duration-300">
                    <div className="flex items-center gap-5">
                      {/* Icon */}
                      <div className="w-13 h-13 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 group-hover:scale-105 group-hover:bg-cyan-500/20 transition-all">
                        <DiffIcon className="w-6 h-6" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5 mb-2">
                          <h3 className="text-lg font-bold font-headline text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors truncate">
                            {path.topic}
                          </h3>
                          {src.type === "knowledge_base" ? (
                            <KnowledgeBadge kbName={path.kb_names?.[0]} />
                          ) : null}
                          <DifficultyBadge difficulty={path.difficulty} />
                          {isCompleted && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                              <CheckCircle2 className="w-3 h-3" />
                              已通关
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono">
                          <span>{path.completed_chapters}/{path.total_chapters} 章节</span>
                          <span>·</span>
                          <span className={`font-bold ${isCompleted ? "text-emerald-600 dark:text-emerald-400" : "text-cyan-600 dark:text-cyan-400"}`}>
                            完成度 {path.progress}%
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden mt-3 border border-slate-200/80 dark:border-white/5">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              isCompleted
                                ? "bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                                : "bg-gradient-to-r from-cyan-500 to-primary shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                            }`}
                            style={{ width: `${path.progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Action */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          title="删除路线"
                          disabled={deletingId === path.id}
                          onClick={(e) => handleDelete(e, path)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 dark:text-slate-500 dark:hover:text-rose-400 transition-colors disabled:opacity-50"
                        >
                          {deletingId === path.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                        <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-surface-container flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 group-hover:bg-cyan-50 dark:group-hover:bg-cyan-500/10 group-hover:translate-x-0.5 transition-all">
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}

            {/* CTA: 创建新路线 */}
            <Link
              href="/"
              className="group flex items-center justify-center gap-3 p-6 rounded-2xl border border-dashed border-slate-300 dark:border-white/10 hover:border-cyan-500 hover:bg-cyan-50/50 dark:hover:bg-cyan-500/5 text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all duration-300"
            >
              <PlusCircle className="w-5 h-5 text-cyan-600 dark:text-cyan-400 group-hover:scale-110 transition-transform" />
              <span className="font-semibold text-sm">定制生成新的学习路线</span>
            </Link>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}


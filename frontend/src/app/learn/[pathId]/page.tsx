"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getPath,
  getPathChapters,
  getPathKnowledgeBases,
  rebuildPathFromKb,
  type LearningPath,
  type Chapter,
  type KnowledgeBase,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useDialog } from "@/components/DialogProvider";
import { Badge } from "@/components/common/Badge";
import { Card } from "@/components/common/Card";
import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Layers,
  Lock,
  Play,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";

export default function LearningPathPage() {
  const params = useParams();
  const router = useRouter();
  const pathId = params.pathId as string;
  const { isAdmin } = useAuth();
  const { confirm } = useDialog();

  const [path, setPath] = useState<LearningPath | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [boundKbs, setBoundKbs] = useState<KnowledgeBase[]>([]);
  const [rebuilding, setRebuilding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const [pathData, chaptersData, pathKbs] = await Promise.all([
          getPath(pathId),
          getPathChapters(pathId),
          getPathKnowledgeBases(pathId).catch(() => [] as KnowledgeBase[]),
        ]);
        setPath(pathData);
        setChapters(chaptersData);
        setBoundKbs(pathKbs);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }

    if (pathId) fetchData();
  }, [pathId]);

  const handleRebuildFromKb = async () => {
    const ok = await confirm({
      title: "重建课程大纲",
      message:
        "将根据平台知识库重新生成章节大纲（替换现有章节，学习进度会重置）。是否继续？",
      confirmText: "继续重建",
      tone: "danger",
    });
    if (!ok) return;
    setRebuilding(true);
    setError("");
    try {
      const updated = await rebuildPathFromKb(pathId);
      setPath(updated);
      const [chaptersData, pathKbs] = await Promise.all([
        getPathChapters(pathId),
        getPathKnowledgeBases(pathId),
      ]);
      setChapters(chaptersData);
      setBoundKbs(pathKbs);
      window.dispatchEvent(new Event("chapter-status-changed"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "重建课程失败");
    } finally {
      setRebuilding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto animate-pulse shadow-[0_0_25px_rgba(83,221,252,0.2)]">
            <Sparkles size={24} />
          </div>
          <p className="text-sm font-medium text-slate-400 font-headline">正在加载知识图谱大纲...</p>
        </div>
      </div>
    );
  }

  if (error && !path) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-rose-400 font-medium text-base">{error || "路线不存在"}</p>
          <button
            className="px-6 py-2.5 rounded-xl bg-primary text-on-primary-container font-medium text-sm hover:bg-primary-dim transition-all"
            onClick={() => router.push("/")}
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (!path) return null;

  const completedCount = chapters.filter((c) => c.status === "completed").length;
  const totalCount = chapters.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const currentChapter = chapters.find((c) => c.status === "unlocked" || c.status === "in_progress");

  const rag = path.outline?.rag;
  const isKb = rag?.source_type === "knowledge_base" || rag?.used;

  return (
    <div className="max-w-5xl mx-auto w-full pb-24 px-6 md:px-10 h-full overflow-y-auto">
      {/* Breadcrumbs & Header */}
      <div className="pt-6 mb-8">
        <div className="flex items-center gap-2 text-slate-500 text-xs mb-3 font-mono">
          <Link href="/" className="hover:text-primary transition-colors">
            首页
          </Link>
          <ChevronRight size={12} />
          <span className="text-slate-400 truncate max-w-[200px]">{path.topic}</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-5xl font-bold font-headline mb-3 tracking-tight text-white">
              {path.topic}
            </h1>
            <div className="flex items-center gap-2.5 flex-wrap">
              {isKb ? (
                <Badge variant="rag">知识库增强课程</Badge>
              ) : (
                <span className="px-2.5 py-1 text-xs rounded-full border border-slate-700 bg-slate-800/80 text-slate-300 font-medium">
                  通用 AI 路线
                </span>
              )}
              <Badge difficulty={path.difficulty} />
              {path.outline?.prerequisites?.map((p, i) => (
                <span
                  key={i}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-400"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* RAG Knowledge Base Banner */}
      {isKb ? (
        <Card className="mb-8 p-5 border-secondary/30 bg-secondary/10" enableSpotlight={false}>
          <div className="flex items-start gap-3.5">
            <div className="p-2 rounded-xl bg-secondary/20 text-secondary shrink-0">
              <BookOpen size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-on-surface text-sm font-semibold mb-1">
                依据平台知识库生成
                {rag?.kb_names?.length ? (
                  <span className="text-secondary ml-1 font-mono">
                    「{rag.kb_names.join("、")}」
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-on-surface-variant/80 leading-relaxed">
                本课程融合了向量知识库中的真实开发文档，所有案例与练习均贴合企业级场景。
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="mb-8 p-5 border-amber-500/20 bg-amber-500/5" enableSpotlight={false}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 shrink-0">
                <Sparkles size={18} />
              </div>
              <div>
                <p className="text-amber-200 text-sm font-semibold">通用 AI 生成大纲</p>
                <p className="text-xs text-amber-200/70 mt-0.5">
                  平台如果上线了该领域的专业技术资料，可随时一键基于知识库重构章节。
                </p>
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-medium hover:bg-amber-500/25 transition-all disabled:opacity-50 active:scale-95"
              onClick={handleRebuildFromKb}
              disabled={rebuilding}
            >
              <RefreshCw size={13} className={rebuilding ? "animate-spin" : ""} />
              {rebuilding ? "重建中..." : "用知识库重建"}
            </button>
          </div>
        </Card>
      )}

      {/* Progress Metric Card */}
      <Card className="mb-12 p-6" enableSpotlight>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-headline">
                技能通关进度
              </span>
              <span className="text-2xl font-bold font-headline text-primary font-mono">
                {progressPercent}%
              </span>
            </div>
            <div className="h-2.5 w-full bg-surface-container-highest rounded-full overflow-hidden p-0.5 border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-primary to-secondary rounded-full shadow-[0_0_12px_rgba(83,221,252,0.4)] transition-all duration-700"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-6 shrink-0 pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-white/10 md:pl-8">
            <div>
              <div className="text-[11px] text-slate-500 font-headline uppercase mb-1">完成章节</div>
              <div className="text-xl font-bold font-mono text-white">
                {completedCount} <span className="text-sm font-normal text-slate-500">/ {totalCount}</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 font-headline uppercase mb-1">预计用时</div>
              <div className="text-xl font-bold font-mono text-cyan-400 flex items-center gap-1">
                <Clock size={16} />
                {path.outline?.estimated_hours || 4}h
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Knowledge Tree Roadmap (Spine Timeline) */}
      <div className="mb-12">
        <h2 className="text-lg font-bold font-headline text-white mb-8 flex items-center gap-2">
          <Layers size={18} className="text-primary" />
          知识演进树
        </h2>

        <div className="relative pl-6 md:pl-10 space-y-8 before:absolute before:left-3.5 md:before:left-5 before:top-4 before:bottom-4 before:w-[2px] before:bg-gradient-to-b before:from-primary/60 before:via-secondary/40 before:to-slate-800">
          {chapters.map((chapter, idx) => {
            const isCompleted = chapter.status === "completed";
            const isActive = chapter.status === "unlocked" || chapter.status === "in_progress";
            const isLocked = !isCompleted && !isActive;

            return (
              <div key={chapter.id} className="relative group">
                {/* Node on the Timeline Spine */}
                <div
                  className={`absolute -left-[30px] md:-left-[46px] top-6 w-7 h-7 rounded-full flex items-center justify-center border z-10 transition-all ${
                    isCompleted
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                      : isActive
                      ? "bg-primary border-primary text-surface shadow-[0_0_20px_rgba(83,221,252,0.5)] animate-pulse"
                      : "bg-surface-container-low border-white/10 text-slate-600"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 size={15} />
                  ) : isActive ? (
                    <Play size={13} className="ml-0.5 fill-current" />
                  ) : (
                    <Lock size={12} />
                  )}
                </div>

                {/* Chapter Card */}
                <div
                  onClick={() => !isLocked && router.push(`/learn/${pathId}/${chapter.id}`)}
                  className={`p-6 rounded-2xl border transition-all duration-300 ${
                    isActive
                      ? "bg-gradient-to-br from-surface-container-highest/90 to-surface-container-high border-secondary/40 shadow-[0_10px_35px_rgba(172,138,255,0.1)] cursor-pointer hover:border-secondary/70 hover:translate-x-1"
                      : isCompleted
                      ? "bg-surface-container-high/60 border-emerald-500/20 hover:border-emerald-500/40 cursor-pointer hover:bg-surface-bright/40"
                      : "bg-surface-container-low/40 border-white/[0.04] opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold text-slate-500">
                        CHAPTER {String(chapter.sort_order).padStart(2, "0")}
                      </span>
                      <h3
                        className={`text-lg font-bold font-headline ${
                          isActive ? "text-white" : isCompleted ? "text-slate-200" : "text-slate-400"
                        }`}
                      >
                        {chapter.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCompleted ? (
                        <span className="px-2.5 py-0.5 text-xs rounded-full bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20 flex items-center gap-1">
                          <CheckCircle2 size={12} /> 已通关
                        </span>
                      ) : isActive ? (
                        <span className="px-3 py-1 text-xs rounded-full bg-secondary/20 text-secondary font-bold uppercase tracking-wider animate-pulse border border-secondary/30">
                          {chapter.status === "in_progress" ? "学习中" : "当前目标"}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[11px] rounded-full bg-white/5 text-slate-500 border border-white/5 flex items-center gap-1">
                          <Lock size={11} /> 待解锁
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-slate-400 leading-relaxed mb-4">{chapter.summary}</p>

                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                    <span className="text-xs text-slate-500 font-mono">
                      {isCompleted ? "随时可复习" : isActive ? "支持 AI 流式伴学与沙箱实战" : "完成前序章节后开启"}
                    </span>

                    {!isLocked && (
                      <button
                        className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-xl transition-all ${
                          isActive
                            ? "bg-secondary text-surface font-bold hover:brightness-110 shadow-[0_0_15px_rgba(172,138,255,0.3)]"
                            : "text-slate-300 hover:text-primary hover:bg-white/5"
                        }`}
                      >
                        {isActive ? "开始学习" : "温故知新"}
                        <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Floating Next Chapter Tip */}
      {currentChapter && (
        <Card className="p-6 border-primary/30 bg-primary/5 mt-8 flex flex-col md:flex-row items-center justify-between gap-6" enableSpotlight>
          <div className="flex items-center gap-4 text-left">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shrink-0 shadow-[0_0_20px_rgba(83,221,252,0.3)]">
              <Bot size={24} />
            </div>
            <div>
              <h4 className="text-sm font-bold font-headline text-white mb-0.5">AI 导师推进建议</h4>
              <p className="text-xs text-slate-400">
                你的下一个学习里程碑是第 {currentChapter.sort_order} 章「{currentChapter.title}」。
              </p>
            </div>
          </div>
          <button
            className="shrink-0 flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-on-primary-container font-bold text-sm hover:bg-primary-dim transition-all active:scale-95 shadow-[0_4px_20px_rgba(83,221,252,0.25)]"
            onClick={() => router.push(`/learn/${pathId}/${currentChapter.id}`)}
          >
            立即推进
            <Zap size={15} />
          </button>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/common/Badge";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { CardSkeleton } from "@/components/common/Skeleton";
import { useDialog } from "@/components/DialogProvider";
import {
  adminListExercises,
  deleteExercise,
  generateExercise,
  listBackgroundJobs,
  listReadyKnowledgeBasesForExercises,
  retryBackgroundJob,
  updateExerciseStatus,
  type Exercise,
  type ExerciseSourceKb,
  type BackgroundJob,
} from "@/lib/api";
import {
  Archive,
  BookMarked,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  SearchX,
  Trash2,
  X,
  Zap,
} from "lucide-react";

const STATUS_TABS = [
  { key: "", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "published", label: "已发布" },
  { key: "archived", label: "已下架" },
] as const;

export default function AdminExercisesPage() {
  const { alert, confirm } = useDialog();
  const [items, setItems] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [generationJobs, setGenerationJobs] = useState<BackgroundJob[]>([]);

  const [showGenerate, setShowGenerate] = useState(false);
  const [kbs, setKbs] = useState<ExerciseSourceKb[]>([]);
  const [kbsLoading, setKbsLoading] = useState(false);
  const [genTopic, setGenTopic] = useState("");
  const [genLang, setGenLang] = useState("python");
  const [genDiff, setGenDiff] = useState("medium");
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [data, jobs] = await Promise.all([
        adminListExercises({ status: statusFilter || undefined }),
        listBackgroundJobs({ jobType: "exercise_generate" }),
      ]);
      setItems(data);
      setGenerationJobs(jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!generationJobs.some((job) => ["queued", "processing", "retrying"].includes(job.status))) return;
    let cancelled = false;
    let timer: number;
    const poll = async () => {
      await refresh(true);
      if (!cancelled) timer = window.setTimeout(poll, 2000);
    };
    timer = window.setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [generationJobs, refresh]);

  const openGenerate = async () => {
    setShowGenerate(true);
    setKbsLoading(true);
    try {
      const list = await listReadyKnowledgeBasesForExercises();
      setKbs(list);
      if (list.length === 1) setSelectedKbIds([list[0].id]);
    } catch {
      setKbs([]);
    } finally {
      setKbsLoading(false);
    }
  };

  const handleGenerate = async () => {
    const topic = genTopic.trim();
    if (topic.length < 2) {
      await alert({ title: "缺少主题", message: "请填写出题主题（至少 2 个字）" });
      return;
    }
    if (selectedKbIds.length === 0) {
      await alert({ title: "请选择知识库", message: "至少选择一个就绪知识库。" });
      return;
    }
    setIsGenerating(true);
    try {
      const job = await generateExercise({
        language: genLang,
        difficulty: genDiff,
        topic,
        knowledge_base_ids: selectedKbIds,
        publish: false,
      });
      setShowGenerate(false);
      setGenerationJobs((current) => [job, ...current]);
      setGenTopic("");
      await refresh();
      await alert({
        title: "已加入出题队列",
        message: "可离开本页，任务完成后会生成已验证或待修正的草稿。",
      });
    } catch (err) {
      await alert({
        title: "生成失败",
        message: err instanceof Error ? err.message : "出题失败",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const setStatus = async (ex: Exercise, status: "draft" | "published" | "archived") => {
    setBusyId(ex.id);
    try {
      await updateExerciseStatus(ex.id, status);
      await refresh();
    } catch (err) {
      await alert({
        title: "操作失败",
        message: err instanceof Error ? err.message : "更新状态失败",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (ex: Exercise) => {
    const ok = await confirm({
      title: "删除练习",
      message: `确定删除「${ex.title}」？提交记录将一并删除。`,
      confirmText: "删除",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(ex.id);
    try {
      await deleteExercise(ex.id);
      await refresh();
    } catch (err) {
      await alert({
        title: "删除失败",
        message: err instanceof Error ? err.message : "删除失败",
      });
    } finally {
      setBusyId(null);
    }
  };

  const statusLabel = (s?: string) =>
    s === "published" ? "已发布" : s === "archived" ? "已下架" : "草稿";

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <p className="text-xs font-mono text-primary mb-2">ADMIN · EXERCISES</p>
                <h1 className="text-3xl font-headline font-bold tracking-tight">
                  练习管理
                </h1>
                <p className="text-sm text-slate-400 mt-2 max-w-xl">
                  基于知识库 RAG 出题，审核后发布到学员「练习」页。学员端不能自行出题。
                </p>
              </div>
              <button
                type="button"
                onClick={openGenerate}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-on-primary-container text-sm font-bold"
              >
                <Plus size={16} />
                基于知识库出题
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/5 w-fit">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key || "all"}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    statusFilter === tab.key
                      ? "bg-primary/20 text-primary font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {generationJobs.slice(0, 3).map((job) => (
              <div key={job.id} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs ${job.status === "failed" ? "border-rose-500/25 bg-rose-500/10 text-rose-300" : "border-cyan-500/20 bg-cyan-500/10 text-cyan-200"}`}>
                <span>
                  {job.status === "completed" ? "出题完成" : job.status === "failed" ? `出题失败：${job.error_message}` : `后台出题中 · ${job.status} · 尝试 ${job.attempts || 1}`}
                </span>
                {job.status === "failed" && (
                  <button onClick={async () => { await retryBackgroundJob(job.id); await refresh(); }} className="rounded-lg border border-rose-400/30 px-3 py-1">重试</button>
                )}
              </div>
            ))}

            {error && (
              <div className="text-sm text-red-400 border border-red-500/30 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            {loading ? (
              <CardSkeleton count={4} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={<SearchX size={28} className="text-slate-500" />}
                title="暂无练习题"
                description="先选择知识库与主题生成草稿，再发布给学员。"
                actionText="出题"
                onAction={openGenerate}
              />
            ) : (
              <div className="space-y-3">
                {items.map((ex) => (
                  <Card key={ex.id} className="p-5">
                    <div className="flex flex-col md:flex-row md:items-start gap-4 justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                              ex.status === "published"
                                ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
                                : ex.status === "archived"
                                  ? "text-slate-400 border-white/10 bg-white/5"
                                  : "text-amber-300 border-amber-500/30 bg-amber-500/10"
                            }`}
                          >
                            {statusLabel(ex.status)}
                          </span>
                          <Badge language={ex.language} size="sm" />
                          <Badge difficulty={ex.difficulty} size="sm" />
                          {ex.source_kbs?.[0] && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-violet-300 truncate max-w-[160px]">
                              <BookMarked size={10} />
                              {ex.source_kbs[0].name}
                            </span>
                          )}
                          <span className={`text-[10px] ${ex.validation_status === "verified" ? "text-emerald-300" : "text-amber-300"}`}>
                            {ex.validation_status === "verified" ? "已验证" : "待验证"}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-white mb-1">{ex.title}</h3>
                        <p className="text-xs text-slate-400 line-clamp-2">{ex.description}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {ex.status !== "published" && (
                          <button
                            type="button"
                            disabled={busyId === ex.id || ex.validation_status !== "verified"}
                            onClick={() => setStatus(ex, "published")}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                          >
                            <Eye size={13} />
                            发布
                          </button>
                        )}
                        <Link
                          href={`/admin/exercises/${ex.id}`}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
                        >
                          <Pencil size={13} />
                          编辑
                        </Link>
                        {ex.status === "published" && (
                          <button
                            type="button"
                            disabled={busyId === ex.id}
                            onClick={() => setStatus(ex, "draft")}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5"
                          >
                            <EyeOff size={13} />
                            撤回草稿
                          </button>
                        )}
                        {ex.status !== "archived" && (
                          <button
                            type="button"
                            disabled={busyId === ex.id}
                            onClick={() => setStatus(ex, "archived")}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-slate-400 hover:bg-white/5"
                          >
                            <Archive size={13} />
                            下架
                          </button>
                        )}
                        <Link
                          href={`/exercise/${ex.id}`}
                          className="text-xs px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10"
                        >
                          预览
                        </Link>
                        <button
                          type="button"
                          disabled={busyId === ex.id}
                          onClick={() => handleDelete(ex)}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 size={13} />
                          删除
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
      </div>

        {showGenerate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              aria-label="关闭"
              onClick={() => !isGenerating && setShowGenerate(false)}
            />
            <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-surface-container-high shadow-2xl p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-headline font-bold">基于知识库出题</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    检索所选知识库后由 AI 生成；默认存草稿。
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => setShowGenerate(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-white/5"
                >
                  <X size={16} />
                </button>
              </div>

              <label className="block text-xs font-bold text-slate-300 mb-1.5">主题</label>
              <input
                value={genTopic}
                onChange={(e) => setGenTopic(e.target.value)}
                placeholder="例如：pathlib 文件整理"
                className="w-full mb-3 bg-surface-container-low border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                disabled={isGenerating}
              />

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">语言</label>
                  <select
                    value={genLang}
                    onChange={(e) => setGenLang(e.target.value)}
                    className="w-full bg-surface-container-low border border-white/10 rounded-xl px-3 py-2 text-sm outline-none"
                    disabled={isGenerating}
                  >
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                    <option value="go">Go</option>
                    <option value="rust">Rust</option>
                    <option value="cpp">C++</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">难度</label>
                  <select
                    value={genDiff}
                    onChange={(e) => setGenDiff(e.target.value)}
                    className="w-full bg-surface-container-low border border-white/10 rounded-xl px-3 py-2 text-sm outline-none"
                    disabled={isGenerating}
                  >
                    <option value="easy">初级</option>
                    <option value="medium">中级</option>
                    <option value="hard">高级</option>
                  </select>
                </div>
              </div>

              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                知识库（可多选）
              </label>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-surface-container-low/50 mb-3">
                {kbsLoading ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    <Loader2 size={14} className="inline animate-spin mr-2" />
                    加载中…
                  </div>
                ) : kbs.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    暂无就绪知识库。
                    <Link href="/admin/knowledge" className="block mt-2 text-primary underline">
                      去知识库上传
                    </Link>
                  </div>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {kbs.map((kb) => {
                      const checked = selectedKbIds.includes(kb.id);
                      return (
                        <li key={kb.id}>
                          <button
                            type="button"
                            disabled={isGenerating}
                            onClick={() =>
                              setSelectedKbIds((prev) =>
                                checked
                                  ? prev.filter((x) => x !== kb.id)
                                  : [...prev, kb.id]
                              )
                            }
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm ${
                              checked ? "bg-primary/10" : "hover:bg-white/5"
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded border text-[10px] flex items-center justify-center ${
                                checked
                                  ? "bg-primary border-primary text-surface"
                                  : "border-white/20"
                              }`}
                            >
                              {checked ? "✓" : ""}
                            </span>
                            <span className="truncate">{kb.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <p className="mb-5 text-xs text-amber-300/80">
                生成后保存为草稿；参考答案通过 Judge0 验证后才可发布。
              </p>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => setShowGenerate(false)}
                  className="px-4 py-2 rounded-xl text-xs border border-white/10 text-slate-400"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={isGenerating || kbs.length === 0}
                  onClick={handleGenerate}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-primary text-on-primary-container disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      生成中…
                    </>
                  ) : (
                    <>
                      <Zap size={14} />
                      检索并出题
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  );
}

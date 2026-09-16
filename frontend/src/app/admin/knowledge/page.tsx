"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Database,
  FileText,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { CardSkeleton } from "@/components/common/Skeleton";
import { useDialog } from "@/components/DialogProvider";
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeBases,
  type KnowledgeBase,
} from "@/lib/api";

export default function AdminKnowledgePage() {
  const { confirm } = useDialog();
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await listKnowledgeBases());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("请输入知识库名称");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await createKnowledgeBase({
        name: name.trim(),
        description: description.trim(),
      });
      setName("");
      setDescription("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (kb: KnowledgeBase) => {
    const ok = await confirm({
      title: "删除知识库",
      message: `确定删除知识库「${kb.name}」？文档与向量将一并删除。`,
      confirmText: "删除",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteKnowledgeBase(kb.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div className="flex flex-col justify-between gap-4 border-b border-white/[0.07] pb-6 md:flex-row md:items-end">
        <div>
          <p className="mb-2 text-xs font-mono text-primary">ADMIN · KNOWLEDGE</p>
          <h1 className="flex items-center gap-3 font-headline text-3xl font-bold tracking-tight text-white">
            <Database className="h-7 w-7 text-cyan-400" />
            知识库管理
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            管理技术文档与教案，作为学习路线、文档教学和练习出题的 RAG 内容源。
          </p>
        </div>
        <button
          type="button"
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors ${
            showForm
              ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
              : "bg-primary text-on-primary-container hover:bg-primary-dim"
          }`}
          onClick={() => setShowForm((value) => !value)}
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? "取消新建" : "新建知识库"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {showForm && (
        <Card className="space-y-4 border-cyan-500/30 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-cyan-400">
            <Sparkles size={16} />
            新建专业知识库
          </div>
          <input
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm outline-none transition-colors focus:border-cyan-500"
            placeholder="知识库名称，例如：Go 并发编程核心规范"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <textarea
            className="min-h-24 w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm outline-none transition-colors focus:border-cyan-500"
            placeholder="知识库涵盖范围与适用课程（可选）"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="px-4 py-2 text-sm text-slate-400"
              onClick={() => setShowForm(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-xl bg-cyan-500 px-6 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? "创建中…" : "立即创建"}
            </button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((item) => (
            <CardSkeleton key={item} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Database}
          title="还没有知识库"
          description="创建知识库并上传资料，系统会自动切片和向量化。"
          action={{ label: "新建知识库", onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((kb) => (
            <Card
              key={kb.id}
              className="group flex flex-col justify-between p-6 transition-colors hover:border-cyan-500/30"
            >
              <div>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
                    <Database size={19} />
                  </div>
                  <span className="flex items-center gap-1.5 rounded-full border border-white/5 bg-slate-900/60 px-2.5 py-1 text-xs font-mono text-slate-400">
                    <FileText size={13} className="text-cyan-400" />
                    {kb.document_count} 个文档
                  </span>
                </div>
                <Link href={`/admin/knowledge/${kb.id}`}>
                  <h2 className="font-headline text-lg font-bold text-white transition-colors group-hover:text-cyan-400">
                    {kb.name}
                  </h2>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-400">
                    {kb.description || "暂无描述信息"}
                  </p>
                </Link>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                <Link
                  href={`/admin/knowledge/${kb.id}`}
                  className="flex items-center gap-1 text-xs font-semibold text-cyan-400"
                >
                  <Settings size={13} />
                  管理文档与向量
                </Link>
                <button
                  type="button"
                  title="删除知识库"
                  onClick={() => handleDelete(kb)}
                  className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

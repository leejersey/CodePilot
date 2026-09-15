"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { AdminGuard } from "@/components/AdminGuard";
import { useAuth } from "@/hooks/useAuth";
import {
  listKnowledgeBases,
  createKnowledgeBase,
  deleteKnowledgeBase,
  type KnowledgeBase,
} from "@/lib/api";
import { useDialog } from "@/components/DialogProvider";

export default function KnowledgePage() {
  const { init } = useAuth();
  const { confirm } = useDialog();
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  async function refresh() {
    try {
      setItems(await listKnowledgeBases());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("请输入知识库名称");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await createKnowledgeBase({ name: name.trim(), description: description.trim() });
      setName("");
      setDescription("");
      setShowForm(false);
      await refresh();
    } catch (err: unknown) {
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <AdminGuard>
      <Header />
      <main className="min-h-screen pt-24 pb-20 px-6 md:px-10 bg-background">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <div className="flex items-center gap-2 text-on-surface-variant text-xs mb-4 font-label tracking-widest uppercase">
                <Link href="/" className="hover:text-primary transition-colors">首页</Link>
                <span className="material-symbols-outlined text-[10px]">chevron_right</span>
                <span className="text-primary">知识库</span>
              </div>
              <h1 className="text-4xl font-bold font-headline mb-2 tracking-tight">平台知识库</h1>
              <p className="text-on-surface-variant">
                管理员上传 PDF / Markdown / TXT，学员生成课程与练习时将自动引用
              </p>
            </div>
            <button
              className="px-5 py-2.5 rounded-xl bg-primary text-on-primary-container font-bold text-sm hover:bg-primary-dim transition-all active:scale-95"
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? "取消" : "新建知识库"}
            </button>
          </div>

          {error && (
            <p className="mb-6 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          {showForm && (
            <div className="mb-8 p-6 rounded-2xl bg-surface-container-high border border-white/10 space-y-4">
              <input
                className="w-full bg-surface-container-low border border-white/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:border-primary/50"
                placeholder="知识库名称，例如：Python 官方文档摘录"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <textarea
                className="w-full bg-surface-container-low border border-white/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:border-primary/50 min-h-[88px]"
                placeholder="简要描述（可选）"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <button
                className="px-6 py-2.5 rounded-xl bg-secondary text-on-secondary font-bold text-sm disabled:opacity-50"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? "创建中..." : "创建"}
              </button>
            </div>
          )}

          {loading ? (
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 rounded-2xl bg-surface-container-high animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-24">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-4 block">
                menu_book
              </span>
              <h2 className="text-xl font-bold mb-2">还没有知识库</h2>
              <p className="text-on-surface-variant mb-6">创建后上传课程资料，生成路径时即可绑定</p>
              <button
                className="px-6 py-2.5 rounded-xl bg-primary text-on-primary-container font-bold text-sm"
                onClick={() => setShowForm(true)}
              >
                新建知识库
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {items.map((kb) => (
                <div
                  key={kb.id}
                  className="flex items-center justify-between gap-4 p-6 rounded-2xl bg-surface-container-high border border-white/5 hover:border-primary/30 transition-colors"
                >
                  <Link href={`/knowledge/${kb.id}`} className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold font-headline truncate">{kb.name}</h3>
                    <p className="text-sm text-on-surface-variant line-clamp-1 mt-1">
                      {kb.description || "暂无描述"}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">{kb.document_count} 个文档</p>
                  </Link>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/knowledge/${kb.id}`}
                      className="px-4 py-2 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors"
                    >
                      管理
                    </Link>
                    <button
                      className="px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      onClick={() => handleDelete(kb)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </AdminGuard>
  );
}

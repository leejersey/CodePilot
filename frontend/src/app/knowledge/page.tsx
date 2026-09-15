"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { AdminGuard } from "@/components/AdminGuard";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { CardSkeleton } from "@/components/common/Skeleton";
import {
  Database,
  Plus,
  ChevronRight,
  FileText,
  Trash2,
  Settings,
  Sparkles,
  AlertCircle,
  X,
} from "lucide-react";
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
      <div className="min-h-screen bg-[#070b14] text-slate-100">
        <Header />
        <main className="pt-24 pb-20 px-6 md:px-10">
          <div className="max-w-5xl mx-auto space-y-8">
            {/* 顶栏面包屑与操作区 */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/5 pb-6">
              <div>
                <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-3 font-mono">
                  <Link href="/" className="hover:text-cyan-400 transition-colors">首页</Link>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                  <span className="text-cyan-400 font-medium">知识库管理</span>
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight font-headline flex items-center gap-3">
                  <Database className="w-8 h-8 text-cyan-400" />
                  平台专属知识库
                </h1>
                <p className="text-slate-400 text-sm mt-1.5 max-w-2xl">
                  管理员上传行业技术文档或内部教案，AI 助教将在路线定制、代码讲解与练习生成中精准检索召回 (RAG)
                </p>
              </div>

              <button
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 active:scale-95 ${
                  showForm
                    ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    : "bg-gradient-to-r from-cyan-500 to-primary text-slate-950 font-bold shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:opacity-90"
                }`}
                onClick={() => setShowForm(!showForm)}
              >
                {showForm ? (
                  <>
                    <X className="w-4 h-4" />
                    取消新建
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    新建知识库
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-3 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* 新建知识库折叠表单 */}
            {showForm && (
              <Card className="p-6 border-cyan-500/30 bg-surface-container/80 space-y-4">
                <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
                  <Sparkles className="w-4 h-4" />
                  新建专业知识库
                </div>
                <div>
                  <input
                    className="w-full bg-slate-900/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500 transition-colors"
                    placeholder="知识库名称，例如：Go 并发编程核心规范"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <textarea
                    className="w-full bg-slate-900/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500 transition-colors min-h-[88px]"
                    placeholder="简要描述知识库涵盖的知识范畴与适用课程（可选）"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    className="px-5 py-2 rounded-xl text-slate-400 hover:text-slate-200 text-sm transition-colors"
                    onClick={() => setShowForm(false)}
                  >
                    取消
                  </button>
                  <button
                    className="px-6 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-sm disabled:opacity-50 hover:bg-cyan-400 transition-colors"
                    onClick={handleCreate}
                    disabled={creating}
                  >
                    {creating ? "创建中..." : "立即创建"}
                  </button>
                </div>
              </Card>
            )}

            {/* 知识库卡片列表 */}
            {loading ? (
              <div className="grid md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={Database}
                title="还没有知识库"
                description="创建知识库并上传标准文档或教案资料，AI 将自动切片向量化并在教学中无缝引用"
                action={{
                  label: "新建第一个知识库",
                  onClick: () => setShowForm(true),
                }}
              />
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {items.map((kb) => (
                  <Card
                    key={kb.id}
                    className="p-6 flex flex-col justify-between group hover:border-cyan-500/30 transition-all duration-300"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                          <Database className="w-5 h-5" />
                        </div>
                        <span className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900/60 border border-white/5 px-2.5 py-1 rounded-full font-mono">
                          <FileText className="w-3.5 h-3.5 text-cyan-400" />
                          {kb.document_count} 个文档
                        </span>
                      </div>

                      <Link href={`/knowledge/${kb.id}`}>
                        <h3 className="text-lg font-bold font-headline text-slate-100 group-hover:text-cyan-400 transition-colors mt-2">
                          {kb.name}
                        </h3>
                        <p className="text-sm text-slate-400 line-clamp-2 mt-1.5 leading-relaxed">
                          {kb.description || "暂无描述信息"}
                        </p>
                      </Link>
                    </div>

                    <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/5">
                      <Link
                        href={`/knowledge/${kb.id}`}
                        className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        管理文档与向量
                      </Link>
                      <button
                        className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                        title="删除知识库"
                        onClick={() => handleDelete(kb)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}


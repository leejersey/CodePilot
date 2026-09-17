"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Database,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Card } from "@/components/common/Card";
import { CardSkeleton } from "@/components/common/Skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { useDialog } from "@/components/DialogProvider";
import { useAuth } from "@/hooks/useAuth";
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  deleteKnowledgeDocument,
  getKnowledgeBase,
  listKnowledgeBases,
  submitKnowledgeBaseReview,
  uploadKnowledgeDocument,
  type KnowledgeBase,
  type KnowledgeBaseDetail,
} from "@/lib/api";
import {
  canSubmitKnowledgeBaseForReview,
  knowledgeBaseReviewLabel,
  knowledgeBaseUsageHint,
} from "@/lib/creatorStudio";

const DOC_STATUS_LABELS: Record<string, string> = {
  pending: "等待向量化",
  processing: "切片索引中",
  ready: "就绪可用于生成",
  failed: "处理失败",
};

const PROCESSING_DOC_STATUSES = ["pending", "processing"];

function approvalTone(approvalStatus?: string) {
  if (approvalStatus === "approved")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
  if (approvalStatus === "rejected")
    return "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300";
  return "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
}

export default function CreatorKnowledgePage() {
  const { alert, confirm } = useDialog();
  const { isAdmin } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openKbId, setOpenKbId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KnowledgeBaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [uploading, setUploading] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listKnowledgeBases());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "知识库加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadDetail = useCallback(async (kbId: string) => {
    setDetailLoading(true);
    try {
      setDetail(await getKnowledgeBase(kbId));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "文档加载失败");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    setDetail(null);
    if (!openKbId) return;
    void loadDetail(openKbId);
  }, [loadDetail, openKbId]);

  // 文档切片与向量化在后台进行，处理中时轮询到终态为止。
  useEffect(() => {
    if (!openKbId || !detail) return;
    const processing = detail.documents.some((doc) =>
      PROCESSING_DOC_STATUSES.includes(doc.status)
    );
    if (!processing) return;
    const timer = window.setTimeout(() => void loadDetail(openKbId), 2500);
    return () => window.clearTimeout(timer);
  }, [detail, loadDetail, openKbId]);

  async function handleCreate() {
    if (name.trim().length < 1) {
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
  }

  async function handleDelete(kb: KnowledgeBase) {
    const ok = await confirm({
      title: "删除知识库",
      message: `确定删除「${kb.name}」？文档与向量将一并删除；已被课程版本引用的知识库不能删除。`,
      confirmText: "删除",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(kb.id);
    try {
      await deleteKnowledgeBase(kb.id);
      if (openKbId === kb.id) setOpenKbId(null);
      await refresh();
    } catch (err) {
      await alert({
        title: "删除失败",
        message: err instanceof Error ? err.message : "删除失败",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleSubmitReview(kb: KnowledgeBase) {
    const ok = await confirm({
      title: "提交知识库审核",
      message: `「${kb.name}」将重新提交管理员审核，通过后才能被课程生成引用。`,
      confirmText: "提交审核",
    });
    if (!ok) return;
    setBusyId(kb.id);
    try {
      await submitKnowledgeBaseReview(kb.id);
      await refresh();
    } catch (err) {
      await alert({
        title: "提交失败",
        message: err instanceof Error ? err.message : "提交审核失败",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function uploadFiles(list: FileList | null) {
    if (!openKbId || !list || list.length === 0 || uploading) return;
    const files = Array.from(list);
    const failures: string[] = [];
    setError("");
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setUploading(`正在上传 (${index + 1}/${files.length})：${file.name}`);
        try {
          await uploadKnowledgeDocument(openKbId, file);
        } catch (err) {
          failures.push(
            `${file.name}（${err instanceof Error ? err.message : "上传失败"}）`
          );
        }
      }
    } finally {
      setUploading("");
      if (fileRef.current) fileRef.current.value = "";
    }
    await loadDetail(openKbId);
    await refresh();
    if (failures.length) setError(`部分文件未成功：${failures.join("；")}`);
  }

  async function handleDeleteDoc(docId: string, filename: string) {
    if (!openKbId) return;
    const ok = await confirm({
      title: "删除文档",
      message: `确定删除「${filename}」？向量切片会同步清理。`,
      confirmText: "删除",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteKnowledgeDocument(openKbId, docId);
      await loadDetail(openKbId);
      await refresh();
    } catch (err) {
      await alert({
        title: "删除失败",
        message: err instanceof Error ? err.message : "删除失败",
      });
    }
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 font-mono text-xs font-semibold text-secondary">
            CREATOR · KNOWLEDGE
          </p>
          <h1 className="flex items-center gap-2.5 font-headline text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            <Database size={26} className="text-cyan-600 dark:text-cyan-400" />
            我的知识库
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-400">
            上传自己的资料作为课程生成的内容来源。新建或修改后需经管理员审核，通过后才能用于生成课程。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((value) => !value)}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            showForm
              ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              : "bg-primary text-white hover:bg-primary-dim"
          }`}
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? "取消新建" : "新建知识库"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-500 dark:text-rose-400"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {showForm && (
        <Card className="space-y-4 p-6">
          <label htmlFor="creator-kb-name" className="block text-xs font-bold">
            知识库名称
          </label>
          <input
            id="creator-kb-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：Go 并发编程核心规范"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-primary dark:border-white/10 dark:bg-surface-container-low"
          />
          <label htmlFor="creator-kb-desc" className="block text-xs font-bold">
            描述（可选）
          </label>
          <textarea
            id="creator-kb-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="知识库涵盖范围与适用课程"
            className="min-h-20 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm outline-none focus:border-primary dark:border-white/10 dark:bg-surface-container-low"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border px-4 py-2 text-xs"
            >
              取消
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={() => void handleCreate()}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {creating && <Loader2 size={13} className="animate-spin" />}
              立即创建
            </button>
          </div>
        </Card>
      )}

      {loading ? (
        <CardSkeleton count={2} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Database size={28} />}
          title="还没有知识库"
          description="创建知识库并上传资料，系统会自动切片与向量化，之后即可用于生成课程。"
          actionText="新建知识库"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="space-y-4">
          {items.map((kb) => {
            const open = openKbId === kb.id;
            const readyCount = kb.ready_document_count ?? 0;
            return (
              <Card key={kb.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${approvalTone(kb.approval_status)}`}
                      >
                        {knowledgeBaseReviewLabel(kb)}
                      </span>
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500 dark:border-white/10">
                        {readyCount}/{kb.document_count} 个文档就绪
                      </span>
                    </div>
                    <h2 className="font-headline text-lg font-bold text-slate-900 dark:text-white">
                      {kb.name}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                      {kb.description || "暂无描述信息"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenKbId(open ? null : kb.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 px-3 py-1.5 text-xs text-cyan-700 dark:text-cyan-300"
                    >
                      <FileText size={13} /> {open ? "收起文档" : "管理文档"}
                    </button>
                    {canSubmitKnowledgeBaseForReview(kb, isAdmin) && (
                      <button
                        type="button"
                        disabled={busyId === kb.id}
                        onClick={() => void handleSubmitReview(kb)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-600 disabled:opacity-50 dark:text-emerald-300"
                      >
                        <Send size={13} /> 重新提交审核
                      </button>
                    )}
                    <button
                      type="button"
                      title="删除知识库"
                      aria-label={`删除知识库 ${kb.name}`}
                      disabled={busyId === kb.id}
                      onClick={() => void handleDelete(kb)}
                      className="rounded-lg border border-slate-200 p-2 text-slate-400 transition-colors hover:text-rose-500 disabled:opacity-50 dark:border-white/10"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  {knowledgeBaseUsageHint(kb)}
                </p>

                {kb.approval_status === "rejected" && kb.review_note && (
                  <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
                    共享未通过原因：{kb.review_note}
                  </p>
                )}

                {open && (
                  <div className="mt-5 border-t border-slate-200 pt-5 dark:border-white/10">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileRef}
                          type="file"
                          multiple
                          accept=".pdf,.md,.markdown,.txt,application/pdf,text/plain,text/markdown"
                          className="hidden"
                          onChange={(event) =>
                            void uploadFiles(event.target.files)
                          }
                        />
                        <button
                          type="button"
                          disabled={Boolean(uploading)}
                          onClick={() => fileRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {uploading ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <UploadCloud size={14} />
                          )}
                          上传文档
                        </button>
                        <span className="font-mono text-[10px] text-slate-500">
                          PDF / Markdown / TXT · 单文件 ≤ 10MB
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadDetail(kb.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-white/10"
                      >
                        <RefreshCw
                          size={13}
                          className={detailLoading ? "animate-spin" : ""}
                        />
                        刷新
                      </button>
                    </div>
                    {uploading && (
                      <p className="mt-3 font-mono text-xs text-cyan-600 dark:text-cyan-400">
                        {uploading}
                      </p>
                    )}

                    {detailLoading && !detail ? (
                      <p className="mt-4 text-xs text-slate-500">正在加载文档…</p>
                    ) : detail && detail.documents.length === 0 ? (
                      <p className="mt-4 text-xs text-slate-500">
                        知识库暂无文档，上传资料后系统会自动建立向量索引。
                      </p>
                    ) : (
                      <ul className="mt-4 space-y-2">
                        {detail?.documents.map((doc) => (
                          <li
                            key={doc.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-white/10"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                {doc.filename}
                              </p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-500">
                                <span>{(doc.byte_size / 1024).toFixed(1)} KB</span>
                                <span>{doc.chunk_count} 个切片</span>
                                <span>
                                  {DOC_STATUS_LABELS[doc.status] || doc.status}
                                </span>
                              </p>
                              {doc.error_message && (
                                <p className="mt-1 line-clamp-1 text-xs text-rose-500">
                                  {doc.error_message}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              aria-label={`删除文档 ${doc.filename}`}
                              onClick={() =>
                                void handleDeleteDoc(doc.id, doc.filename)
                              }
                              className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:text-rose-500"
                            >
                              <Trash2 size={15} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

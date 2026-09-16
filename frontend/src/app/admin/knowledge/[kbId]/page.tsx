"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Database,
  FileCode,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { useDialog } from "@/components/DialogProvider";
import {
  deleteKnowledgeDocument,
  getKnowledgeBase,
  uploadKnowledgeDocument,
  type KnowledgeBaseDetail,
} from "@/lib/api";

const STATUS_CONFIG: Record<
  string,
  {
    text: string;
    color: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  pending: {
    text: "等待向量化",
    color: "text-slate-400 bg-slate-500/10 border-slate-500/20",
    icon: Clock,
  },
  processing: {
    text: "切片索引中",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    icon: Loader2,
  },
  ready: {
    text: "就绪可检索",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    icon: CheckCircle2,
  },
  failed: {
    text: "处理失败",
    color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    icon: XCircle,
  },
};

const ACCEPT_EXT = new Set([".pdf", ".md", ".markdown", ".txt"]);
const MAX_BYTES = 10 * 1024 * 1024;

function fileExt(name: string) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

function filterAllowedFiles(list: FileList | File[]) {
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const file of Array.from(list)) {
    if (!ACCEPT_EXT.has(fileExt(file.name))) {
      rejected.push(`${file.name}（仅支持 PDF/MD/TXT）`);
    } else if (file.size > MAX_BYTES) {
      rejected.push(`${file.name}（超过 10MB）`);
    } else if (file.size === 0) {
      rejected.push(`${file.name}（空文件）`);
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

export default function AdminKnowledgeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const kbId = params.kbId as string;
  const { confirm } = useDialog();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kb, setKb] = useState<KnowledgeBaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setKb(await getKnowledgeBase(kbId));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [kbId]);

  useEffect(() => {
    if (kbId) void refresh();
  }, [kbId, refresh]);

  const uploadFiles = async (list: FileList | File[] | null) => {
    if (!list || uploading) return;
    const { accepted, rejected } = filterAllowedFiles(list);
    if (!accepted.length) {
      setError(rejected.length ? rejected.join("；") : "请选择文件");
      return;
    }
    setUploading(true);
    setError("");
    const failures = [...rejected];
    try {
      for (let index = 0; index < accepted.length; index += 1) {
        const file = accepted[index];
        setUploadProgress(
          `正在切片与向量化 (${index + 1}/${accepted.length})：${file.name}`
        );
        try {
          await uploadKnowledgeDocument(kbId, file);
        } catch (err) {
          failures.push(
            `${file.name}（${err instanceof Error ? err.message : "上传失败"}）`
          );
        }
      }
      await refresh();
      if (failures.length) setError(`部分文件未成功：${failures.join("；")}`);
    } finally {
      setUploading(false);
      setUploadProgress("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (!uploading) void uploadFiles(event.dataTransfer.files);
  };

  const deleteDocument = async (docId: string, filename: string) => {
    const ok = await confirm({
      title: "删除文档",
      message: `确定删除文档「${filename}」？向量切片将同步清理。`,
      confirmText: "删除",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteKnowledgeDocument(kbId, docId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500">
        <Link
          href="/admin/knowledge"
          className="transition-colors hover:text-primary"
        >
          知识库管理
        </Link>
        <ChevronRight size={13} />
        <span className="max-w-xs truncate text-primary">{kb?.name || "详情"}</span>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-2xl bg-surface-container/50" />
          <div className="h-44 animate-pulse rounded-2xl bg-surface-container/50" />
        </div>
      ) : !kb ? (
        <EmptyState
          icon={Database}
          title="知识库不存在或已删除"
          description={error || "请确认访问地址"}
          action={{
            label: "返回知识库管理",
            onClick: () => router.push("/admin/knowledge"),
          }}
        />
      ) : (
        <>
          <div className="flex flex-col justify-between gap-4 border-b border-white/[0.07] pb-6 md:flex-row md:items-start">
            <div>
              <h1 className="flex items-center gap-3 font-headline text-3xl font-bold text-white">
                <Database size={28} className="text-cyan-400" />
                {kb.name}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {kb.description || "暂无描述信息"}
              </p>
            </div>
            <span className="w-fit rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-mono text-cyan-300">
              {kb.documents.length} 篇文档
            </span>
          </div>

          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
              dragOver
                ? "border-cyan-400 bg-cyan-500/10"
                : "border-white/15 bg-surface-container/40 hover:border-cyan-500/40"
            } ${uploading ? "pointer-events-none opacity-70" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !uploading && fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.md,.markdown,.txt,application/pdf,text/plain,text/markdown"
              className="hidden"
              onChange={(event) => void uploadFiles(event.target.files)}
            />
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
              {uploading ? (
                <Loader2 size={27} className="animate-spin" />
              ) : (
                <UploadCloud size={27} />
              )}
            </div>
            <p className="font-semibold text-slate-200">
              {dragOver ? "松开即可上传" : "点击或拖拽文档到这里"}
            </p>
            <p className="mb-5 mt-1 text-xs font-mono text-slate-500">
              PDF / Markdown / TXT · 单文件不超过 10MB
            </p>
            <span className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary-container">
              <FileCode size={16} />
              {uploading ? "向量化解析中…" : "浏览本地文件"}
            </span>
            {uploadProgress && (
              <p className="mt-4 text-xs font-mono text-cyan-400">
                {uploadProgress}
              </p>
            )}
          </div>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2 font-headline text-lg font-bold text-white">
              <FileText size={19} className="text-cyan-400" />
              已索引文档
            </h2>
            {!kb.documents.length ? (
              <EmptyState
                icon={FileText}
                title="知识库暂无文档"
                description="上传资料后系统将自动建立向量索引。"
              />
            ) : (
              <div className="space-y-3">
                {kb.documents.map((doc) => {
                  const status = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
                  const StatusIcon = status.icon;
                  return (
                    <Card
                      key={doc.id}
                      className="flex items-center justify-between gap-4 p-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-slate-900 text-cyan-400">
                          <FileText size={19} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-200">
                            {doc.filename}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500">
                            <span>{(doc.byte_size / 1024).toFixed(1)} KB</span>
                            <span>{doc.chunk_count} 个切片</span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${status.color}`}
                            >
                              <StatusIcon
                                className={`h-3 w-3 ${
                                  doc.status === "processing" ? "animate-spin" : ""
                                }`}
                              />
                              {status.text}
                            </span>
                          </div>
                          {doc.error_message && (
                            <p className="mt-1 line-clamp-1 text-xs text-rose-400">
                              {doc.error_message}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        title="删除文档"
                        onClick={() => deleteDocument(doc.id, doc.filename)}
                        className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

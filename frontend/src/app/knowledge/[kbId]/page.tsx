"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { AdminGuard } from "@/components/AdminGuard";
import { useAuth } from "@/hooks/useAuth";
import { useDialog } from "@/components/DialogProvider";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import {
  UploadCloud,
  FileText,
  Trash2,
  AlertCircle,
  ChevronRight,
  Database,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  FileCode,
} from "lucide-react";
import {
  getKnowledgeBase,
  uploadKnowledgeDocument,
  deleteKnowledgeDocument,
  type KnowledgeBaseDetail,
} from "@/lib/api";

const STATUS_CONFIG: Record<string, { text: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { text: "等待向量化", color: "text-slate-400 bg-slate-500/10 border-slate-500/20", icon: Clock },
  processing: { text: "切片索引中", color: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: Loader2 },
  ready: { text: "就绪可检索", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
  failed: { text: "处理失败", color: "text-rose-400 bg-rose-500/10 border-rose-500/20", icon: XCircle },
};

const ACCEPT_EXT = new Set([".pdf", ".md", ".markdown", ".txt"]);
const MAX_BYTES = 10 * 1024 * 1024;

function fileExt(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function filterAllowedFiles(list: FileList | File[]) {
  const files = Array.from(list);
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const f of files) {
    if (!ACCEPT_EXT.has(fileExt(f.name))) {
      rejected.push(`${f.name}（格式不支持，仅支持 PDF/MD/TXT）`);
      continue;
    }
    if (f.size > MAX_BYTES) {
      rejected.push(`${f.name}（超过 10MB 限制）`);
      continue;
    }
    if (f.size === 0) {
      rejected.push(`${f.name}（空文件）`);
      continue;
    }
    accepted.push(f);
  }
  return { accepted, rejected };
}

export default function KnowledgeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const kbId = params.kbId as string;
  const { init } = useAuth();
  const { confirm } = useDialog();
  const fileRef = useRef<HTMLInputElement>(null);

  const [kb, setKb] = useState<KnowledgeBaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    init();
  }, [init]);

  const refresh = useCallback(async () => {
    try {
      setKb(await getKnowledgeBase(kbId));
      setError("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [kbId]);

  useEffect(() => {
    if (kbId) refresh();
  }, [kbId, refresh]);

  const handleUploadFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList || uploading) return;
    const { accepted, rejected } = filterAllowedFiles(fileList);
    if (accepted.length === 0) {
      setError(rejected.length ? `无法上传：${rejected.join("；")}` : "请选择文件");
      return;
    }

    setUploading(true);
    setError("");
    const failures: string[] = [...rejected];

    try {
      for (let i = 0; i < accepted.length; i++) {
        const file = accepted[i];
        setUploadProgress(`正在切片与向量化 (${i + 1}/${accepted.length})：${file.name}`);
        try {
          await uploadKnowledgeDocument(kbId, file);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "上传失败";
          failures.push(`${file.name}（${msg}）`);
        }
      }
      await refresh();
      if (failures.length) {
        setError(`部分文件未成功：${failures.join("；")}`);
      }
    } finally {
      setUploading(false);
      setUploadProgress("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (uploading) return;
    void handleUploadFiles(e.dataTransfer.files);
  };

  const handleDeleteDoc = async (docId: string, filename: string) => {
    const ok = await confirm({
      title: "删除文档",
      message: `确定删除文档「${filename}」？对应的高维向量索引切片将同步清理。`,
      confirmText: "删除",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteKnowledgeDocument(kbId, docId);
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
          <div className="max-w-4xl mx-auto space-y-8">
            {/* 面包屑导航 */}
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-mono">
              <Link href="/knowledge" className="hover:text-cyan-400 transition-colors">知识库</Link>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-cyan-400 font-medium truncate max-w-xs">{kb?.name || "..."}</span>
            </div>

            {loading ? (
              <div className="space-y-4">
                <div className="h-28 rounded-2xl bg-surface-container/50 animate-pulse" />
                <div className="h-44 rounded-2xl bg-surface-container/50 animate-pulse" />
              </div>
            ) : !kb ? (
              <EmptyState
                icon={Database}
                title="知识库不存在或已被删除"
                description={error || "请确认访问地址是否正确"}
                action={{
                  label: "返回知识库列表",
                  onClick: () => router.push("/knowledge"),
                }}
              />
            ) : (
              <>
                {/* 知识库主信息 */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-white/5 pb-6">
                  <div>
                    <h1 className="text-3xl font-extrabold font-headline tracking-tight text-slate-100 flex items-center gap-3">
                      <Database className="w-8 h-8 text-cyan-400" />
                      {kb.name}
                    </h1>
                    <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                      {kb.description || "暂无描述信息"}
                    </p>
                  </div>
                  <span className="self-start px-3 py-1 rounded-full text-xs font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                    共 {kb.documents.length} 篇文档
                  </span>
                </div>

                {error && (
                  <div className="flex items-center gap-3 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* 科技风拖拽上传区域 */}
                <div
                  className={`relative p-10 rounded-2xl border-2 border-dashed text-center transition-all duration-300 ${
                    dragOver
                      ? "border-cyan-400 bg-cyan-500/10 shadow-[0_0_30px_rgba(6,182,212,0.2)]"
                      : "border-white/15 bg-surface-container/40 hover:border-cyan-500/40 hover:bg-surface-container/60"
                  } ${uploading ? "opacity-75 pointer-events-none" : "cursor-pointer"}`}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    setDragOver(false);
                  }}
                  onDrop={onDrop}
                  onClick={() => !uploading && fileRef.current?.click()}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept=".pdf,.md,.markdown,.txt,application/pdf,text/plain,text/markdown"
                    className="hidden"
                    onChange={(e) => handleUploadFiles(e.target.files)}
                  />

                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    {uploading ? (
                      <Loader2 className="w-7 h-7 animate-spin" />
                    ) : (
                      <UploadCloud className="w-7 h-7" />
                    )}
                  </div>

                  <p className="text-base font-semibold text-slate-200 mb-1">
                    {dragOver ? "松开鼠标即可上传切片" : "点击选择文件，或将文档直接拖拽至此处"}
                  </p>
                  <p className="text-xs text-slate-400 mb-5 font-mono">
                    支持格式：PDF / Markdown (.md) / TXT · 单文件不超过 10MB
                  </p>

                  <button
                    type="button"
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-primary text-slate-950 font-bold text-sm shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:opacity-90 transition-all disabled:opacity-50 inline-flex items-center gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileRef.current?.click();
                    }}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        向量化解析中...
                      </>
                    ) : (
                      <>
                        <FileCode className="w-4 h-4" />
                        浏览本地文件
                      </>
                    )}
                  </button>

                  {uploadProgress && (
                    <div className="mt-4 inline-block bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-4 py-1.5 rounded-full text-xs font-mono animate-pulse">
                      {uploadProgress}
                    </div>
                  )}
                </div>

                {/* 文档管理列表 */}
                <div className="space-y-4">
                  <h2 className="text-lg font-bold font-headline text-slate-100 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-cyan-400" />
                    已索引文档列表
                  </h2>

                  {kb.documents.length === 0 ? (
                    <EmptyState
                      icon={FileText}
                      title="知识库暂无文档"
                      description="上传相关文档后，系统将自动进行语义切片并建立高维向量检索"
                    />
                  ) : (
                    <div className="space-y-3">
                      {kb.documents.map((doc) => {
                        const st = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
                        const StatusIcon = st.icon;
                        return (
                          <Card
                            key={doc.id}
                            className="p-4 flex items-center justify-between gap-4 hover:border-white/20 transition-colors"
                          >
                            <div className="min-w-0 flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center text-cyan-400 shrink-0">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-200 text-sm truncate">{doc.filename}</p>
                                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                                  <span>{(doc.byte_size / 1024).toFixed(1)} KB</span>
                                  <span>·</span>
                                  <span>{doc.chunk_count} 个语义切片</span>
                                  <span>·</span>
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${st.color}`}>
                                    <StatusIcon className={`w-3 h-3 ${doc.status === "processing" ? "animate-spin" : ""}`} />
                                    {st.text}
                                  </span>
                                </div>
                                {doc.error_message && (
                                  <p className="text-xs text-rose-400 mt-1 line-clamp-1">{doc.error_message}</p>
                                )}
                              </div>
                            </div>

                            <button
                              className="text-slate-500 hover:text-rose-400 p-2 rounded-lg hover:bg-rose-500/10 transition-colors shrink-0"
                              title="删除文档"
                              onClick={() => handleDeleteDoc(doc.id, doc.filename)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}


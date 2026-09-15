"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { AdminGuard } from "@/components/AdminGuard";
import { useAuth } from "@/hooks/useAuth";
import {
  getKnowledgeBase,
  uploadKnowledgeDocument,
  deleteKnowledgeDocument,
  type KnowledgeBaseDetail,
} from "@/lib/api";

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  pending: { text: "等待中", color: "text-slate-400" },
  processing: { text: "处理中", color: "text-yellow-400" },
  ready: { text: "就绪", color: "text-green-400" },
  failed: { text: "失败", color: "text-red-400" },
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
      rejected.push(`${f.name}（类型不支持）`);
      continue;
    }
    if (f.size > MAX_BYTES) {
      rejected.push(`${f.name}（超过 10MB）`);
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
        setUploadProgress(`正在上传 ${i + 1}/${accepted.length}：${file.name}`);
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
    if (!confirm(`删除文档「${filename}」？`)) return;
    try {
      await deleteKnowledgeDocument(kbId, docId);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <AdminGuard>
      <Header />
      <main className="min-h-screen pt-24 pb-20 px-6 md:px-10 bg-background">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-on-surface-variant text-xs mb-6 font-label tracking-widest uppercase">
            <Link href="/knowledge" className="hover:text-primary transition-colors">知识库</Link>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <span className="text-primary truncate">{kb?.name || "..."}</span>
          </div>

          {loading ? (
            <div className="h-40 rounded-2xl bg-surface-container-high animate-pulse" />
          ) : !kb ? (
            <div className="text-center py-20">
              <p className="text-red-400 mb-4">{error || "知识库不存在"}</p>
              <button
                className="px-5 py-2 rounded-lg bg-primary text-on-primary-container text-sm font-bold"
                onClick={() => router.push("/knowledge")}
              >
                返回列表
              </button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h1 className="text-3xl md:text-4xl font-bold font-headline mb-2">{kb.name}</h1>
                <p className="text-on-surface-variant">{kb.description || "暂无描述"}</p>
              </div>

              {error && (
                <p className="mb-6 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                  {error}
                </p>
              )}

              <div
                className={`mb-8 p-8 rounded-2xl border border-dashed text-center transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/15"
                    : "border-primary/30 bg-primary/5 hover:border-primary/50"
                } ${uploading ? "opacity-70 pointer-events-none" : "cursor-pointer"}`}
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
                <span className="material-symbols-outlined text-4xl text-primary mb-3 block">
                  {dragOver ? "file_download" : "upload_file"}
                </span>
                <p className="text-on-surface font-medium mb-2">
                  {dragOver ? "松开鼠标即可上传" : "拖拽文件到此处，或点击选择"}
                </p>
                <p className="text-sm text-on-surface-variant mb-4">
                  支持多文件 · PDF / Markdown / TXT · 单文件不超过 10MB
                </p>
                <button
                  type="button"
                  className="px-6 py-2.5 rounded-xl bg-primary text-on-primary-container font-bold text-sm disabled:opacity-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileRef.current?.click();
                  }}
                  disabled={uploading}
                >
                  {uploading ? "上传并向量化中..." : "选择文件上传"}
                </button>
                {uploadProgress && (
                  <p className="mt-4 text-xs text-primary">{uploadProgress}</p>
                )}
              </div>

              <h2 className="text-lg font-bold font-headline mb-4">文档列表</h2>
              {kb.documents.length === 0 ? (
                <p className="text-on-surface-variant text-sm py-8 text-center">还没有文档</p>
              ) : (
                <div className="space-y-3">
                  {kb.documents.map((doc) => {
                    const st = STATUS_LABEL[doc.status] || STATUS_LABEL.pending;
                    return (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-4 p-4 rounded-xl bg-surface-container-high border border-white/5"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{doc.filename}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {(doc.byte_size / 1024).toFixed(1)} KB · {doc.chunk_count} chunks ·{" "}
                            <span className={st.color}>{st.text}</span>
                          </p>
                          {doc.error_message && (
                            <p className="text-xs text-red-400 mt-1 line-clamp-2">{doc.error_message}</p>
                          )}
                        </div>
                        <button
                          className="text-sm text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-lg flex-shrink-0"
                          onClick={() => handleDeleteDoc(doc.id, doc.filename)}
                        >
                          删除
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </AdminGuard>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  Loader2,
  PenLine,
} from "lucide-react";
import {
  adminListExercises,
  listKnowledgeBases,
  type Exercise,
  type KnowledgeBase,
} from "@/lib/api";

export default function AdminOverviewPage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [kbData, exerciseData] = await Promise.all([
          listKnowledgeBases(),
          adminListExercises(),
        ]);
        if (cancelled) return;
        setKnowledgeBases(kbData);
        setExercises(exerciseData);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "管理数据加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const documentCount = knowledgeBases.reduce(
    (total, kb) => total + (kb.document_count || 0),
    0
  );
  const draftCount = exercises.filter((item) => item.status === "draft").length;
  const publishedCount = exercises.filter(
    (item) => item.status === "published"
  ).length;

  const stats = [
    {
      label: "知识库",
      value: knowledgeBases.length,
      icon: Database,
      hint: "平台内容源",
    },
    {
      label: "文档",
      value: documentCount,
      icon: FileText,
      hint: "已上传资料",
    },
    {
      label: "待审核",
      value: draftCount,
      icon: PenLine,
      hint: "练习草稿",
    },
    {
      label: "已发布",
      value: publishedCount,
      icon: CheckCircle2,
      hint: "学员可见题目",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section>
        <p className="mb-2 text-xs font-mono text-primary">ADMIN OVERVIEW</p>
        <h1 className="font-headline text-3xl font-bold tracking-tight text-white">
          管理概览
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          统一维护平台知识来源与已发布的练习内容。
        </p>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-52 items-center justify-center text-sm text-slate-500">
          <Loader2 size={18} className="mr-2 animate-spin" />
          加载管理数据…
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/[0.07] bg-surface-container-low/60 p-5"
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-xs text-slate-400">{stat.label}</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <stat.icon size={17} />
                  </div>
                </div>
                <p className="font-headline text-3xl font-bold text-white">
                  {stat.value}
                </p>
                <p className="mt-1 text-[11px] text-slate-600">{stat.hint}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <Link
              href="/admin/knowledge"
              className="group rounded-2xl border border-white/[0.07] bg-surface-container-low/50 p-6 transition-colors hover:border-primary/30"
            >
              <div className="mb-5 flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-300">
                  <BookOpen size={21} />
                </div>
                <ArrowRight
                  size={18}
                  className="text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-primary"
                />
              </div>
              <h2 className="font-headline text-lg font-bold text-white">
                知识库管理
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                创建知识库、上传技术文档，并维护课程与练习使用的 RAG 内容源。
              </p>
            </Link>

            <Link
              href="/admin/exercises"
              className="group rounded-2xl border border-white/[0.07] bg-surface-container-low/50 p-6 transition-colors hover:border-secondary/30"
            >
              <div className="mb-5 flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-secondary/25 bg-secondary/10 text-secondary">
                  <ClipboardList size={21} />
                </div>
                <ArrowRight
                  size={18}
                  className="text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-secondary"
                />
              </div>
              <h2 className="font-headline text-lg font-bold text-white">
                练习管理
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                基于知识库生成题目，审核草稿并控制发布、撤回和下架状态。
              </p>
            </Link>
          </section>
        </>
      )}
    </div>
  );
}

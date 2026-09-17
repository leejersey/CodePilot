"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Database,
  DollarSign,
  FileText,
  GraduationCap,
  Loader2,
  PenLine,
  Sparkles,
} from "lucide-react";
import {
  adminListExercises,
  adminListCourses,
  getAdminLlmUsage,
  listKnowledgeBases,
  type AdminLlmUsageSummary,
  type Exercise,
  type KnowledgeBase,
} from "@/lib/api";

export default function AdminOverviewPage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [courseCount, setCourseCount] = useState(0);
  const [llmUsage, setLlmUsage] = useState<AdminLlmUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [kbData, exerciseData, courseData, usageData] = await Promise.all([
          listKnowledgeBases(),
          adminListExercises(),
          adminListCourses({ pageSize: 100 }),
          getAdminLlmUsage(),
        ]);
        if (cancelled) return;
        setKnowledgeBases(kbData);
        setExercises(exerciseData);
        setCourseCount(courseData.total);
        setLlmUsage(usageData);
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
      label: "课程",
      value: courseCount,
      icon: GraduationCap,
      hint: "平台课程总数",
    },
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
    {
      label: "LLM Token",
      value: llmUsage?.total_tokens.toLocaleString() || "0",
      icon: Sparkles,
      hint: `${llmUsage?.request_count || 0} 次调用`,
    },
    {
      label: "预估费用",
      value: llmUsage?.pricing_configured
        ? `$${llmUsage.estimated_cost_usd.toFixed(4)}`
        : "待配置",
      icon: DollarSign,
      hint: "本月 USD",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section>
        <p className="mb-2 text-xs font-mono text-primary font-semibold">ADMIN OVERVIEW</p>
        <h1 className="font-headline text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          管理概览
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          统一维护平台知识来源与已发布的练习内容。
        </p>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-500 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-52 items-center justify-center text-sm text-slate-500">
          <Loader2 size={18} className="mr-2 animate-spin text-primary" />
          加载管理数据…
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/90 dark:bg-surface-container-low/60 p-5 shadow-xs dark:shadow-none transition-all"
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{stat.label}</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <stat.icon size={17} />
                  </div>
                </div>
                <p className="font-headline text-3xl font-bold text-slate-900 dark:text-white">
                  {stat.value}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">{stat.hint}</p>
              </div>
            ))}
          </section>

          {llmUsage && llmUsage.top_users.length > 0 && (
            <section className="rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/90 dark:bg-surface-container-low/50 p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-headline text-lg font-bold text-slate-900 dark:text-white">LLM 高用量用户</h2>
                  <p className="mt-1 text-xs text-slate-500">{llmUsage.month} · 平台与 BYOK 合计</p>
                </div>
                {!llmUsage.pricing_configured && (
                  <span className="text-[10px] text-amber-500">配置 LLM_PRICING_JSON 后显示费用</span>
                )}
              </div>
              <div className="space-y-2">
                {llmUsage.top_users.map((item, index) => (
                  <div key={item.user_id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-white/5 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {index + 1}. {item.nickname || item.email || "匿名用户"}
                      </p>
                      <p className="truncate text-[10px] text-slate-500">{item.email || item.user_id}</p>
                    </div>
                    <div className="shrink-0 text-right font-mono">
                      <p className="text-xs font-bold text-primary">{item.tokens.toLocaleString()} tokens</p>
                      {llmUsage.pricing_configured && (
                        <p className="text-[10px] text-slate-500">${item.estimated_cost_usd.toFixed(4)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-5 lg:grid-cols-2">
            <Link
              href="/admin/courses"
              className="group rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-xs transition-all hover:-translate-y-0.5 hover:border-violet-500/40 hover:shadow-md dark:border-white/[0.07] dark:bg-surface-container-low/50 dark:shadow-none"
            >
              <div className="mb-5 flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-300">
                  <GraduationCap size={21} />
                </div>
                <ArrowRight size={18} className="text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-violet-500" />
              </div>
              <h2 className="font-headline text-lg font-bold text-slate-900 dark:text-white">
                课程管理
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                创建、审核、发布和重建平台课程，维护当前内容版本。
              </p>
            </Link>

            <Link
              href="/admin/knowledge"
              className="group rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/90 dark:bg-surface-container-low/50 p-6 shadow-xs dark:shadow-none transition-all hover:border-cyan-500/40 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-none"
            >
              <div className="mb-5 flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">
                  <BookOpen size={21} />
                </div>
                <ArrowRight
                  size={18}
                  className="text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-primary"
                />
              </div>
              <h2 className="font-headline text-lg font-bold text-slate-900 dark:text-white">
                知识库管理
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                创建知识库、上传技术文档，并维护课程与练习使用的 RAG 内容源。
              </p>
            </Link>

            <Link
              href="/admin/exercises"
              className="group rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/90 dark:bg-surface-container-low/50 p-6 shadow-xs dark:shadow-none transition-all hover:border-secondary/40 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-none"
            >
              <div className="mb-5 flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-secondary/25 bg-secondary/10 text-secondary">
                  <ClipboardList size={21} />
                </div>
                <ArrowRight
                  size={18}
                  className="text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-secondary"
                />
              </div>
              <h2 className="font-headline text-lg font-bold text-slate-900 dark:text-white">
                练习管理
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                基于知识库生成题目，审核草稿并控制发布、撤回和下架状态。
              </p>
            </Link>
          </section>
        </>
      )}
    </div>
  );
}

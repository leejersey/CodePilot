"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, Search, SearchX } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/common/Card";
import { CardSkeleton } from "@/components/common/Skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { DifficultyBadge } from "@/components/common/Badge";
import { listPublishedCourses, type CourseCatalogItem, type CourseDifficulty } from "@/lib/api";
import { createRequestSequencer } from "@/lib/requestSequencing";

const DIFFICULTY_TABS = [
  { key: "", label: "全部难度" },
  { key: "beginner", label: "入门" },
  { key: "intermediate", label: "中级" },
  { key: "advanced", label: "高级" },
] as const;

const PAGE_SIZE = 12;

export default function CourseCatalogPage() {
  const [items, setItems] = useState<CourseCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTY_TABS)[number]["key"]>("");
  const [page, setPage] = useState(1);
  const requests = useRef(createRequestSequencer());

  const load = useCallback(async () => {
    const request = requests.current.begin();
    setLoading(true);
    setError("");
    try {
      const data = await listPublishedCourses(
        {
          search,
          difficulty: difficulty ? (difficulty as CourseDifficulty) : undefined,
          page,
          pageSize: PAGE_SIZE,
        },
        { signal: request.signal }
      );
      if (!requests.current.isCurrent(request.id)) return;
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      if (request.signal.aborted) return;
      setError(err instanceof Error ? err.message : "课程目录加载失败");
    } finally {
      if (requests.current.isCurrent(request.id)) setLoading(false);
    }
  }, [difficulty, page, search]);

  useEffect(() => {
    const sequencer = requests.current;
    void load();
    return () => sequencer.cancel();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function applySearch() {
    setPage(1);
    setSearch(searchInput);
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-background pt-24 pb-20 px-6">
        <div className="mx-auto max-w-6xl space-y-7">
          <div>
            <p className="mb-2 text-xs font-mono font-semibold text-primary">COURSE CATALOG</p>
            <h1 className="font-headline text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
              课程中心
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-400">
              浏览平台已发布的结构化课程，选择一门加入学习。
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="搜索课程"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && applySearch()}
                placeholder="搜索课程主题，例如 Python 异步编程"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary dark:border-white/10 dark:bg-surface-container-low"
              />
            </div>
            <button
              type="button"
              onClick={applySearch}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white"
            >
              搜索
            </button>
          </div>

          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/5 dark:bg-white/5">
            {DIFFICULTY_TABS.map((tab) => (
              <button
                key={tab.key || "all"}
                type="button"
                onClick={() => { setDifficulty(tab.key); setPage(1); }}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs ${difficulty === tab.key ? "bg-white font-bold text-primary shadow-xs dark:bg-primary/20" : "text-slate-500"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-rose-500/30 px-4 py-3 text-sm text-rose-500">
              {error}
            </div>
          )}

          {loading ? (
            <CardSkeleton count={6} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<SearchX size={28} />}
              title="没有匹配的课程"
              description="换个关键词或难度筛选，看看其他已发布的课程。"
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((course) => (
                <Link key={course.id} href={`/courses/${course.id}`} className="group block">
                  <Card className="flex h-full flex-col p-5 transition-all duration-300 hover:border-cyan-500/30">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-500 dark:text-cyan-400">
                        <BookOpen size={18} />
                      </span>
                      <DifficultyBadge difficulty={course.difficulty} />
                    </div>
                    <h2 className="font-headline text-lg font-bold text-slate-900 transition-colors group-hover:text-cyan-600 dark:text-white dark:group-hover:text-cyan-400">
                      {course.topic}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      更新于 {new Date(course.updated_at).toLocaleDateString("zh-CN")}
                    </p>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-cyan-600 dark:text-cyan-400">
                      查看课程 <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 text-xs">
              <button
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40 dark:border-white/10"
              >
                上一页
              </button>
              <span className="text-slate-500">{page} / {pageCount} · 共 {total} 门</span>
              <button
                disabled={page >= pageCount}
                onClick={() => setPage((value) => value + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40 dark:border-white/10"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

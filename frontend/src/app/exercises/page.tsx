"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { AuthGuard } from "@/components/AuthGuard";
import { Card } from "@/components/common/Card";
import { Badge } from "@/components/common/Badge";
import { CardSkeleton } from "@/components/common/Skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { listExercises, type Exercise } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowRight,
  BookMarked,
  ChevronDown,
  Clock,
  Code2,
  SearchX,
} from "lucide-react";

export default function ExercisesHub() {
  const { isAdmin } = useAuth();
  const [activeLang, setActiveLang] = useState("全部");
  const [activeDifficulty, setActiveDifficulty] = useState("所有难度");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  const languages = ["全部", "Python", "JavaScript", "Go", "Rust", "C++"];

  const diffMap: Record<string, string> = {
    "所有难度": "",
    "初级": "easy",
    "中级": "medium",
    "高级": "hard",
  };

  useEffect(() => {
    async function fetchExercises() {
      setLoading(true);
      try {
        const lang = activeLang === "全部" ? undefined : activeLang.toLowerCase();
        const diff =
          activeDifficulty === "所有难度" ? undefined : diffMap[activeDifficulty];
        const data = await listExercises({ language: lang, difficulty: diff });
        setExercises(data);
      } catch (err) {
        console.error("Failed to fetch exercises:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchExercises();
  }, [activeLang, activeDifficulty]);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-background font-body flex flex-col">
        <Header />

        <main className="flex-1 relative pt-16 pb-20">
          <section className="relative pt-10 pb-6 overflow-hidden">
            <div className="absolute inset-0 hero-grid pointer-events-none opacity-30" />
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="max-w-screen-2xl mx-auto px-6 relative z-10">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2 text-primary text-xs font-mono font-semibold tracking-wider uppercase mb-2">
                  <BookMarked size={14} />
                  <span>PUBLISHED CHALLENGES</span>
                </div>
                <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
                  编程演练场
                </h1>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
                  题目由管理员基于知识库出题并发布。选择语言与难度开始挑战。
                </p>
                {isAdmin && (
                  <Link
                    href="/admin/exercises"
                    className="inline-flex mt-3 text-xs font-bold text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
                  >
                    前往练习管理（出题 / 发布）
                  </Link>
                )}
              </div>
            </div>
          </section>

          <section className="sticky top-[61px] z-30 backdrop-blur-xl bg-white/80 dark:bg-[#060e20]/80 border-y border-slate-200/80 dark:border-white/[0.06] py-3 mb-8 transition-colors">
            <div className="max-w-screen-2xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar w-full sm:w-auto p-1 bg-slate-100/90 dark:bg-surface-container-low/60 rounded-xl border border-slate-200 dark:border-white/5">
                {languages.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setActiveLang(lang)}
                    className={`px-4 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                      activeLang === lang
                        ? "bg-white dark:bg-primary/20 text-sky-700 dark:text-primary font-bold border border-slate-300 dark:border-primary/30 shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/5"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>

              <div className="relative">
                <select
                  value={activeDifficulty}
                  onChange={(e) => setActiveDifficulty(e.target.value)}
                  className="appearance-none bg-white dark:bg-surface-container-high text-slate-800 dark:text-on-surface border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 pr-9 text-xs font-medium focus:ring-1 focus:ring-primary/40 cursor-pointer outline-none shadow-xs"
                >
                  <option>所有难度</option>
                  <option>初级</option>
                  <option>中级</option>
                  <option>高级</option>
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
                />
              </div>
            </div>
          </section>

          <section className="max-w-screen-2xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {loading ? (
                <div className="col-span-1 md:col-span-2 lg:col-span-3">
                  <CardSkeleton count={6} />
                </div>
              ) : (
                exercises.map((ex) => (
                  <Link href={`/exercise/${ex.id}`} key={ex.id}>
                    <Card
                      className="p-6 flex flex-col h-full group"
                      interactive
                      enableSpotlight
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge language={ex.language} size="sm" />
                          <Badge difficulty={ex.difficulty} size="sm" />
                          {ex.source_kbs && ex.source_kbs.length > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-mono text-violet-700 dark:text-violet-300 bg-violet-100/80 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/25 px-2 py-0.5 rounded-full max-w-[140px] truncate"
                              title={ex.source_kbs.map((k) => k.name).join("、")}
                            >
                              <BookMarked size={10} />
                              {ex.source_kbs[0].name}
                            </span>
                          )}
                        </div>
                        <span className="text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">
                          <Code2 size={16} />
                        </span>
                      </div>

                      <h3 className="text-xl font-headline font-bold text-slate-900 dark:text-white mb-2.5 group-hover:text-primary transition-colors">
                        {ex.title}
                      </h3>

                      <p className="text-slate-600 dark:text-on-surface-variant/80 text-xs mb-6 line-clamp-3 leading-relaxed flex-1">
                        {ex.description}
                      </p>

                      <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-200/80 dark:border-white/[0.06]">
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded border border-slate-200 dark:border-white/5">
                            {ex.tags && ex.tags.length > 0 ? ex.tags[0] : "综合挑战"}
                          </span>
                          <span className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Clock size={11} /> 15m
                          </span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:bg-primary group-hover:text-white dark:group-hover:text-surface group-hover:border-primary transition-all shadow-xs">
                          <ArrowRight size={14} />
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))
              )}

              {!loading && exercises.length === 0 && (
                <div className="col-span-1 md:col-span-2 lg:col-span-3 py-8">
                  <EmptyState
                    icon={<SearchX size={28} className="text-slate-500" />}
                    title="暂无已发布的编程挑战"
                    description={
                      isAdmin
                        ? "请到「练习管理」基于知识库出题并发布。"
                        : "管理员发布题目后会出现在这里。"
                    }
                    actionText={isAdmin ? "去练习管理" : undefined}
                    onAction={
                      isAdmin
                        ? () => {
                            window.location.href = "/admin/exercises";
                          }
                        : undefined
                    }
                  />
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </AuthGuard>
  );
}

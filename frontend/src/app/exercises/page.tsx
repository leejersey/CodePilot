"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { AuthGuard } from "@/components/AuthGuard";
import { listExercises, generateExercise, Exercise } from "@/lib/api";

const getLangTheme = (lang: string) => {
  const l = lang.toLowerCase();
  if (l === "python") return { bg: "bg-primary/10", text: "text-primary", icon: "trending_up" };
  if (l === "go") return { bg: "bg-blue-500/10", text: "text-blue-400", icon: "memory" };
  if (l === "javascript" || l === "js" || l === "typescript" || l === "ts") return { bg: "bg-yellow-500/10", text: "text-yellow-400", icon: "web" };
  if (l === "rust") return { bg: "bg-red-500/10", text: "text-red-400", icon: "security" };
  if (l === "c++" || l === "cpp" || l === "c") return { bg: "bg-cyan-500/10", text: "text-cyan-400", icon: "settings_ethernet" };
  return { bg: "bg-surface-container-high", text: "text-on-surface", icon: "code" };
};

const getDiffTheme = (diff: string) => {
  const d = diff.toLowerCase();
  if (d === "easy" || d === "初级") return { bg: "bg-green-500/10", text: "text-green-400", label: "初级" };
  if (d === "hard" || d === "高级") return { bg: "bg-secondary/10", text: "text-secondary", label: "高级" };
  return { bg: "bg-orange-500/10", text: "text-orange-400", label: "中级" };
};

export default function ExercisesHub() {
  const router = useRouter();
  const [activeLang, setActiveLang] = useState("全部");
  const [activeDifficulty, setActiveDifficulty] = useState("所有难度");
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  const languages = ["全部", "Python", "JavaScript", "Go", "Rust", "C++"];

  const diffMap: Record<string, string> = {
    "所有难度": "",
    "初级": "easy",
    "中级": "medium",
    "高级": "hard"
  };

  useEffect(() => {
    async function fetchExercises() {
      setLoading(true);
      try {
        const lang = activeLang === "全部" ? undefined : activeLang.toLowerCase();
        const diff = activeDifficulty === "所有难度" ? undefined : diffMap[activeDifficulty];
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

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const lang = activeLang === "全部" ? "python" : activeLang.toLowerCase();
      const diff = activeDifficulty === "所有难度" ? "medium" : diffMap[activeDifficulty];
      
      const newEx = await generateExercise({
        language: lang,
        difficulty: diff,
        topic: "核心编程挑战" // 可选，让 LLM 根据语言和难度自动生成符合场景的题目
      });
      router.push(`/exercise/${newEx.id}`);
    } catch (err) {
      console.error("生成失败:", err);
      setIsGenerating(false);
      alert("生成练习题失败，请检查网络或后端配置");
    }
  };

  return (
    <AuthGuard>
    <div className="min-h-screen bg-background text-on-background font-body flex flex-col">
      <Header />
      
      <main className="flex-1 relative pt-20">
        {/* Hero Section */}
        <section className="relative pt-20 pb-16 overflow-hidden">
          <div className="absolute inset-0 hero-grid pointer-events-none opacity-40"></div>
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-secondary/10 rounded-full blur-[100px] pointer-events-none"></div>
          
          <div className="max-w-screen-2xl mx-auto px-6 relative z-10">
            <div className="max-w-3xl">
              <h1 className="text-6xl md:text-8xl font-headline font-bold text-on-surface tracking-tighter mb-6 leading-[0.9]">
                编程 <span className="text-primary">演练场</span>
              </h1>
              <p className="text-xl text-on-surface-variant font-body max-w-xl leading-relaxed">
                选择你的技术栈，通过 AI 动态生成的真实场景挑战提升编码能力。从系统设计到竞品级算法一网打尽。
              </p>
            </div>
          </div>
        </section>

        {/* Control Bar */}
        <section className="max-w-screen-2xl mx-auto px-6 mb-12">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6 p-2 bg-surface-container-low/50 backdrop-blur-md rounded-2xl border border-white/5">
            {/* Language Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar w-full lg:w-auto px-2">
              {languages.map(lang => (
                <button
                  key={lang}
                  onClick={() => setActiveLang(lang)}
                  className={`px-5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    activeLang === lang 
                      ? "text-primary border-b-2 border-primary" 
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 w-full lg:w-auto px-2">
              {/* Difficulty Dropdown */}
              <div className="relative flex-1 lg:flex-none">
                <select 
                  value={activeDifficulty}
                  onChange={(e) => setActiveDifficulty(e.target.value)}
                  className="appearance-none w-full bg-surface-container-high text-on-surface border-none rounded-xl px-4 py-2.5 pr-10 text-sm font-medium focus:ring-1 focus:ring-primary/40 cursor-pointer outline-none hover:bg-surface-bright transition-colors"
                >
                  <option>所有难度</option>
                  <option>初级</option>
                  <option>中级</option>
                  <option>高级</option>
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant text-lg">expand_more</span>
              </div>
              
              {/* Generate CTA */}
              <button 
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex items-center gap-2 bg-gradient-to-r from-primary to-primary-container text-on-primary px-6 py-2.5 rounded-xl font-bold text-sm shadow-[0_0_20px_rgba(83,221,252,0.3)] hover:shadow-[0_0_30px_rgba(83,221,252,0.5)] transition-all active:scale-95 whitespace-nowrap disabled:opacity-70 disabled:active:scale-100"
              >
                {isGenerating ? (
                  <>
                    <span className="material-symbols-outlined text-[20px] animate-spin" style={{ fontVariationSettings: "'FILL' 1" }}>progress_activity</span>
                    AI 生成中...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">add_circle</span>
                    生成新练习
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Exercise Grid */}
        <section className="max-w-screen-2xl mx-auto px-6 pb-24">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            
            {/* Generating Skeleton */}
            {isGenerating && (
              <div className="bg-surface-container-high/30 p-6 rounded-[2rem] relative overflow-hidden group border border-white/5">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5"></div>
                <div className="relative z-10 animate-pulse flex flex-col h-full">
                  <div className="flex gap-2 mb-6">
                    <div className="h-6 w-16 bg-surface-container-highest rounded-full"></div>
                    <div className="h-6 w-20 bg-surface-container-highest rounded-full"></div>
                  </div>
                  <div className="h-8 w-3/4 bg-surface-container-highest rounded-lg mb-4"></div>
                  <div className="h-4 w-full bg-surface-container-highest rounded mb-2"></div>
                  <div className="h-4 w-2/3 bg-surface-container-highest rounded mb-8"></div>
                  <div className="mt-auto flex items-center justify-center py-8">
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative">
                        <span className="material-symbols-outlined text-4xl text-primary animate-spin" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
                        <div className="absolute inset-0 blur-xl bg-primary/40 animate-pulse"></div>
                      </div>
                      <span className="text-sm font-headline font-medium text-primary tracking-widest uppercase">题目生成中...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {loading ? (
              // Loading placeholders
              <>
                <div className="bg-surface-container-high/30 p-6 rounded-[2rem] border border-white/5 animate-pulse min-h-[300px]"></div>
                <div className="bg-surface-container-high/30 p-6 rounded-[2rem] border border-white/5 animate-pulse min-h-[300px]"></div>
                <div className="bg-surface-container-high/30 p-6 rounded-[2rem] border border-white/5 animate-pulse min-h-[300px]"></div>
              </>
            ) : (
              exercises.map((ex) => {
                const langTheme = getLangTheme(ex.language);
                const diffTheme = getDiffTheme(ex.difficulty);
                
                return (
                  <Link href={`/exercise/${ex.id}`} key={ex.id}>
                    <div className="glass-card group flex flex-col p-6 rounded-[2rem] h-full hover:translate-y-[-8px] transition-all duration-500 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4),0_0_20px_rgba(83,221,252,0.1)] border border-white/5 hover:border-white/10 cursor-pointer">
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex gap-2">
                          <span className={`px-3 py-1 ${langTheme.bg} ${langTheme.text} text-[10px] font-bold uppercase tracking-widest rounded-full`}>
                            {ex.language}
                          </span>
                          <span className={`px-3 py-1 ${diffTheme.bg} ${diffTheme.text} text-[10px] font-bold uppercase tracking-widest rounded-full`}>
                            {diffTheme.label}
                          </span>
                        </div>
                        <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">
                          {langTheme.icon}
                        </span>
                      </div>
                      
                      <h3 className="text-2xl font-headline font-bold text-on-surface mb-3 group-hover:text-primary transition-colors">
                        {ex.title}
                      </h3>
                      
                      <p className="text-on-surface-variant text-sm mb-8 line-clamp-3 leading-relaxed flex-1">
                        {ex.description}
                      </p>
                      
                      <div className="mt-auto flex items-center justify-between pt-6 border-t border-outline-variant/20">
                        <div className="flex gap-4">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-tighter text-on-surface-variant/60 font-medium">标签</span>
                            <span className="text-sm font-mono text-on-surface">{ex.tags && ex.tags.length > 0 ? ex.tags[0] : "综合算法"}</span>
                          </div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-surface-bright flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary transition-all duration-300 shadow-sm">
                          <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}

            {!loading && exercises.length === 0 && !isGenerating && (
              <div className="col-span-1 md:col-span-2 lg:col-span-3 py-20 flex flex-col items-center justify-center text-on-surface-variant bg-surface-container-low/30 rounded-[2rem] border border-white/5 border-dashed">
                <span className="material-symbols-outlined text-6xl mb-4 opacity-50">search_off</span>
                <p className="text-lg mb-4">当前分类下暂无可用的编程挑战</p>
                <button
                  onClick={handleGenerate}
                  className="px-6 py-2.5 bg-surface-container-high hover:bg-surface-bright text-on-surface rounded-xl transition-colors font-medium border border-white/10"
                >
                  让 AI 生成一题
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Floating Action Button */}
        <button className="fixed bottom-8 right-8 w-16 h-16 rounded-full bg-primary text-on-primary shadow-2xl shadow-primary/40 flex items-center justify-center group hover:scale-110 active:scale-95 transition-all z-40">
          <span className="material-symbols-outlined text-3xl group-hover:rotate-12 transition-transform">bolt</span>
        </button>
      </main>
    </div>
    </AuthGuard>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/common/Card";
import { generatePath } from "@/lib/api";
import {
  Cpu,
  GitBranch,
  Loader2,
  Rocket,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async (inputTopic?: string) => {
    const finalTopic = inputTopic || topic;
    if (!finalTopic.trim()) {
      setError("请输入一个学习主题");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const data = await generatePath({
        topic: finalTopic.trim(),
      });
      router.push(`/learn/${data.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "生成失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="relative min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-mesh pt-20 pb-16">
        {/* Ambient Glow Elements */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-secondary/15 blur-[140px] rounded-full pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary/15 blur-[140px] rounded-full pointer-events-none" />

        {/* Hero Content Section */}
        <div className="w-full max-w-4xl z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary-container/20 text-secondary text-xs font-bold tracking-[0.1em] uppercase mb-8 border border-secondary/20 shadow-[0_0_20px_rgba(172,138,255,0.15)]">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            Next-Gen AI Learning
          </div>
          <h1 className="font-headline text-5xl md:text-7xl font-bold text-on-surface mb-6 tracking-tight leading-[1.15]">
            开启你的{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_auto] animate-text-shimmer">
              编程进化
            </span>{" "}
            之旅
          </h1>
          <p className="text-on-surface-variant text-lg md:text-xl max-w-2xl mx-auto mb-12 font-light leading-relaxed">
            由 AI 驱动的个性化编程路径。输入你感兴趣的技术，剩下的交给我们。
          </p>

          {/* Massive Tech Search Bar */}
          <div className="relative group max-w-3xl mx-auto mb-8">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 via-secondary/20 to-primary/30 rounded-2xl blur-xl opacity-40 group-hover:opacity-100 transition duration-500" />
            <div className="relative glass-card border border-slate-200/90 dark:border-white/10 group-hover:border-primary/50 rounded-2xl p-2.5 flex items-center shadow-lg dark:shadow-2xl transition-all">
              <div className="flex-shrink-0 ml-4 mr-3 text-primary/80">
                <Terminal size={26} className="text-primary" />
              </div>
              <input
                className="w-full bg-transparent border-none text-on-surface placeholder:text-slate-400 dark:placeholder:text-slate-500 text-base md:text-lg py-3.5 focus:ring-0 font-body outline-none"
                placeholder="你想学习什么编程主题？（例如：Python 异步编程、React 状态管理...）"
                type="text"
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && !loading && handleGenerate()}
                disabled={loading}
              />
              <button
                className="ml-2 bg-primary text-white dark:text-on-primary-container px-7 py-3.5 rounded-xl font-bold font-headline text-sm hover:bg-primary-dim transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap shadow-[0_4px_20px_rgba(2,132,199,0.25)] dark:shadow-[0_4px_20px_rgba(83,221,252,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleGenerate()}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    AI 构建中...
                  </>
                ) : (
                  <>
                    开始构建
                    <Zap size={16} />
                  </>
                )}
              </button>
            </div>
            {error && (
              <p className="absolute -bottom-7 left-3 text-rose-500 dark:text-rose-400 text-xs font-medium">{error}</p>
            )}
          </div>

          {/* Hot Topics Grid */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">
              热门探索主题
            </h3>
            <div className="flex flex-wrap justify-center gap-2.5">
              {[
                { name: "Python", color: "bg-blue-500", hover: "hover:border-primary/40 hover:text-primary" },
                { name: "JavaScript", color: "bg-amber-500", hover: "hover:border-amber-500/40 hover:text-amber-600 dark:hover:text-amber-400" },
                { name: "Go", color: "bg-cyan-500", hover: "hover:border-cyan-500/40 hover:text-cyan-600 dark:hover:text-cyan-400" },
                { name: "Rust", color: "bg-orange-500", hover: "hover:border-orange-500/40 hover:text-orange-600 dark:hover:text-orange-400" },
              ].map((t) => (
                <button
                  key={t.name}
                  className={`px-5 py-2 rounded-full bg-white/90 dark:bg-surface-container-low/80 border border-slate-200/80 dark:border-white/5 text-on-surface-variant text-xs font-medium ${t.hover} transition-all duration-300 flex items-center gap-2 shadow-xs dark:shadow-none hover:shadow-[0_0_15px_rgba(2,132,199,0.1)] active:scale-95`}
                  onClick={() => {
                    setTopic(t.name);
                    handleGenerate(t.name);
                  }}
                  disabled={loading}
                >
                  <span className={`w-2 h-2 rounded-full ${t.color}`} /> {t.name}
                </button>
              ))}
              <button
                className="px-5 py-2 rounded-full bg-surface-container-high/80 border border-secondary/30 text-secondary hover:bg-secondary/15 text-xs font-medium transition-all duration-300 flex items-center gap-2 shadow-[0_0_15px_rgba(172,138,255,0.15)] active:scale-95"
                onClick={() => {
                  setTopic("AI 原生开发");
                  handleGenerate("AI 原生开发");
                }}
                disabled={loading}
              >
                <Sparkles size={13} className="text-secondary" />
                AI 原生开发
              </button>
            </div>
          </div>
        </div>

        {/* Bento Interactive Features Section (Bottom) */}
        <div className="mt-20 w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-5 z-10">
          <Card className="p-6 flex items-start gap-4" interactive>
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <Cpu size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-on-surface mb-1 font-headline">自适应引擎</h4>
              <p className="text-xs text-on-surface-variant/80 leading-relaxed">
                根据你的编程基础实时调整难度，精准填补知识盲区。
              </p>
            </div>
          </Card>

          <Card className="p-6 flex items-start gap-4" interactive>
            <div className="w-11 h-11 rounded-xl bg-secondary/10 border border-secondary/20 text-secondary flex items-center justify-center shrink-0">
              <GitBranch size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-on-surface mb-1 font-headline">知识图谱</h4>
              <p className="text-xs text-on-surface-variant/80 leading-relaxed">
                体系化呈现章节大纲与进度，每个技术栈都有清晰里程碑。
              </p>
            </div>
          </Card>

          <Card className="p-6 flex items-start gap-4" interactive>
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
              <Rocket size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-on-surface mb-1 font-headline">实战驱动</h4>
              <p className="text-xs text-on-surface-variant/80 leading-relaxed">
                浏览器内置 Monaco + Python 沙箱，结合 AI 实时出题判题。
              </p>
            </div>
          </Card>
        </div>
      </main>

      {/* Background Animation Layer */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[10%] left-[15%] w-64 h-64 bg-secondary/5 rounded-full blur-[90px]" />
        <div className="absolute top-[60%] right-[10%] w-96 h-96 bg-primary/5 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>
    </>
  );
}

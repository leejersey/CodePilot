"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { generatePath } from "@/lib/api";

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
      const data = await generatePath({ topic: finalTopic.trim() });
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
      <main className="relative min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-mesh pt-16">
        {/* Ambient Glow Elements */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-secondary/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary/10 blur-[120px] rounded-full"></div>

        {/* Hero Content Section */}
        <div className="w-full max-w-4xl z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary-container/20 text-secondary text-xs font-bold tracking-[0.1em] uppercase mb-8 border border-secondary/10">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
            Next-Gen AI Learning
          </div>
          <h1 className="font-headline text-5xl md:text-7xl font-bold text-on-surface mb-6 tracking-tight leading-[1.1]">
            开启你的 <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_auto] animate-text-shimmer">编程进化</span> 之旅
          </h1>
          <p className="text-on-surface-variant text-lg md:text-xl max-w-2xl mx-auto mb-12 font-light leading-relaxed">
            由 AI 驱动的个性化编程路径。输入你感兴趣的技术，剩下的交给我们。
          </p>

          {/* Massive Tech Search Bar */}
          <div className="relative group max-w-3xl mx-auto mb-16">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-secondary/30 rounded-xl blur-xl opacity-50 group-hover:opacity-100 transition duration-500"></div>
            <div className="relative glass-card border border-white/10 rounded-xl p-2 flex items-center shadow-2xl">
              <div className="flex-shrink-0 ml-4 mr-2">
                <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>terminal</span>
              </div>
              <input 
                className="w-full bg-transparent border-none text-on-surface placeholder:text-slate-500 text-lg md:text-xl py-4 focus:ring-0 font-body outline-none" 
                placeholder="你想学习什么编程主题？（例如：Python 异步编程、React 状态管理...）" 
                type="text"
                value={topic}
                onChange={(e) => { setTopic(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && !loading && handleGenerate()}
                disabled={loading}
              />
              <button 
                className="ml-2 bg-primary text-on-primary-container px-8 py-4 rounded-lg font-bold hover:bg-primary-dim transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleGenerate()}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="animate-spin material-symbols-outlined text-lg">progress_activity</span>
                    AI 生成中...
                  </>
                ) : (
                  <>
                    开始构建
                    <span className="material-symbols-outlined text-lg">bolt</span>
                  </>
                )}
              </button>
            </div>
            {error && (
              <p className="absolute -bottom-8 left-0 text-red-400 text-sm">{error}</p>
            )}
          </div>

          {/* Hot Topics Grid */}
          <div className="space-y-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">热门探索主题</h3>
            <div className="flex flex-wrap justify-center gap-3">
              {[
                { name: "Python", color: "bg-blue-400", hover: "hover:border-primary/50 hover:text-primary" },
                { name: "JavaScript", color: "bg-yellow-400", hover: "hover:border-yellow-400/50 hover:text-yellow-400" },
                { name: "Go", color: "bg-cyan-400", hover: "hover:border-cyan-400/50 hover:text-cyan-400" },
                { name: "Rust", color: "bg-orange-500", hover: "hover:border-orange-500/50 hover:text-orange-500" },
              ].map((t) => (
                <button
                  key={t.name}
                  className={`px-6 py-2.5 rounded-full bg-surface-container-low border border-white/5 text-on-surface-variant ${t.hover} transition-all duration-300 flex items-center gap-2`}
                  onClick={() => { setTopic(t.name); handleGenerate(t.name); }}
                  disabled={loading}
                >
                  <span className={`w-2 h-2 rounded-full ${t.color}`}></span> {t.name}
                </button>
              ))}
              <button 
                className="px-6 py-2.5 rounded-full bg-surface-container-high border border-secondary/30 text-secondary hover:bg-secondary/10 transition-all duration-300 flex items-center gap-2"
                onClick={() => { setTopic("AI 原生开发"); handleGenerate("AI 原生开发"); }}
                disabled={loading}
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                AI 原生开发
              </button>
            </div>
          </div>
        </div>

        {/* Bento Decorative Section (Bottom) */}
        <div className="mt-24 w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-6 opacity-60">
          <div className="glass-card p-6 rounded-xl border border-white/5 flex items-start gap-4">
            <div className="p-3 rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined">psychology</span>
            </div>
            <div>
              <h4 className="font-bold text-sm text-on-surface mb-1">自适应引擎</h4>
              <p className="text-xs text-on-surface-variant">根据你的基础实时调整难度。</p>
            </div>
          </div>
          <div className="glass-card p-6 rounded-xl border border-white/5 flex items-start gap-4">
            <div className="p-3 rounded-lg bg-secondary/10 text-secondary">
              <span className="material-symbols-outlined">schema</span>
            </div>
            <div>
              <h4 className="font-bold text-sm text-on-surface mb-1">知识图谱</h4>
              <p className="text-xs text-on-surface-variant">可视化你的每一个学习里程碑。</p>
            </div>
          </div>
          <div className="glass-card p-6 rounded-xl border border-white/5 flex items-start gap-4">
            <div className="p-3 rounded-lg bg-tertiary/10 text-tertiary">
              <span className="material-symbols-outlined">rocket_launch</span>
            </div>
            <div>
              <h4 className="font-bold text-sm text-on-surface mb-1">实战驱动</h4>
              <p className="text-xs text-on-surface-variant">通过构建真实世界的项目来学习。</p>
            </div>
          </div>
        </div>
      </main>

      {/* Background Animation Layer */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[10%] left-[15%] w-64 h-64 bg-secondary/5 rounded-full blur-[80px]"></div>
        <div className="absolute top-[60%] right-[10%] w-96 h-96 bg-primary/5 rounded-full blur-[100px]"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      </div>
    </>
  );
}


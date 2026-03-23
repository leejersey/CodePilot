"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/layout/Header";
import ReactMarkdown from 'react-markdown';
import { getExercise, submitExercise, Exercise } from "@/lib/api";


// Mock default data in case API fails
const MOCK_EXERCISE = {
  title: "实现异步数据采集器",
  difficulty: "intermediate",
  description: "在这个练习中，你将探索 Python `asyncio` 的核心机制。你需要处理网络请求中的不确定性因素。\n\n### 任务目标\n1. 实现一个异步函数 `fetch_data(api_id: int)`。\n2. 使用 `asyncio.sleep` 模拟 0.5 到 1.5 秒之间的随机延迟。\n3. 处理超时异常：如果延迟超过 1.2 秒，应重试最多 3 次。\n4. 返回格式化后的字符串 `\"Data from {api_id}\"`。\n\n### 补充说明\n确保你的实现是线程安全的，并且能够通过我们的并发测试脚本（100个并发任务）。",
  starter_code: "import asyncio\nimport random\n\nasync def fetch_data(api_id: int):\n    # 实现你的异步逻辑\n    pass\n",
};

export default function ExercisePage() {
  const params = useParams();
  const router = useRouter();
  const { token, init } = useAuth();
  const exerciseId = params.exerciseId as string;

  const [code, setCode] = useState(MOCK_EXERCISE.starter_code);
  const [exercise, setExercise] = useState<Exercise | typeof MOCK_EXERCISE>(MOCK_EXERCISE);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [submissionResult, setSubmissionResult] = useState<"pass" | "fail" | "error" | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    async function fetchExerciseData() {
      if (exerciseId === "mock-id") {
        setExercise(MOCK_EXERCISE);
        setLoading(false);
        return;
      }
      
      try {
        const data = await getExercise(exerciseId);
        setExercise(data);
        setCode(data.starter_code || "");
      } catch (e) {
        console.error("Failed to load exercise:", e);
        setExercise(MOCK_EXERCISE); // fallback to mock on error
      }
      setLoading(false);
    }
    fetchExerciseData();
  }, [exerciseId, token]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setAiFeedback(null);
    setSubmissionResult(null);

    try {
      if (exerciseId === "mock-id") {
        // Mock successful submission delay
        await new Promise(r => setTimeout(r, 1500));
        setSubmissionResult("fail");
        setAiFeedback("检测到你已经处理了重试逻辑。建议在异常捕获中添加日志记录，以符合生产环境的最佳实践。");
        setSubmitting(false);
        return;
      }

      const res = await submitExercise(exerciseId, code);
      setSubmissionResult(res.result);
      if (res.ai_feedback) {
        setAiFeedback(res.ai_feedback);
      }
    } catch (e) {
      console.error("Submission failed:", e);
      setSubmissionResult("error");
      setAiFeedback("提交失败，请检查网络连接或后端错误。");
    }
    setSubmitting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newCode = code.substring(0, start) + "    " + code.substring(end);
      setCode(newCode);
      // Wait for React to update state, then set cursor
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 4;
        }
      }, 0);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
             <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
           </div>;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-on-background font-body selection:bg-primary/30">
      <Header />
      
      {/* Main Workspace */}
      <main className="flex-1 mt-16 flex overflow-hidden">
        
        {/* Left Section: Instructions */}
        <section className="w-[450px] flex-shrink-0 bg-surface-container-low flex flex-col border-r border-white/5 overflow-hidden">
          <div className="p-6 overflow-y-auto overflow-x-hidden hide-scrollbar flex-1 text-on-surface-variant leading-relaxed">
            <div className="flex items-center gap-2 mb-8">
              <span className="text-xs font-bold tracking-[0.2em] uppercase text-primary bg-primary/10 px-2 py-1 rounded">LEVEL {exercise?.difficulty === 'advanced' ? '3' : exercise?.difficulty === 'intermediate' ? '2' : '1'}</span>
              <span className="text-xs text-on-surface-variant uppercase">{exercise?.difficulty || "unknown"}</span>
            </div>
            
            <h1 className="text-3xl font-headline font-bold text-on-surface mb-6 leading-tight">
              {exercise?.title}
            </h1>
            
            <div className="space-y-2 mt-4 prose prose-invert prose-sm max-w-none prose-headings:font-headline prose-headings:text-primary prose-h3:text-lg prose-h3:flex prose-h3:items-center prose-h3:gap-2 prose-p:text-sm prose-p:leading-relaxed prose-code:text-secondary-dim prose-code:bg-surface-container-highest prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
              <ReactMarkdown
                components={{
                  h3: ({node, ...props}) => (
                    <h3 {...props}>
                      <span className="material-symbols-outlined text-sm">task_alt</span> 
                      {props.children}
                    </h3>
                  )
                }}
              >
                {exercise?.description || ""}
              </ReactMarkdown>
            </div>
            
            <div className="mt-8 bg-surface-container-lowest p-4 rounded-lg font-code text-xs text-secondary-dim border-l-2 border-secondary overflow-x-auto">
              # 期望的输出样例<br/>
              &gt;&gt; await fetch_data(101)<br/>
              'Data from 101'
            </div>
          </div>
          
          {/* SideNav Footer Info */}
          <div className="p-6 bg-surface-container-lowest border-t border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">当前任务</span>
              <span className="text-xs text-cyan-400 font-medium">进行中</span>
            </div>
            <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
              <div className="bg-cyan-400 h-full w-[30%]"></div>
            </div>
          </div>
        </section>

        {/* Right Section: Editor Area */}
        <section className="flex-1 bg-surface-container-lowest relative flex flex-col overflow-hidden">
          {/* Editor Tabs */}
          <div className="flex bg-surface-container-low px-0 border-b border-white/5 h-10 items-center">
            <div className="flex items-center gap-2 px-6 py-2 bg-surface-container-highest border-t-2 border-cyan-400 text-xs text-on-surface font-code h-full">
              <span className="material-symbols-outlined text-[14px] text-cyan-400">terminal</span>
              main.py
            </div>
          </div>
          
          {/* Editor Area */}
          <div className="flex-1 relative font-code text-[14px] leading-relaxed flex flex-col">
            <div className="absolute top-0 left-0 bottom-0 w-12 bg-surface-container-lowest border-r border-white/5 text-right text-outline-variant pr-3 py-6 select-none opacity-50 z-10 flex flex-col gap-[2px]">
              {code.split('\n').map((_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            
            <textarea
              ref={textareaRef}
              className="flex-1 w-full h-full bg-transparent text-primary-dim p-6 pl-16 resize-none outline-none font-code leading-relaxed whitespace-pre z-20"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck="false"
              placeholder="# 在这里编写代码..."
            />
          </div>

          {/* AI Feedback Floating Window */}
          {aiFeedback && (
            <div className="absolute right-8 top-16 w-80 glass-panel border border-secondary/30 rounded-xl p-4 shadow-2xl z-30 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-secondary/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-secondary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-on-surface">CodePilot AI</div>
                    <div className="text-[10px] text-secondary">
                      {submissionResult === 'fail' ? '给出了一些改进建议' : submissionResult === 'pass' ? '任务完美完成！' : '运行结果反馈'}
                    </div>
                  </div>
                </div>
                <button onClick={() => setAiFeedback(null)} className="text-outline hover:text-on-surface transition-colors">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
              <p className="text-xs text-on-surface-variant leading-normal mb-3">
                {aiFeedback}
              </p>
              {submissionResult === 'fail' && (
                <button className="w-full py-2 bg-secondary/10 hover:bg-secondary/20 border border-secondary/30 rounded-lg text-[11px] text-secondary font-medium transition-colors">
                  应用优化建议
                </button>
              )}
            </div>
          )}

          {/* Bottom Action Bar */}
          <div className="h-16 border-t border-white/5 bg-surface-container-low px-6 flex items-center justify-between shrink-0">
            <div className="flex gap-4">
              <button className="flex items-center gap-2 px-4 py-2 text-sm text-on-surface hover:bg-white/5 rounded-lg transition-all active:scale-95">
                <span className="material-symbols-outlined text-lg">terminal</span>
                <span>终端输出</span>
              </button>
            </div>
            <div className="flex gap-3">
              <button className="flex items-center gap-2 px-6 py-2 bg-surface-container-high hover:bg-surface-bright text-on-surface rounded-lg font-medium transition-all active:scale-95 border border-white/10">
                <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                运行代码
              </button>
              <button 
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-8 py-2 bg-primary hover:bg-primary-dim text-on-primary-container rounded-lg font-bold transition-all active:scale-95 shadow-[0_0_15px_rgba(83,221,252,0.3)] disabled:opacity-50 disabled:active:scale-100"
              >
                {submitting ? (
                  <span className="w-5 h-5 border-2 border-on-primary-container border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
                )}
                提交任务
              </button>
            </div>
          </div>
        </section>
      </main>
      
      {/* Required CSS Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar {
            display: none;
        }
        .glass-panel {
            background: rgba(15, 25, 48, 0.7);
            backdrop-filter: blur(16px);
        }
      `}} />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Editor from "@monaco-editor/react";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/layout/Header";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { getExercise, submitExercise, type Exercise } from "@/lib/api";
import { Badge } from "@/components/common/Badge";
import {
  Bot,
  BookMarked,
  CheckCircle2,
  Loader2,
  Send,
  Terminal,
  X,
} from "lucide-react";

function monacoLanguage(lang?: string | null): string {
  const l = (lang || "python").toLowerCase();
  if (l.includes("javascript") || l === "js" || l === "node") return "javascript";
  if (l.includes("typescript") || l === "ts") return "typescript";
  if (l.includes("go")) return "go";
  if (l.includes("rust") || l === "rs") return "rust";
  if (l.includes("c++") || l === "cpp" || l === "cplusplus") return "cpp";
  if (l.includes("java") && !l.includes("script")) return "java";
  return "python";
}

function fileLabel(lang?: string | null): string {
  const m = monacoLanguage(lang);
  const map: Record<string, string> = {
    python: "main.py",
    javascript: "main.js",
    typescript: "main.ts",
    go: "main.go",
    rust: "main.rs",
    cpp: "main.cpp",
    java: "Main.java",
  };
  return map[m] || "main.py";
}

export default function ExercisePage() {
  const params = useParams();
  const router = useRouter();
  const { init } = useAuth();
  const exerciseId = params.exerciseId as string;

  const [code, setCode] = useState("");
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [submissionResult, setSubmissionResult] = useState<
    "pass" | "fail" | "error" | null
  >(null);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    let cancelled = false;
    async function fetchExerciseData() {
      setLoading(true);
      setLoadError("");
      try {
        const data = await getExercise(exerciseId);
        if (cancelled) return;
        setExercise(data);
        setCode(data.starter_code || "");
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to load exercise:", e);
          setLoadError(e instanceof Error ? e.message : "加载练习失败");
          setExercise(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchExerciseData();
    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  const handleSubmit = async () => {
    if (!exercise || submitting) return;
    setSubmitting(true);
    setAiFeedback(null);
    setSubmissionResult(null);

    try {
      const res = await submitExercise(exerciseId, code);
      setSubmissionResult(res.result);
      if (res.ai_feedback) {
        setAiFeedback(res.ai_feedback);
      }
    } catch (e) {
      console.error("Submission failed:", e);
      setSubmissionResult("error");
      setAiFeedback(
        e instanceof Error ? e.message : "提交失败，请检查网络连接或后端服务。"
      );
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="text-primary animate-spin" />
          <p className="text-sm font-headline text-slate-400">
            正在配置编程沙箱与测试用例...
          </p>
        </div>
      </div>
    );
  }

  if (!exercise) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center px-6">
          <p className="text-sm text-red-400 mb-4">{loadError || "练习不存在"}</p>
          <button
            type="button"
            onClick={() => router.push("/exercises")}
            className="text-xs font-bold text-primary underline"
          >
            返回练习列表
          </button>
        </div>
      </div>
    );
  }

  const editorLang = monacoLanguage(exercise.language);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-on-background font-body selection:bg-primary/30">
      <Header />

      <main className="flex-1 mt-[61px] flex overflow-hidden">
        {/* Left: Markdown description */}
        <section className="w-[min(480px,42%)] flex-shrink-0 bg-surface-container-low flex flex-col border-r border-white/5 overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1 text-on-surface-variant">
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <Badge difficulty={exercise.difficulty || "medium"} size="sm" />
              {exercise.language && (
                <Badge language={exercise.language} size="sm" />
              )}
              {exercise.source_kbs && exercise.source_kbs.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-mono text-violet-300 bg-violet-500/10 border border-violet-500/25 px-2 py-0.5 rounded-full max-w-[180px] truncate"
                  title={exercise.source_kbs.map((k) => k.name).join("、")}
                >
                  <BookMarked size={10} />
                  {exercise.source_kbs[0].name}
                </span>
              )}
            </div>

            <h1 className="text-2xl md:text-3xl font-headline font-bold text-white mb-5 leading-tight">
              {exercise.title}
            </h1>

            <div className="text-sm leading-relaxed">
              <MarkdownRenderer content={exercise.description || ""} />
            </div>

            {exercise.test_cases && exercise.test_cases.length > 0 && (
              <div className="mt-8 space-y-3">
                <h3 className="text-sm font-bold text-primary font-headline">
                  公开测试用例
                </h3>
                {exercise.test_cases
                  .filter((tc) => !tc.hidden)
                  .slice(0, 3)
                  .map((tc, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-white/10 bg-[#0d1117] p-3 font-mono text-[11px] space-y-2"
                    >
                      <div>
                        <span className="text-slate-500">输入</span>
                        <pre className="mt-1 whitespace-pre-wrap text-cyan-200/90">
                          {tc.input}
                        </pre>
                      </div>
                      <div>
                        <span className="text-slate-500">期望</span>
                        <pre className="mt-1 whitespace-pre-wrap text-emerald-300/90">
                          {tc.expected}
                        </pre>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="p-5 bg-surface-container-lowest/80 border-t border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              实战模式
            </div>
            <span className="text-xs font-mono text-cyan-400 font-medium">
              AI 自动评测就绪
            </span>
          </div>
        </section>

        {/* Right: Monaco editor */}
        <section className="flex-1 bg-surface-container-lowest relative flex flex-col overflow-hidden min-w-0">
          <div className="flex bg-surface-container-low px-2 border-b border-white/5 h-11 items-center justify-between shrink-0">
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-highest/80 border-t-2 border-primary text-xs text-primary font-mono h-full">
              <Terminal size={14} />
              {fileLabel(exercise.language)}
            </div>
            <span className="text-[11px] font-mono text-slate-500 pr-4">
              UTF-8 · {editorLang}
            </span>
          </div>

          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              language={editorLang}
              theme="vs-dark"
              value={code}
              onChange={(v) => setCode(v ?? "")}
              options={{
                fontSize: 14,
                fontFamily: "JetBrains Mono, ui-monospace, monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 16, bottom: 16 },
                lineNumbers: "on",
                automaticLayout: true,
                tabSize: 4,
                wordWrap: "on",
                renderLineHighlight: "line",
              }}
              loading={
                <div className="h-full flex items-center justify-center text-sm text-slate-500">
                  <Loader2 size={18} className="animate-spin mr-2" />
                  加载编辑器…
                </div>
              }
            />
          </div>

          {aiFeedback && (
            <div
              className={`absolute right-8 top-16 w-88 max-w-[min(360px,90%)] backdrop-blur-2xl rounded-2xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-30 border ${
                submissionResult === "pass"
                  ? "bg-emerald-950/80 border-emerald-500/40"
                  : "bg-surface-container-high/95 border-secondary/30"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      submissionResult === "pass"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-secondary/20 text-secondary"
                    }`}
                  >
                    {submissionResult === "pass" ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <Bot size={16} />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white font-headline">
                      CodePilot AI 判题
                    </div>
                    <div
                      className={`text-[11px] font-medium ${
                        submissionResult === "pass"
                          ? "text-emerald-400"
                          : "text-secondary"
                      }`}
                    >
                      {submissionResult === "fail"
                        ? "存在优化点"
                        : submissionResult === "pass"
                          ? "通过全部测试"
                          : "执行反馈"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAiFeedback(null)}
                  className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed mb-4 max-h-48 overflow-y-auto">
                <MarkdownRenderer content={aiFeedback} />
              </div>

              {submissionResult === "pass" && (
                <button
                  type="button"
                  onClick={() => router.push("/exercises")}
                  className="w-full py-2 bg-emerald-500 text-surface rounded-xl text-xs font-bold font-headline hover:bg-emerald-400 transition-colors"
                >
                  返回题库
                </button>
              )}
            </div>
          )}

          <div className="h-16 border-t border-white/5 bg-surface-container-low px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Terminal size={14} className="text-primary" />
              <span>Monaco 编辑器 · 语法高亮已启用</span>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-7 py-2.5 bg-primary hover:bg-primary-dim text-on-primary-container rounded-xl font-bold font-headline text-xs transition-all active:scale-95 shadow-[0_0_20px_rgba(83,221,252,0.3)] disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  AI 正在运行并判题...
                </>
              ) : (
                <>
                  <Send size={14} />
                  提交任务并让 AI 判题
                </>
              )}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Editor from "@monaco-editor/react";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/layout/Header";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import {
  getExercise,
  listExerciseSubmissions,
  runCode,
  submitExercise,
  type CodeRunResponse,
  type Exercise,
  type SubmissionResponse,
} from "@/lib/api";
import { Badge } from "@/components/common/Badge";
import { CelebrationConfetti } from "@/components/common/CelebrationConfetti";
import { normalizeLanguage } from "@/lib/languageRuntime";
import {
  Bot,
  BookMarked,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Terminal,
  X,
} from "lucide-react";

function monacoLanguage(lang?: string | null): string {
  const language = normalizeLanguage(lang || "python");
  return language === "bash" ? "shell" : language;
}

function fileLabel(lang?: string | null): string {
  const m = normalizeLanguage(lang || "python");
  const map: Record<string, string> = {
    python: "main.py",
    javascript: "main.js",
    typescript: "main.ts",
    go: "main.go",
    rust: "main.rs",
    cpp: "main.cpp",
    c: "main.c",
    csharp: "Program.cs",
    java: "Main.java",
    kotlin: "Main.kt",
    swift: "main.swift",
    ruby: "main.rb",
    php: "main.php",
    bash: "main.sh",
  };
  return map[m] || "main.py";
}

export default function ExercisePage() {
  const params = useParams();
  const router = useRouter();
  const { init } = useAuth();
  const { theme } = useTheme();
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
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null);
  const [returnTo, setReturnTo] = useState("/exercises");
  const [stdin, setStdin] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<CodeRunResponse | null>(null);
  const [runError, setRunError] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<"run" | "history">("run");
  const [history, setHistory] = useState<SubmissionResponse[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<SubmissionResponse | null>(null);

  useEffect(() => {
    init();
    const requestedReturn = new URLSearchParams(window.location.search).get("returnTo");
    if (requestedReturn?.startsWith("/learn/")) {
      setReturnTo(requestedReturn);
    }
  }, [init]);

  useEffect(() => {
    let cancelled = false;
    async function fetchExerciseData() {
      setLoading(true);
      setLoadError("");
      try {
        const [data, submissions] = await Promise.all([
          getExercise(exerciseId),
          listExerciseSubmissions(exerciseId).catch(() => []),
        ]);
        if (cancelled) return;
        setExercise(data);
        setCode(data.starter_code || "");
        setStdin(data.test_cases?.find((test) => !test.hidden)?.input || "");
        setHistory(submissions);
        setSelectedHistory(submissions[0] || null);
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

  const refreshHistory = async () => {
    setHistoryLoading(true);
    try {
      const submissions = await listExerciseSubmissions(exerciseId);
      setHistory(submissions);
      setSelectedHistory(submissions[0] || null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRun = async () => {
    if (!exercise || running || !code.trim()) return;
    setRunning(true);
    setRunError("");
    setRunResult(null);
    setPanelOpen(true);
    setPanelTab("run");
    try {
      setRunResult(await runCode(code, exercise.language, stdin));
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "代码运行失败");
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!exercise || submitting) return;
    setSubmitting(true);
    setAiFeedback(null);
    setSubmissionResult(null);
    setSubmission(null);

    try {
      const res = await submitExercise(exerciseId, code);
      setSubmission(res);
      setSubmissionResult(res.result);
      if (res.ai_feedback) {
        setAiFeedback(res.ai_feedback);
      }
      await refreshHistory().catch(() => undefined);
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
            onClick={() => router.push(returnTo)}
            className="text-xs font-bold text-primary underline"
          >
            {returnTo === "/exercises" ? "返回练习列表" : "返回章节"}
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
        <section className="w-[min(480px,42%)] flex-shrink-0 bg-surface-container-low flex flex-col border-r border-slate-200/80 dark:border-white/5 overflow-hidden">
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

            <h1 className="text-2xl md:text-3xl font-headline font-bold text-slate-900 dark:text-white mb-5 leading-tight">
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
                      className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0d1117] p-3 font-mono text-[11px] space-y-2 shadow-xs dark:shadow-none"
                    >
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">输入</span>
                        <pre className="mt-1 whitespace-pre-wrap text-cyan-800 dark:text-cyan-200/90 font-medium">
                          {tc.input}
                        </pre>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">期望</span>
                        <pre className="mt-1 whitespace-pre-wrap text-emerald-700 dark:text-emerald-300/90 font-medium">
                          {tc.expected}
                        </pre>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="p-5 bg-surface-container-lowest/80 border-t border-slate-200/80 dark:border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
              实战模式
            </div>
            <span className="text-xs font-mono text-cyan-700 dark:text-cyan-400 font-medium">
              Judge0 真实沙箱就绪
            </span>
          </div>
        </section>

        {/* Right: Monaco editor */}
        <section className="flex-1 bg-surface-container-lowest relative flex flex-col overflow-hidden min-w-0">
          <div className="flex bg-surface-container-low px-2 border-b border-slate-200/80 dark:border-white/5 h-11 items-center justify-between shrink-0">
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-highest/80 border-t-2 border-primary text-xs text-primary font-mono h-full">
              <Terminal size={14} />
              {fileLabel(exercise.language)}
            </div>
            <span className="text-[11px] font-mono text-slate-500 pr-4">
              UTF-8 · {editorLang}
            </span>
          </div>

          <div className="flex-1 relative w-full h-full min-h-0 overflow-hidden bg-white dark:bg-[#1e1e1e]">
            <div className="absolute inset-0">
              <Editor
                height="100%"
                language={editorLang}
                theme={theme === "light" ? "vs" : "vs-dark"}
                value={code}
                onChange={(v) => setCode(v ?? "")}
                options={{
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
                  fontLigatures: true,
                  cursorBlinking: "smooth",
                  cursorSmoothCaretAnimation: "on",
                  smoothScrolling: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 16, bottom: 16 },
                  lineNumbers: "on",
                  automaticLayout: true,
                  tabSize: 4,
                  wordWrap: "on",
                  renderLineHighlight: "all",
                }}
                loading={
                  <div className="h-full flex items-center justify-center text-sm text-slate-500">
                    <Loader2 size={18} className="animate-spin mr-2 text-primary" />
                    加载编辑器…
                  </div>
                }
              />
            </div>
          </div>

          <div className={`${panelOpen ? "h-64" : "h-10"} shrink-0 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0d1117] transition-[height] overflow-hidden`}>
            <div className="h-10 flex items-center justify-between px-3 border-b border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-surface-container-low">
              <div className="flex items-center h-full">
                <button
                  type="button"
                  onClick={() => {
                    setPanelTab("run");
                    setPanelOpen(true);
                  }}
                  className={`h-full px-3 flex items-center gap-1.5 text-[11px] font-bold border-b-2 ${
                    panelTab === "run" && panelOpen
                      ? "text-primary border-primary"
                      : "text-slate-500 border-transparent"
                  }`}
                >
                  <Terminal size={12} /> 运行结果
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPanelTab("history");
                    setPanelOpen(true);
                  }}
                  className={`h-full px-3 flex items-center gap-1.5 text-[11px] font-bold border-b-2 ${
                    panelTab === "history" && panelOpen
                      ? "text-primary border-primary"
                      : "text-slate-500 border-transparent"
                  }`}
                >
                  <History size={12} /> 提交历史
                  {history.length > 0 && (
                    <span className="rounded-full bg-slate-200 dark:bg-white/10 px-1.5 text-[9px]">{history.length}</span>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen((open) => !open)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10"
                aria-label={panelOpen ? "收起面板" : "展开面板"}
              >
                {panelOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            </div>

            {panelOpen && panelTab === "run" && (
              <div className="h-[calc(100%_-_2.5rem)] grid grid-cols-[minmax(180px,32%)_1fr]">
                <label className="p-3 border-r border-slate-200 dark:border-white/10 flex flex-col min-w-0">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">标准输入 stdin</span>
                  <textarea
                    value={stdin}
                    onChange={(event) => setStdin(event.target.value)}
                    className="flex-1 resize-none rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 p-2 font-mono text-xs outline-none focus:border-primary"
                    placeholder="输入程序需要读取的数据"
                  />
                </label>
                <div className="p-3 overflow-y-auto min-w-0 font-mono text-xs">
                  {running ? (
                    <div className="h-full flex items-center justify-center gap-2 text-slate-500">
                      <Loader2 size={15} className="animate-spin" /> 正在沙箱中运行…
                    </div>
                  ) : runError ? (
                    <pre className="whitespace-pre-wrap text-rose-500">{runError}</pre>
                  ) : runResult ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span className={runResult.has_error ? "text-rose-500" : "text-emerald-500"}>
                          {runResult.status}
                        </span>
                        {runResult.time && <span>耗时 {runResult.time}s</span>}
                        {runResult.memory !== null && runResult.memory !== undefined && <span>内存 {runResult.memory} KB</span>}
                        <span>{runResult.trusted ? "Judge0" : "LLM 临时模拟"}</span>
                      </div>
                      {!runResult.trusted && (
                        <div className="rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-300">
                          当前结果未经真实沙箱验证，不计入正式提交。
                        </div>
                      )}
                      <pre className={`whitespace-pre-wrap break-words ${runResult.has_error ? "text-rose-500" : "text-slate-800 dark:text-slate-200"}`}>
                        {runResult.output || runResult.stderr || runResult.compile_output || "程序执行完成，无输出。"}
                      </pre>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400">
                      点击“运行代码”查看控制台输出，不会产生正式提交记录。
                    </div>
                  )}
                </div>
              </div>
            )}

            {panelOpen && panelTab === "history" && (
              <div className="h-[calc(100%_-_2.5rem)] grid grid-cols-[220px_1fr] min-w-0">
                <div className="border-r border-slate-200 dark:border-white/10 overflow-y-auto">
                  {historyLoading ? (
                    <div className="py-8 flex justify-center"><Loader2 size={15} className="animate-spin text-primary" /></div>
                  ) : history.length === 0 ? (
                    <p className="p-4 text-xs text-slate-500">暂无正式提交记录</p>
                  ) : history.map((item) => (
                    <button
                      key={item.submission_id}
                      type="button"
                      onClick={() => setSelectedHistory(item)}
                      className={`w-full text-left px-3 py-2.5 border-b border-slate-200 dark:border-white/5 ${
                        selectedHistory?.submission_id === item.submission_id
                          ? "bg-primary/10"
                          : "hover:bg-slate-100 dark:hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[11px] font-bold ${
                          item.result === "pass" && item.trusted ? "text-emerald-500" : "text-rose-500"
                        }`}>
                          {item.result === "pass" ? "通过" : item.result === "fail" ? "未通过" : "错误"} · {item.score ?? 0}分
                        </span>
                        {!item.trusted && <span className="text-[9px] text-amber-500">非正式</span>}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-1">
                        {item.created_at ? new Date(item.created_at).toLocaleString() : "时间未知"}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="overflow-y-auto p-3 min-w-0">
                  {selectedHistory ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] text-slate-500 flex gap-3">
                          {selectedHistory.execution_time && <span>耗时 {selectedHistory.execution_time}s</span>}
                          {selectedHistory.memory !== null && selectedHistory.memory !== undefined && <span>内存 {selectedHistory.memory} KB</span>}
                          <span>{selectedHistory.judge_source}</span>
                        </div>
                        {selectedHistory.submitted_code && (
                          <button
                            type="button"
                            onClick={() => setCode(selectedHistory.submitted_code || "")}
                            className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
                          >
                            <RotateCcw size={11} /> 恢复此代码
                          </button>
                        )}
                      </div>
                      {selectedHistory.submitted_code && (
                        <pre className="max-h-20 overflow-auto rounded-lg bg-slate-900 text-slate-200 p-2 text-[10px] whitespace-pre-wrap">
                          {selectedHistory.submitted_code}
                        </pre>
                      )}
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                        {selectedHistory.test_results?.map((test) => (
                          <div
                            key={test.case}
                            className={`rounded-lg border p-2 text-[10px] ${
                              test.passed
                                ? "border-emerald-300 dark:border-emerald-500/30"
                                : "border-rose-300 dark:border-rose-500/30"
                            }`}
                          >
                            <div className="font-bold mb-1">
                              测试点 {test.case} · {test.passed ? "通过" : "失败"}{test.hidden ? " · 隐藏" : ""}
                            </div>
                            {!test.hidden && (
                              <div className="grid grid-cols-2 gap-2 font-mono">
                                <div><span className="text-slate-500">期望</span><pre className="whitespace-pre-wrap text-emerald-600">{test.expected || "(空)"}</pre></div>
                                <div><span className="text-slate-500">实际</span><pre className="whitespace-pre-wrap text-rose-500">{test.actual || "(空)"}</pre></div>
                                {test.stderr && <pre className="col-span-2 whitespace-pre-wrap text-rose-500">{test.stderr}</pre>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {selectedHistory.ai_feedback && (
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          <MarkdownRenderer content={selectedHistory.ai_feedback} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">选择一次提交查看详情</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {submissionResult === "pass" && submission?.trusted && (
            <CelebrationConfetti duration={3000} />
          )}

          {submission && (
            <div
              className={`absolute right-8 top-16 w-88 max-w-[min(360px,90%)] backdrop-blur-2xl rounded-2xl p-5 shadow-elevated z-30 border transition-all duration-300 ${
                submissionResult === "pass" && submission.trusted
                  ? "bg-emerald-50/95 dark:bg-emerald-950/80 border-emerald-500/40 text-slate-900 dark:text-slate-100 shadow-[0_12px_40px_rgba(16,185,129,0.15)]"
                  : "bg-white/95 dark:bg-surface-container-high/95 border-slate-200 dark:border-secondary/30 text-slate-900 dark:text-slate-100"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      submissionResult === "pass" && submission.trusted
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : "bg-secondary/20 text-secondary"
                    }`}
                  >
                    {submissionResult === "pass" && submission.trusted ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <Bot size={16} />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white font-headline">
                      {submission.trusted ? "CodePilot 真实判题" : "LLM 临时评估"}
                    </div>
                    <div
                      className={`text-[11px] font-medium ${
                        submissionResult === "pass" && submission.trusted
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-secondary"
                      }`}
                    >
                      {!submission.trusted
                        ? "结果非正式，不计为通过"
                        : submissionResult === "fail"
                        ? "存在优化点"
                        : submissionResult === "pass"
                          ? "通过全部测试"
                          : "执行反馈"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAiFeedback(null);
                    setSubmission(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
                >
                  <X size={15} />
                </button>
              </div>

              {!submission.trusted && (
                <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                  远程 Judge0 暂不可用。以下为 LLM 临时评估，恢复后请重新提交进行真实判题。
                </div>
              )}

              {submission?.test_results && (
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {submission.test_results.map((item) => (
                    <div
                      key={item.case}
                      className={`rounded-lg border px-2.5 py-2 text-[10px] font-mono ${
                        item.passed
                          ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                          : "border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300"
                      }`}
                    >
                      测试点 {item.case} · {item.status || (item.passed ? "通过" : "失败")}
                      {item.hidden ? " · 隐藏" : ""}
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-4 max-h-48 overflow-y-auto">
                {aiFeedback ? <MarkdownRenderer content={aiFeedback} /> : "判题已完成。"}
              </div>

              {submissionResult === "pass" && submission.trusted && (
                <button
                  type="button"
                  onClick={() => router.push(returnTo)}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold font-headline transition-colors shadow-xs"
                >
                  {returnTo === "/exercises" ? "返回题库" : "返回章节"}
                </button>
              )}
            </div>
          )}

          <div className="h-16 border-t border-slate-200/80 dark:border-white/5 bg-surface-container-low px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Terminal size={14} className="text-primary" />
              <span>Monaco 编辑器 · 语法高亮已启用</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRun}
                disabled={running || submitting || !code.trim()}
                className="flex items-center gap-2 px-5 py-2.5 border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 rounded-xl font-bold font-headline text-xs transition-all active:scale-95 disabled:opacity-50"
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} className="fill-current" />}
                {running ? "运行中..." : "运行代码"}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || running || !code.trim()}
                className="flex items-center gap-2 px-7 py-2.5 bg-primary hover:bg-primary-dim text-white rounded-xl font-bold font-headline text-xs transition-all active:scale-95 shadow-[0_2px_12px_rgba(2,132,199,0.3)] dark:shadow-[0_0_20px_rgba(83,221,252,0.3)] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Judge0 正在运行测试...
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    正式提交
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

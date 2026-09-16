"use client";

import { useEffect, useRef, useState, useCallback, type PointerEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import Editor from "@monaco-editor/react";
import { useTheme } from "@/components/ThemeProvider";
import { usePyodide } from "@/hooks/usePyodide";
import { StepAnimator } from "@/components/StepAnimator";
import { AnimationPlayer } from "@/components/AnimationPlayer";
import {
  WS_BASE,
  getPath as fetchPath, getChapter as fetchChapter,
  createConversation as apiCreateConversation,
  getConversationByChapter,
  getMessages,
  runCode as apiRunCode,
  generateSnippetExplain as apiGenerateSnippetExplain,
  updateChapterStatus,
} from "@/lib/api";
import { defaultFilename, extractCodeBlocks, fingerprintCode } from "@/lib/codeBlocks";
import { buildChapterArchive, safeArchiveName } from "@/lib/chapterExport";
import {
  DocumentLearningPanel,
  type DocAskContext,
} from "@/components/DocumentLearningPanel";
import { BookOpen, Bot, CheckCircle2, Download, Loader2, MessageSquare, Play, Send, User as UserIcon, X } from "lucide-react";

interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
}

interface EditorTab {
  id: string;
  label: string;
  language: string;
  originCode: string;
  code: string;
  fingerprint: string;
}

// 根据主题推断编辑器语言
function detectLang(topic: string): { lang: string; file: string; comment: string; runtime: string } {
  const t = topic.toLowerCase();
  if (t.includes("javascript") || t.includes("react") || t.includes("vue") || t.includes("node") || t.includes("next") || t.includes("typescript") || t.includes("ts")) {
    return { lang: "javascript", file: "index.js", comment: "//", runtime: "Node.js 20 environment ready." };
  }
  if (t.includes("go") || t.includes("golang")) {
    return { lang: "go", file: "main.go", comment: "//", runtime: "Go 1.22 environment ready." };
  }
  if (t.includes("rust")) {
    return { lang: "rust", file: "main.rs", comment: "//", runtime: "Rust 1.76 environment ready." };
  }
  if (t.includes("java") && !t.includes("javascript")) {
    return { lang: "java", file: "Main.java", comment: "//", runtime: "Java 21 environment ready." };
  }
  if (t.includes("c++") || t.includes("cpp")) {
    return { lang: "cpp", file: "main.cpp", comment: "//", runtime: "C++ 17 environment ready." };
  }
  return { lang: "python", file: "main.py", comment: "#", runtime: "Python 3.12 environment ready." };
}

export default function LearningWorkspacePage() {
  const params = useParams();
  const pathId = params.pathId as string;
  const chapterId = params.chapterId as string;
  const { token, init: authInit } = useAuth();
  const { theme } = useTheme();

  useEffect(() => { authInit(); }, [authInit]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [editorInfo, setEditorInfo] = useState({ lang: "python", file: "main.py", comment: "#", runtime: "Python 3.12 environment ready." });
  const [tabs, setTabs] = useState<EditorTab[]>([
    {
      id: "scratch",
      label: "草稿.py",
      language: "python",
      originCode: "# 在这里编写代码\n",
      code: "# 在这里编写代码\n",
      fingerprint: "scratch",
    },
  ]);
  const [activeTabId, setActiveTabId] = useState("scratch");
  const [consoleOutput, setConsoleOutput] = useState<string[]>(["环境加载中..."]);
  const [running, setRunning] = useState(false);
  const [chapterCompleted, setChapterCompleted] = useState(false);
  const [chapterTitle, setChapterTitle] = useState("本章内容");
  const [exporting, setExporting] = useState(false);
  const [completing, setCompleting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [animationData, setAnimationData] = useState<any | null>(null);
  const [generatingAnim, setGeneratingAnim] = useState(false);
  const [learnMode, setLearnMode] = useState<"ai" | "doc">("ai");
  const [docAskContext, setDocAskContext] = useState<DocAskContext | null>(null);
  const [docMessages, setDocMessages] = useState<ChatMessage[]>([]);
  const router = useRouter();

  const wsRef = useRef<WebSocket | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const docChatScrollRef = useRef<HTMLDivElement>(null);
  const followChatRef = useRef(true);
  const followDocChatRef = useRef(true);
  const pendingTokensRef = useRef("");
  const tokenFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyTargetRef = useRef<"ai" | "doc">("ai");
  const splitRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const SPLIT_KEY = "codepilot-learn-right-pct";
  const [rightPct, setRightPct] = useState(38);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SPLIT_KEY);
      if (saved) {
        const n = Number(saved);
        if (Number.isFinite(n) && n >= 22 && n <= 70) setRightPct(n);
      }
    } catch { /* ignore */ }
  }, []);

  const clampRightPct = useCallback((pct: number) => Math.min(70, Math.max(22, pct)), []);

  const onSplitPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onSplitPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((rect.right - e.clientX) / rect.width) * 100;
    setRightPct(clampRightPct(pct));
  }, [clampRightPct]);

  const onSplitPointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
    setRightPct((pct) => {
      try { localStorage.setItem(SPLIT_KEY, String(pct)); } catch { /* ignore */ }
      return pct;
    });
  }, []);

  const keepAtBottom = useCallback((container: HTMLDivElement | null) => {
    if (container) container.scrollTop = container.scrollHeight;
  }, []);

  useEffect(() => {
    if (!followChatRef.current) return;
    const frame = requestAnimationFrame(() => keepAtBottom(chatScrollRef.current));
    return () => cancelAnimationFrame(frame);
  }, [messages, keepAtBottom]);

  useEffect(() => {
    if (!followDocChatRef.current) return;
    const frame = requestAnimationFrame(() => keepAtBottom(docChatScrollRef.current));
    return () => cancelAnimationFrame(frame);
  }, [docMessages, keepAtBottom]);

  const flushStreamTokens = useCallback(() => {
    const content = pendingTokensRef.current;
    pendingTokensRef.current = "";
    if (tokenFlushTimerRef.current) {
      clearTimeout(tokenFlushTimerRef.current);
      tokenFlushTimerRef.current = null;
    }
    if (!content) return;
    const setter = replyTargetRef.current === "doc" ? setDocMessages : setMessages;
    setter((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        return [...prev.slice(0, -1), { ...last, content: last.content + content }];
      }
      return [...prev, { role: "assistant", content }];
    });
  }, []);

  const appendStreamToken = useCallback((content: string) => {
    pendingTokensRef.current += content;
    if (tokenFlushTimerRef.current) return;
    tokenFlushTimerRef.current = setTimeout(flushStreamTokens, 40);
  }, [flushStreamTokens]);

  useEffect(() => () => {
    if (tokenFlushTimerRef.current) clearTimeout(tokenFlushTimerRef.current);
  }, []);

  const appendSystemError = useCallback((message: string) => {
    const setter = replyTargetRef.current === "doc" ? setDocMessages : setMessages;
    setter((prev) => [...prev, { role: "system", content: `错误: ${message}` }]);
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const activeCode = activeTab?.code ?? "";
  const activeLang = activeTab?.language || editorInfo.lang;

  const exportChapterCode = async () => {
    if (exporting || tabs.length === 0) return;
    setExporting(true);
    try {
      const archive = await buildChapterArchive({
        chapterTitle,
        language: editorInfo.lang,
        tabs: tabs.map((tab) => ({
          label: tab.label,
          language: tab.language,
          code: tab.code,
        })),
      });
      const bytes = new Uint8Array(archive.byteLength);
      bytes.set(archive);
      const blob = new Blob([bytes.buffer], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeArchiveName(chapterTitle)}-code.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  // 从课程消息同步代码 Tab（保留用户已修改内容）
  useEffect(() => {
    if (streaming) return;
    const assistantText = messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content)
      .join("\n\n");
    const blocks = extractCodeBlocks(assistantText);
    if (blocks.length === 0) return;

    setTabs((prev) => {
      const scratch = prev.find((t) => t.id === "scratch");
      const byFp = new Map(prev.map((t) => [t.fingerprint, t]));
      const nextLessonTabs: EditorTab[] = blocks.map((b, i) => {
        const existing = byFp.get(b.fingerprint);
        if (existing) {
          const edited = existing.code !== existing.originCode;
          return {
            ...existing,
            label: defaultFilename(b.language, i),
            language: b.language,
            originCode: b.code,
            code: edited ? existing.code : b.code,
          };
        }
        return {
          id: `lesson-${b.fingerprint}`,
          label: defaultFilename(b.language, i),
          language: b.language,
          originCode: b.code,
          code: b.code,
          fingerprint: b.fingerprint,
        };
      });

      const merged = [
        ...(scratch
          ? [scratch]
          : [
              {
                id: "scratch",
                label: "草稿.py",
                language: editorInfo.lang,
                originCode: `${editorInfo.comment} 在这里编写代码\n`,
                code: `${editorInfo.comment} 在这里编写代码\n`,
                fingerprint: "scratch",
              } as EditorTab,
            ]),
        ...nextLessonTabs,
      ];
      return merged;
    });

    setActiveTabId((curr) => {
      if (curr === "scratch") {
        const first = blocks[0];
        return first ? `lesson-${first.fingerprint}` : curr;
      }
      return curr;
    });
  }, [messages, streaming, editorInfo.lang, editorInfo.comment]);

  const openInEditor = useCallback((code: string, language: string) => {
    const lang = language.toLowerCase();
    const fp = fingerprintCode(lang, code);
    setTabs((prev) => {
      const existing = prev.find((t) => t.fingerprint === fp || t.id === `lesson-${fp}`);
      if (existing) return prev;
      const lessonCount = prev.filter((t) => t.id.startsWith("lesson-")).length;
      return [
        ...prev,
        {
          id: `lesson-${fp}`,
          label: defaultFilename(lang, lessonCount),
          language: lang,
          originCode: code,
          code,
          fingerprint: fp,
        },
      ];
    });
    setActiveTabId(`lesson-${fp}`);
  }, []);

  const explainSnippet = useCallback(
    async (payload: { code: string; language: string; context: string }) => {
      if (generatingAnim) return;
      setGeneratingAnim(true);
      setAnimationData(null);
      try {
        const data = await apiGenerateSnippetExplain({
          code: payload.code,
          language: payload.language,
          context: payload.context,
        });
        setAnimationData(data);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "system", content: "知识点讲解生成失败，请稍后重试" },
        ]);
      } finally {
        setGeneratingAnim(false);
      }
    },
    [generatingAnim]
  );

  useEffect(() => {
    if (!animationData && !generatingAnim) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAnimationData(null);
        setGeneratingAnim(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [animationData, generatingAnim]);

  const updateActiveCode = (value: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, code: value } : t))
    );
  };

  // 1. 创建对话
  const createConversation = useCallback(async () => {
    try {
      const data = await apiCreateConversation({ chapter_id: chapterId, title: "学习对话" });
      setConvId(data.id);
      return data.id;
    } catch { return null; }
  }, [chapterId]);

  // 2. 连接 WebSocket — 返回 Promise 等待连接成功
  const connectWs = useCallback((conversationId: string): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current) wsRef.current.close();
      const ws = new WebSocket(`${WS_BASE}/ws/chat/${conversationId}`);

      ws.onopen = () => { wsRef.current = ws; resolve(ws); };
      ws.onerror = () => { setStreaming(false); reject(); };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "token") {
          appendStreamToken(data.content);
        } else if (data.type === "done") {
          flushStreamTokens();
          setStreaming(false);
        } else if (data.type === "error") {
          flushStreamTokens();
          setStreaming(false);
          appendSystemError(data.message || "未知错误");
        }
      };

      ws.onclose = () => { wsRef.current = null; };
    });
  }, [appendStreamToken, appendSystemError, flushStreamTokens]);

  // 3. 页面加载：复用章节对话（有历史则恢复，否则新建并引导）
  useEffect(() => {
    let cancelled = false;

    async function initWorkspace() {
      // 获取路线信息推断语言
      let langLabel = "Python";
      try {
        const p = await fetchPath(pathId);
        if (cancelled) return;
        const info = detectLang(p.topic || "");
        setEditorInfo(info);
        const scratchCode = `${info.comment} 在这里编写代码\n`;
        setTabs([
          {
            id: "scratch",
            label: info.file.replace("main", "草稿").replace("Main", "草稿").replace("index", "草稿"),
            language: info.lang,
            originCode: scratchCode,
            code: scratchCode,
            fingerprint: "scratch",
          },
        ]);
        setActiveTabId("scratch");
        setConsoleOutput([info.runtime]);
        langLabel = info.lang === "cpp" ? "C++" : info.lang.charAt(0).toUpperCase() + info.lang.slice(1);
      } catch { /* ignore */ }

      if (cancelled) return;

      // 获取章节信息
      let chapterTitle = "本章内容";
      try {
        const ch = await fetchChapter(chapterId);
        if (cancelled) return;
        chapterTitle = ch.title || chapterTitle;
        setChapterTitle(chapterTitle);
      } catch { /* ignore */ }

      // 优先恢复该章节已有对话
      let conversationId: string | null = null;
      let hasHistory = false;
      try {
        const existing = await getConversationByChapter(chapterId);
        if (cancelled) return;
        if (existing) {
          conversationId = existing.id;
          const history = await getMessages(existing.id);
          if (cancelled) return;
          const restored = history
            .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
            .map((m) => ({
              id: m.id,
              role: m.role as ChatMessage["role"],
              content: m.content,
            }));
          if (restored.length > 0) {
            setMessages(restored);
            hasHistory = true;
          }
        }
      } catch { /* ignore */ }

      if (!conversationId) {
        conversationId = await createConversation();
      } else {
        setConvId(conversationId);
      }
      if (cancelled || !conversationId) return;

      try {
        await connectWs(conversationId);
        if (cancelled) return;
        // 无历史才发送自动引导；有历史则直接续聊
        if (!hasHistory) {
          setStreaming(true);
          replyTargetRef.current = "ai";
          const ws = wsRef.current;
          if (!ws) {
            setStreaming(false);
            return;
          }
          ws.send(JSON.stringify({
            type: "message",
            content: `我刚进入「${chapterTitle}」章节的学习页面。我当前的学习路径语言是 ${langLabel}。请你作为 AI 编程导师，全程用 ${langLabel} 讲解并给代码示例，不要询问或切换其他语言。先简要介绍本章会学到什么，然后问问我有没有相关基础、想从哪个方面开始学起。用友好亲切的语气。`,
          }));
        }
      } catch {
        setStreaming(false);
      }
    }

    setMessages([]);
    setDocMessages([]);
    setConvId(null);
    setStreaming(false);
    setLearnMode("ai");
    initWorkspace();

    return () => {
      cancelled = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [chapterId, pathId, createConversation, connectWs]);

  // 5. 运行代码
  const { runPython, loading: pyodideLoading, ready: pyodideReady } = usePyodide();

  const runCode = async () => {
    if (running || !activeCode.trim()) return;
    setRunning(true);
    setConsoleOutput(prev => [...prev, "▶ Running..."]);

    try {
      if (activeLang === "python") {
        // Python → Pyodide 浏览器端真实执行
        if (!pyodideReady) {
          setConsoleOutput(prev => [...prev, "⚙️ 正在加载 Python 环境 (Pyodide)..."]);
        }
        const result = await runPython(activeCode);
        setConsoleOutput(prev => [
          ...prev,
          result.output,
          result.error ? "Program exited with error." : "Program finished.",
        ]);
      } else {
        // 非 Python → Judge0 隔离沙箱真实执行
        const data = await apiRunCode(activeCode, activeLang);
        setConsoleOutput(prev => [
          ...prev,
          data.output,
          `${data.status}${data.time ? ` · ${data.time}s` : ""}`,
          data.trusted ? "Remote Judge0 verified." : "LLM fallback: untrusted temporary simulation.",
        ]);
      }
    } catch {
      setConsoleOutput(prev => [...prev, "Error: 执行失败"]);
    } finally {
      setRunning(false);
    }
  };

  // 4. 发送消息
  const sendMessage = async () => {
    if (!input.trim() || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const target = learnMode === "doc" ? "doc" : "ai";
    replyTargetRef.current = target;
    if (target === "doc") {
      followDocChatRef.current = true;
      setDocMessages((prev) => [...prev, userMsg]);
    } else {
      followChatRef.current = true;
      setMessages((prev) => [...prev, userMsg]);
    }
    setInput("");
    setStreaming(true);

    let currentConvId = convId;
    if (!currentConvId) {
      currentConvId = await createConversation();
      if (!currentConvId) { setStreaming(false); return; }
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      try { await connectWs(currentConvId); } catch { setStreaming(false); return; }
    }

    wsRef.current?.send(
      JSON.stringify({
        type: "message",
        content: userMsg.content,
        ...(target === "doc" && docAskContext
          ? { doc_context: docAskContext }
          : {}),
      })
    );
  };

  return (
    <div
      ref={splitRef}
      className={`flex h-full w-full min-w-0 ${isDragging ? "select-none cursor-col-resize" : ""}`}
    >
      {/* Left: AI Chat / Document mode — 互斥，不叠在一起 */}
      <main className="flex-1 min-w-0 flex flex-col bg-surface overflow-hidden relative">
        {/* Mode switch */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-surface-container-low/30">
          <button
            type="button"
            onClick={() => {
              setLearnMode("ai");
              setDocAskContext(null);
            }}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
              learnMode === "ai"
                ? "bg-primary/20 text-primary border-primary/40"
                : "text-slate-400 border-white/10 hover:border-white/25"
            }`}
          >
            <MessageSquare size={14} />
            AI 教学
          </button>
          <button
            type="button"
            onClick={() => setLearnMode("doc")}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
              learnMode === "doc"
                ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                : "text-slate-400 border-white/10 hover:border-white/25"
            }`}
          >
            <BookOpen size={14} />
            文档学习
          </button>
          <span className="text-[10px] text-slate-500 ml-1 hidden sm:inline">
            {learnMode === "doc"
              ? "阅读讲义 / 原文 · 下方可针对当前阶段提问"
              : "与 AI 导师对话学习 · 可随时切换到文档模式"}
          </span>
        </div>

        {learnMode === "doc" ? (
          <>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <DocumentLearningPanel
                chapterId={chapterId}
                onAskContextChange={setDocAskContext}
                onOpenInEditor={openInEditor}
                onExplainSnippet={explainSnippet}
                explaining={generatingAnim}
                activeFingerprint={activeTab?.fingerprint}
              />
            </div>

            {/* 文档模式独立问答区（不混入 AI 教学对话） */}
            <div className="shrink-0 border-t border-white/10 bg-surface-container-low/40 max-h-[32%] flex flex-col min-h-[120px]">
              <div className="shrink-0 px-4 py-1.5 flex items-center justify-between border-b border-white/5">
                <span className="text-[11px] font-bold text-violet-300/90">针对文档提问</span>
                {docAskContext && (
                  <span className="text-[10px] text-slate-500 truncate max-w-[70%]">
                    {docAskContext.source_label} · {docAskContext.stage_title.replace(/\*+/g, "")}
                    {docAskContext.selection ? " · 含选中" : ""}
                  </span>
                )}
              </div>
              <div
                ref={docChatScrollRef}
                onScroll={(event) => {
                  const el = event.currentTarget;
                  followDocChatRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
                className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-2"
              >
                {docMessages.length === 0 && (
                  <p className="text-[11px] text-slate-500 py-2">
                    选中文中片段或直接提问，回答只出现在这里，不会和「AI 教学」对话混在一起。
                  </p>
                )}
                {docMessages.map((msg, i) =>
                  msg.role === "user" ? (
                    <div key={i} className="text-xs text-right">
                      <span className="inline-block bg-primary/15 border border-primary/25 rounded-xl rounded-tr-sm px-3 py-1.5 text-on-surface max-w-[90%] text-left whitespace-pre-wrap">
                        {msg.content}
                      </span>
                    </div>
                  ) : msg.role === "system" ? (
                    <div key={i} className="text-[11px] text-center text-red-400">{msg.content}</div>
                  ) : (
                    <div key={i} className="text-xs">
                      <div className="inline-block bg-surface-container-high/50 border border-white/5 rounded-xl rounded-tl-sm px-3 py-2 text-on-surface-variant max-w-[95%]">
                        <StepAnimator
                          content={msg.content}
                          isStreaming={streaming && i === docMessages.length - 1}
                          onOpenInEditor={openInEditor}
                          onExplainSnippet={explainSnippet}
                          explaining={generatingAnim}
                          activeFingerprint={activeTab?.fingerprint}
                        />
                        {streaming && i === docMessages.length - 1 && (
                          <span className="inline-block w-1.5 h-3 bg-secondary ml-1 animate-pulse align-middle" />
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </>
        ) : (
          <div
            ref={chatScrollRef}
            onScroll={(event) => {
              const el = event.currentTarget;
              followChatRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="flex-1 overflow-y-auto p-6 space-y-6 pb-32"
          >
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full opacity-60">
                <div className="flex flex-col items-center text-center">
                  <Loader2 size={36} className="text-secondary animate-spin mb-3" />
                  <p className="text-on-surface-variant text-sm font-headline">AI 导师正在准备引导与代码案例...</p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              msg.role === "user" ? (
                <div key={i} className="flex gap-4 max-w-3xl ml-auto flex-row-reverse">
                  <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-600 dark:bg-primary/20 dark:text-primary flex items-center justify-center flex-shrink-0 mt-1 border border-sky-300 dark:border-primary/30 shadow-xs">
                    <UserIcon size={15} />
                  </div>
                  <div className="p-4 rounded-2xl rounded-tr-none bg-sky-50 dark:bg-primary/10 border border-sky-200/90 dark:border-primary/20 shadow-xs dark:shadow-lg text-slate-900 dark:text-on-surface">
                    <p className="leading-relaxed whitespace-pre-wrap text-[14.5px]">{msg.content}</p>
                  </div>
                </div>
              ) : msg.role === "system" ? (
                <div key={i} className="text-center text-red-500 dark:text-red-400 text-sm py-2">{msg.content}</div>
              ) : (
                <div key={i} className="flex gap-4 max-w-3xl">
                  <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 dark:bg-secondary/20 dark:text-secondary flex items-center justify-center flex-shrink-0 mt-1 border border-violet-200 dark:border-secondary/30 shadow-xs">
                    <Bot size={16} />
                  </div>
                  <div className="p-5 rounded-2xl rounded-tl-none bg-white dark:bg-surface-container-high/40 border border-slate-200/90 dark:border-white/5 shadow-sm dark:shadow-xl text-slate-800 dark:text-on-surface-variant">
                    <StepAnimator
                      content={msg.content}
                      isStreaming={streaming && i === messages.length - 1}
                      onOpenInEditor={openInEditor}
                      onExplainSnippet={explainSnippet}
                      explaining={generatingAnim}
                      activeFingerprint={activeTab?.fingerprint}
                    />
                    {streaming && i === messages.length - 1 && (
                      <span className="inline-block w-1.5 h-4 bg-sky-500 dark:bg-secondary ml-1 animate-pulse align-middle" />
                    )}
                  </div>
                </div>
              )
            ))}

            {streaming && messages[messages.length - 1]?.role !== "assistant" && replyTargetRef.current === "ai" && (
              <div className="flex gap-4 max-w-3xl">
                <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0 mt-1 border border-secondary/30">
                  <Bot size={16} className="text-secondary" />
                </div>
                <div className="flex items-center gap-1.5 px-4 py-3 bg-surface-container-low rounded-full border border-white/5">
                  <div className="w-1.5 h-1.5 bg-secondary/70 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-secondary/70 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-1.5 h-1.5 bg-secondary/70 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chat Input + Complete Button */}
        <div
          className={`shrink-0 p-4 border-t border-slate-200/80 dark:border-white/5 ${
            learnMode === "ai"
              ? "absolute bottom-0 left-0 w-full bg-gradient-to-t from-background via-background/95 to-transparent pt-10 border-t-0"
              : "bg-surface"
          }`}
        >
          <div className="relative flex items-end gap-3 max-w-4xl mx-auto">
            {!chapterCompleted ? (
              <button
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 bg-purple-50 hover:bg-purple-100 dark:bg-secondary/20 dark:hover:bg-secondary/30 text-purple-700 dark:text-secondary border border-purple-200 dark:border-secondary/30 rounded-2xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 shadow-xs"
                onClick={async () => {
                  if (completing) return;
                  setCompleting(true);
                  try {
                    await updateChapterStatus(chapterId, "completed");
                    setChapterCompleted(true);
                    window.dispatchEvent(new Event("chapter-status-changed"));
                    if (learnMode === "doc") {
                      setDocMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: "🎉 本章已标记完成。可继续阅读文档，或切换回 AI 教学。" },
                      ]);
                    } else {
                      setMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: "🎉 恭喜你完成了本章学习！下一章已自动解锁，可以从侧边栏继续学习。" },
                      ]);
                    }
                  } catch {
                    const errMsg = { role: "system" as const, content: "标记完成失败，请重试" };
                    if (learnMode === "doc") setDocMessages((prev) => [...prev, errMsg]);
                    else setMessages((prev) => [...prev, errMsg]);
                  } finally {
                    setCompleting(false);
                  }
                }}
                disabled={completing}
              >
                {completing ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                {completing ? "确认中..." : "完成本章"}
              </button>
            ) : (
              <div className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 bg-emerald-50 dark:bg-primary/10 text-emerald-700 dark:text-primary rounded-2xl text-xs font-bold border border-emerald-200 dark:border-primary/20 shadow-xs">
                <CheckCircle2 size={15} />
                已完成
              </div>
            )}
            <div className="flex-1 relative flex items-center rounded-2xl bg-white dark:bg-surface-container-low border border-slate-300 dark:border-white/10 shadow-xs focus-within:border-sky-500 dark:focus-within:border-primary focus-within:ring-2 focus-within:ring-sky-500/20 transition-all">
              <input
                className="w-full bg-transparent py-3.5 pl-4 pr-12 text-slate-900 dark:text-on-surface text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none font-body"
                placeholder={
                  learnMode === "doc"
                    ? "针对当前文档阶段提问…（可先选中文中片段）"
                    : "向 AI 导师提问或探讨当前知识点..."
                }
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                disabled={streaming}
              />
              <button
                className="absolute right-3.5 text-sky-600 dark:text-primary hover:scale-105 transition-transform disabled:opacity-40 p-1.5 rounded-xl hover:bg-sky-50 dark:hover:bg-primary/10"
                onClick={sendMessage}
                disabled={streaming || !input.trim()}
              >
                <Send size={17} />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Drag handle — 左右分栏可调宽 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左右分栏宽度"
        onPointerDown={onSplitPointerDown}
        onPointerMove={onSplitPointerMove}
        onPointerUp={onSplitPointerUp}
        onPointerCancel={onSplitPointerUp}
        className={`hidden lg:flex w-1.5 shrink-0 cursor-col-resize items-stretch justify-center group relative z-10 touch-none ${
          isDragging ? "bg-primary/40" : "bg-white/5 hover:bg-primary/30"
        }`}
      >
        <div className={`w-px h-full transition-colors ${isDragging ? "bg-primary" : "bg-white/10 group-hover:bg-primary/60"}`} />
      </div>

      {/* Right: Code Sandbox */}
      <section
        className="hidden lg:flex flex-col bg-white dark:bg-surface-container-low border-l border-slate-200 dark:border-white/5 overflow-hidden shrink-0 min-w-0"
        style={{ width: `${rightPct}%` }}
      >
        <div className="flex-1 flex flex-col min-h-0 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-[#1e1e1e]">
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-100/90 dark:bg-surface-container-high/50 border-b border-slate-200 dark:border-white/5">
            <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 flex-1 scrollbar-none">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-mono transition-all ${
                    tab.id === activeTabId
                      ? "bg-white dark:bg-primary/20 text-sky-700 dark:text-primary border border-slate-300 dark:border-primary/30 shadow-xs font-semibold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/5"
                  }`}
                  title={tab.label}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={exportChapterCode}
              disabled={exporting || tabs.length === 0}
              title="将本章全部代码打包为 ZIP"
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300 hover:border-sky-400 hover:text-sky-600 dark:hover:border-primary/30 dark:hover:text-primary bg-white dark:bg-transparent shadow-xs dark:shadow-none disabled:opacity-50"
            >
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              导出
            </button>
            <button
              className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white dark:bg-primary dark:text-on-primary text-xs font-bold font-headline rounded-lg transition-all active:scale-95 disabled:opacity-50 shadow-xs"
              onClick={runCode}
              disabled={running}
            >
              {running ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Running...
                </>
              ) : (
                <>
                  <Play size={13} className="fill-current" /> Run
                </>
              )}
            </button>
          </div>
          <div className="flex-1 relative w-full h-full overflow-hidden bg-white dark:bg-[#1e1e1e]">
            <div className="absolute inset-0">
              <Editor
                height="100%"
                language={activeLang}
                path={activeTab?.id || "scratch"}
                theme={theme === "light" ? "vs" : "vs-dark"}
                value={activeCode}
                onChange={(v) => updateActiveCode(v || "")}
                loading={
                  <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-[#1e1e1e]">
                    <Loader2 size={16} className="animate-spin mr-2 text-sky-600 dark:text-primary" />
                    正在加载代码编辑器…
                  </div>
                }
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: "JetBrains Mono, monospace",
                  scrollBeyondLastLine: false,
                  padding: { top: 16 },
                  lineNumbersMinChars: 3,
                  glyphMargin: false,
                  folding: false,
                  overviewRulerLanes: 0,
                  automaticLayout: true,
                }}
              />
            </div>
          </div>
        </div>

        {/* Console */}
        <div className="h-1/3 flex flex-col min-h-0 bg-slate-50 dark:bg-[#000000] border-t border-slate-200 dark:border-white/5">
          <div className="flex items-center px-4 py-2 bg-slate-100/90 dark:bg-surface-container-high/80 border-b border-slate-200 dark:border-white/5">
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest font-mono">Console Output</span>
          </div>
          <div className="flex-1 p-4 font-mono text-xs space-y-1 overflow-y-auto">
            {consoleOutput.map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith("▶")
                    ? "text-sky-600 dark:text-cyan-400 font-semibold"
                    : line.includes("Error") || line.includes("error")
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-slate-800 dark:text-slate-300"
                }
              >
                {line}
              </div>
            ))}
            <div className="w-2 h-4 bg-sky-500/60 dark:bg-primary/40 inline-block animate-pulse align-middle ml-1"></div>
          </div>
        </div>
      </section>

      {/* 知识点讲解弹窗 */}
      {(generatingAnim || animationData) && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 md:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="知识点讲解"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="关闭讲解"
            onClick={() => {
              setAnimationData(null);
              setGeneratingAnim(false);
            }}
          />
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-primary/25 bg-[#050a16] shadow-[0_0_60px_rgba(83,221,252,0.15)]">
            <button
              type="button"
              className="absolute top-3 right-3 z-10 p-2 rounded-lg text-slate-400 hover:text-on-surface hover:bg-white/10 transition-colors"
              onClick={() => {
                setAnimationData(null);
                setGeneratingAnim(false);
              }}
              title="关闭 (Esc)"
            >
              <X size={20} />
            </button>

            {generatingAnim && !animationData ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24 px-6">
                <Loader2 size={36} className="text-primary animate-spin" />
                <p className="text-sm text-on-surface-variant text-center font-headline">
                  正在运行代码并生成讲解短片…
                </p>
              </div>
            ) : (
              animationData && (
                <div className="p-2 pt-10 md:p-4 md:pt-12">
                  <AnimationPlayer
                    animationData={animationData}
                    onClose={() => setAnimationData(null)}
                  />
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

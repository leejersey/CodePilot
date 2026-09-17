"use client";

import { useEffect, useRef, useState, useCallback, type PointerEvent } from "react";
import { useParams, useRouter } from "next/navigation";
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
  getChapterPractice,
  recordLearningHeartbeat,
  updateChapterStatus,
  type ChapterPractice,
} from "@/lib/api";
import { defaultFilename, extractCodeBlocks, fingerprintCode } from "@/lib/codeBlocks";
import { chapterCompletionOutcome } from "@/lib/courseExperience";
import { buildWebPreviewDocument, executionModeForLanguage, inferLearningLanguage, looksLikeHtmlDocument, normalizeLanguage } from "@/lib/languageRuntime";
import { buildChapterArchive, safeArchiveName } from "@/lib/chapterExport";
import {
  appendChatImages,
  CHAT_IMAGE_ACCEPT,
  CHAT_IMAGE_MAX_COUNT,
  composeUserMessageText,
  type ChatImageAttachment,
} from "@/lib/chatImages";
import {
  DocumentLearningPanel,
  type DocAskContext,
} from "@/components/DocumentLearningPanel";
import { ArrowRight, BookOpen, Bot, CheckCircle2, Download, Dumbbell, ImagePlus, Loader2, MessageSquare, Play, Send, Trophy, User as UserIcon, X } from "lucide-react";

interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  images?: ChatImageAttachment[];
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
  if (t.includes("html") || t.includes("网页") || t.includes("web page")) {
    return { lang: "html", file: "index.html", comment: "", runtime: "Browser preview ready." };
  }
  if (t.includes("css")) {
    return { lang: "css", file: "styles.css", comment: "/*", runtime: "Browser preview ready." };
  }
  if (t.includes("typescript")) {
    return { lang: "typescript", file: "index.ts", comment: "//", runtime: "TypeScript sandbox ready." };
  }
  if (t.includes("javascript") || t.includes("react") || t.includes("vue") || t.includes("node") || t.includes("next")) {
    return { lang: "javascript", file: "index.js", comment: "//", runtime: "JavaScript sandbox ready." };
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
  if (t.includes("c#") || t.includes("csharp")) {
    return { lang: "csharp", file: "Program.cs", comment: "//", runtime: "C# sandbox ready." };
  }
  if (t.includes("kotlin")) return { lang: "kotlin", file: "Main.kt", comment: "//", runtime: "Kotlin sandbox ready." };
  if (t.includes("swift")) return { lang: "swift", file: "main.swift", comment: "//", runtime: "Swift sandbox ready." };
  if (t.includes("ruby")) return { lang: "ruby", file: "main.rb", comment: "#", runtime: "Ruby sandbox ready." };
  if (t.includes("php")) return { lang: "php", file: "main.php", comment: "//", runtime: "PHP sandbox ready." };
  if (t.includes("bash") || t.includes("shell")) return { lang: "bash", file: "main.sh", comment: "#", runtime: "Bash sandbox ready." };
  if (/(^|[\s/])c([\s/]|$)/.test(t)) return { lang: "c", file: "main.c", comment: "//", runtime: "C sandbox ready." };
  return { lang: "python", file: "main.py", comment: "#", runtime: "Python 3.12 environment ready." };
}

function scratchCodeFor(language: string, comment: string): string {
  if (language === "html") return "<!-- 在这里编写 HTML -->\n";
  if (language === "css") return "/* 在这里编写 CSS */\n";
  return `${comment} 在这里编写代码\n`;
}

const LANGUAGE_LABELS: Record<string, string> = {
  html: "HTML",
  css: "CSS",
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  cpp: "C++",
  csharp: "C#",
  php: "PHP",
  bash: "Bash",
};

const CONTEXT_SYNC_MARKER = "[CODEPILOT_CONTEXT_SYNC]";

export default function LearningWorkspacePage() {
  const params = useParams();
  const pathId = params.pathId as string;
  const chapterId = params.chapterId as string;
  const { init: authInit } = useAuth();
  const { theme } = useTheme();

  useEffect(() => { authInit(); }, [authInit]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<ChatImageAttachment[]>([]);
  const [imageError, setImageError] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
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
  const [webPreview, setWebPreview] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [chapterCompleted, setChapterCompleted] = useState(false);
  const [chapterTitle, setChapterTitle] = useState("本章内容");
  const [exporting, setExporting] = useState(false);
  const [practice, setPractice] = useState<ChapterPractice | null>(null);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceError, setPracticeError] = useState("");
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
  const imageInputRef = useRef<HTMLInputElement>(null);
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
    let disposed = false;
    let sessionId: string | null = null;
    let lastActivityAt = Date.now();
    let sending = false;

    const markActive = () => {
      lastActivityAt = Date.now();
    };
    const sendHeartbeat = async (active: boolean) => {
      if (sending || disposed) return;
      sending = true;
      try {
        const result = await recordLearningHeartbeat(chapterId, sessionId, active);
        if (!disposed) sessionId = result.session_id;
      } catch {
        // Learning analytics must never interrupt the learning workspace.
      } finally {
        sending = false;
      }
    };

    void sendHeartbeat(false);
    const timer = window.setInterval(() => {
      const active =
        document.visibilityState === "visible"
        && document.hasFocus()
        && Date.now() - lastActivityAt <= 120_000;
      void sendHeartbeat(active);
    }, 30_000);

    window.addEventListener("pointerdown", markActive);
    window.addEventListener("keydown", markActive);
    window.addEventListener("scroll", markActive, true);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", markActive);
      window.removeEventListener("keydown", markActive);
      window.removeEventListener("scroll", markActive, true);
    };
  }, [chapterId]);

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
  const activeLang = normalizeLanguage(activeTab?.language || editorInfo.lang);

  const loadPractice = useCallback(async () => {
    setPracticeLoading(true);
    setPracticeError("");
    try {
      setPractice(await getChapterPractice(chapterId));
    } catch (error) {
      setPracticeError(error instanceof Error ? error.message : "章节练习加载失败");
    } finally {
      setPracticeLoading(false);
    }
  }, [chapterId]);

  useEffect(() => {
    void loadPractice();
  }, [loadPractice]);

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
                originCode: scratchCodeFor(editorInfo.lang, editorInfo.comment),
                code: scratchCodeFor(editorInfo.lang, editorInfo.comment),
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
      const token = useAuth.getState().token;
      let authenticated = false;

      ws.onopen = () => {
        if (!token) {
          ws.close(4401, "Authentication required");
          reject(new Error("请先登录"));
          return;
        }
        ws.send(JSON.stringify({ type: "auth", token }));
      };
      ws.onerror = () => {
        flushStreamTokens();
        setStreaming(false);
        if (!authenticated) reject(new Error("WebSocket 连接失败"));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "authenticated") {
          authenticated = true;
          wsRef.current = ws;
          resolve(ws);
        } else if (data.type === "token") {
          appendStreamToken(data.content);
        } else if (data.type === "done") {
          flushStreamTokens();
          setStreaming(false);
        } else if (data.type === "error") {
          flushStreamTokens();
          setStreaming(false);
          appendSystemError(data.message || "未知错误");
          if (!authenticated) reject(new Error(data.message || "WebSocket 身份验证失败"));
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        flushStreamTokens();
        setStreaming(false);
        if (!authenticated) reject(new Error("WebSocket 身份验证失败"));
      };
    });
  }, [appendStreamToken, appendSystemError, flushStreamTokens]);

  // 3. 页面加载：复用章节对话（有历史则恢复，否则新建并引导）
  useEffect(() => {
    let cancelled = false;

    async function initWorkspace() {
      // 当前章节语言优先，路径主题只作为回退（混合语言路径不能统一按 Python）
      let pathTopic = "";
      try {
        const p = await fetchPath(pathId);
        if (cancelled) return;
        pathTopic = p.topic || "";
      } catch { /* ignore */ }

      if (cancelled) return;

      // 获取章节信息
      let chapterTitle = "本章内容";
      let chapterSummary = "";
      try {
        const ch = await fetchChapter(chapterId);
        if (cancelled) return;
        chapterTitle = ch.title || chapterTitle;
        chapterSummary = ch.summary || "";
        setChapterTitle(chapterTitle);
        setChapterCompleted(ch.status === "completed");
      } catch { /* ignore */ }

      const inferredLanguage = inferLearningLanguage(pathTopic, chapterTitle, chapterSummary);
      const info = detectLang(inferredLanguage);
      const langLabel = LANGUAGE_LABELS[info.lang]
        || info.lang.charAt(0).toUpperCase() + info.lang.slice(1);
      setEditorInfo(info);
      const scratchCode = scratchCodeFor(info.lang, info.comment);
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

      // 优先恢复该章节已有对话
      let conversationId: string | null = null;
      let hasHistory = false;
      let needsContextSync = false;
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
          let markerIndex = -1;
          restored.forEach((message, index) => {
            if (message.content.startsWith(CONTEXT_SYNC_MARKER)) markerIndex = index;
          });
          let visibleHistory = restored.slice(markerIndex + 1);
          const stalePythonContext = info.lang !== "python" && visibleHistory.some(
            (message) => /(?:当前|学习)?路径语言.{0,8}(?:是|为)\s*(?:\*\*)?Python/i.test(message.content)
          );
          if (stalePythonContext) {
            visibleHistory = [];
            needsContextSync = true;
          }
          if (visibleHistory.length > 0) {
            setMessages(visibleHistory);
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
            content: `${needsContextSync ? `${CONTEXT_SYNC_MARKER}\n请忽略此前错误的 Python 语言判断。` : ""}我刚进入「${chapterTitle}」章节的学习页面。当前章节的主要语言是 ${langLabel}。请你作为 AI 编程导师，本章用 ${langLabel} 讲解并给代码示例，不要擅自改成 Python。先简要介绍本章会学到什么，然后问问我有没有相关基础、想从哪个方面开始学起。用友好亲切的语气。`,
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
  const { runPython, ready: pyodideReady } = usePyodide();

  const runCode = async () => {
    if (running || !activeCode.trim()) return;
    setRunning(true);
    setConsoleOutput(prev => [...prev, "▶ Running..."]);

    try {
      const executionMode = executionModeForLanguage(activeLang);
      if (executionMode === "web" || looksLikeHtmlDocument(activeCode)) {
        const webTabs = tabs.filter((tab) => {
          const lang = normalizeLanguage(tab.language);
          return (
            ["html", "css", "javascript"].includes(lang)
            || looksLikeHtmlDocument(tab.code)
          );
        });
        // 当前标签排在最前，避免多份 HTML 时一直预览到「代码1」。
        const ordered = [
          ...webTabs.filter((tab) => tab.id === activeTabId),
          ...webTabs.filter((tab) => tab.id !== activeTabId),
        ];
        const previewDocument = buildWebPreviewDocument(
          ordered.map((tab) => ({ language: tab.language, code: tab.code }))
        );
        setWebPreview(previewDocument);
        setConsoleOutput(["▶ Browser preview refreshed.", "HTML / CSS / JavaScript 已在隔离预览中运行。"]);
      } else if (executionMode === "pyodide") {
        // Python → Pyodide 浏览器端真实执行
        setWebPreview(null);
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
        setWebPreview(null);
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

  // 4. 发送消息（支持截图）
  const addPendingImages = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const { next, error } = await appendChatImages(pendingImages, files);
    setPendingImages(next);
    setImageError(error || "");
  }, [pendingImages]);

  const removePendingImage = useCallback((id: string) => {
    setPendingImages((prev) => prev.filter((img) => img.id !== id));
    setImageError("");
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if ((!text && pendingImages.length === 0) || streaming) return;

    const imagesForSend = pendingImages;
    const displayText = composeUserMessageText(text, imagesForSend.length);
    const userMsg: ChatMessage = {
      role: "user",
      content: displayText,
      images: imagesForSend.length ? imagesForSend : undefined,
    };
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
    setPendingImages([]);
    setImageError("");
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
        content: text,
        ...(imagesForSend.length
          ? {
              images: imagesForSend.map((img) => ({
                dataUrl: img.dataUrl,
                mime: img.mime,
              })),
            }
          : {}),
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
                        {msg.images && msg.images.length > 0 && (
                          <span className="flex flex-wrap gap-1.5 mb-1.5 justify-end">
                            {msg.images.map((img) => (
                              <button
                                key={img.id}
                                type="button"
                                onClick={() => setLightboxUrl(img.dataUrl)}
                                className="block overflow-hidden rounded-md border border-white/20"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={img.dataUrl} alt={img.name} className="h-14 w-14 object-cover" />
                              </button>
                            ))}
                          </span>
                        )}
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
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2 justify-end">
                        {msg.images.map((img) => (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => setLightboxUrl(img.dataUrl)}
                            className="block overflow-hidden rounded-lg border border-sky-200/80 dark:border-primary/30 hover:opacity-90"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.dataUrl} alt={img.name} className="h-20 w-20 object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
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
            <button
              type="button"
              onClick={() => {
                setPracticeOpen(true);
                void loadPractice();
              }}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 bg-sky-50 hover:bg-sky-100 dark:bg-primary/10 dark:hover:bg-primary/20 text-sky-700 dark:text-primary border border-sky-200 dark:border-primary/25 rounded-2xl text-xs font-bold transition-all active:scale-95 shadow-xs"
            >
              <Dumbbell size={15} />
              章节练习
              {practice && practice.exercises.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-sky-200/70 dark:bg-primary/20 text-[10px]">
                  {practice.exercises.filter((item) => item.passed).length}/{practice.exercises.length}
                </span>
              )}
            </button>
            {!chapterCompleted ? (
              <button
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 bg-purple-50 hover:bg-purple-100 dark:bg-secondary/20 dark:hover:bg-secondary/30 text-purple-700 dark:text-secondary border border-purple-200 dark:border-secondary/30 rounded-2xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 shadow-xs"
                onClick={async () => {
                  if (completing) return;
                  setCompleting(true);
                  try {
                    const updated = await updateChapterStatus(chapterId, "completed");
                    const outcome = chapterCompletionOutcome(updated);
                    if (outcome.kind === "preview") {
                      const notice = { role: "system" as const, content: outcome.message };
                      if (learnMode === "doc") setDocMessages((prev) => [...prev, notice]);
                      else setMessages((prev) => [...prev, notice]);
                      return;
                    }
                    setChapterCompleted(true);
                    window.dispatchEvent(new Event("chapter-status-changed"));
                    await loadPractice();
                    setPracticeOpen(true);
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
            <div className="flex-1 flex flex-col gap-1.5">
              {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1">
                  {pendingImages.map((img) => (
                    <div key={img.id} className="relative group">
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(img.dataUrl)}
                        className="block overflow-hidden rounded-lg border border-slate-200 dark:border-white/15"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.dataUrl} alt={img.name} className="h-14 w-14 object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePendingImage(img.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center opacity-90 hover:opacity-100"
                        aria-label="移除图片"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {imageError && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 px-1">{imageError}</p>
              )}
              <div className="relative flex items-center rounded-2xl bg-white dark:bg-surface-container-low border border-slate-300 dark:border-white/10 shadow-xs focus-within:border-sky-500 dark:focus-within:border-primary focus-within:ring-2 focus-within:ring-sky-500/20 transition-all">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept={CHAT_IMAGE_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    void addPendingImages(files);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="ml-2 p-2 rounded-xl text-slate-500 hover:text-sky-600 dark:hover:text-primary hover:bg-sky-50 dark:hover:bg-primary/10 disabled:opacity-40"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={streaming || pendingImages.length >= CHAT_IMAGE_MAX_COUNT}
                  title={`上传截图（最多 ${CHAT_IMAGE_MAX_COUNT} 张）`}
                  aria-label="上传截图"
                >
                  <ImagePlus size={17} />
                </button>
                <input
                  className="w-full bg-transparent py-3.5 pl-1 pr-12 text-slate-900 dark:text-on-surface text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none font-body"
                  placeholder={
                    learnMode === "doc"
                      ? "针对当前文档阶段提问…（可粘贴/上传截图）"
                      : "向 AI 提问，或粘贴/上传报错截图..."
                  }
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData?.files || []).filter((f) =>
                      f.type.startsWith("image/")
                    );
                    if (files.length) {
                      e.preventDefault();
                      void addPendingImages(files);
                    }
                  }}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  disabled={streaming}
                />
                <button
                  className="absolute right-3.5 text-sky-600 dark:text-primary hover:scale-105 transition-transform disabled:opacity-40 p-1.5 rounded-xl hover:bg-sky-50 dark:hover:bg-primary/10"
                  onClick={sendMessage}
                  disabled={streaming || (!input.trim() && pendingImages.length === 0)}
                >
                  <Send size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {lightboxUrl && (
          <div
            className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-6"
            onClick={() => setLightboxUrl(null)}
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="预览"
              className="max-h-full max-w-full rounded-lg shadow-2xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={() => setLightboxUrl(null)}
              aria-label="关闭预览"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {practiceOpen && (
          <div className="absolute inset-0 z-30 bg-slate-950/45 dark:bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6">
            <div className="w-full max-w-2xl max-h-[88%] overflow-hidden rounded-3xl bg-white dark:bg-surface-container-high border border-slate-200 dark:border-white/10 shadow-2xl flex flex-col">
              <div className="shrink-0 flex items-start justify-between gap-4 p-5 border-b border-slate-200 dark:border-white/10">
                <div>
                  <div className="flex items-center gap-2">
                    <Trophy size={18} className="text-amber-500" />
                    <h2 className="font-headline font-bold text-lg text-slate-900 dark:text-white">
                      {chapterCompleted ? "本章学习完成" : "章节练习"}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    练习不会阻塞下一章，建议通过实战巩固本章知识。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPracticeOpen(false)}
                  className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                  aria-label="关闭章节练习"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
                {practiceLoading && !practice ? (
                  <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 size={17} className="animate-spin" /> 正在加载章节练习…
                  </div>
                ) : practiceError ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-rose-500 mb-3">{practiceError}</p>
                    <button type="button" onClick={() => void loadPractice()} className="text-xs text-primary font-bold">
                      重新加载
                    </button>
                  </div>
                ) : practice?.exercises.length ? (
                  practice.exercises.map((exercise, index) => (
                    <div
                      key={exercise.id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-surface-container-low"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10px] font-mono text-slate-400">练习 {index + 1}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                              exercise.passed
                                ? "text-emerald-600 border-emerald-300 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                                : exercise.attempted
                                  ? "text-amber-600 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-500/30 dark:bg-amber-500/10"
                                  : "text-slate-500 border-slate-300 dark:border-white/10 dark:bg-white/5"
                            }`}>
                              {exercise.passed
                                ? "已通过"
                                : exercise.attempted
                                  ? `已尝试${exercise.best_score !== null ? ` · ${exercise.best_score}分` : ""}`
                                  : "未尝试"}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{exercise.title}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{exercise.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => router.push(
                            `/exercise/${exercise.id}?returnTo=${encodeURIComponent(`/learn/${pathId}/${chapterId}`)}`
                          )}
                          className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl bg-sky-600 dark:bg-primary text-white dark:text-on-primary text-xs font-bold hover:brightness-110"
                        >
                          {exercise.passed ? "再次练习" : "开始练习"}
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-9 text-center">
                    <Dumbbell size={26} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm text-slate-500">本章暂未发布关联练习</p>
                  </div>
                )}
              </div>

              <div className="shrink-0 p-5 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500">
                  {chapterCompleted
                    ? practice?.next_chapter
                      ? `下一章：${practice.next_chapter.title}`
                      : "你已完成学习路径的最后一章"
                    : "完成本章后将自动解锁下一章"}
                </p>
                {chapterCompleted && practice?.next_chapter ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/learn/${pathId}/${practice.next_chapter!.id}`)}
                    className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white dark:text-on-primary text-xs font-bold"
                  >
                    进入下一章 <ArrowRight size={13} />
                  </button>
                ) : chapterCompleted ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/learn/${pathId}`)}
                    className="shrink-0 px-4 py-2.5 rounded-xl bg-primary text-white dark:text-on-primary text-xs font-bold"
                  >
                    返回学习路径
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
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
                  <Play size={13} className="fill-current" />
                  {executionModeForLanguage(activeLang) === "web"
                    || looksLikeHtmlDocument(activeCode)
                    ? "Preview"
                    : "Run"}
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
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest font-mono">
              {webPreview ? "Browser Preview" : "Console Output"}
            </span>
          </div>
          {webPreview ? (
            <iframe
              title="HTML 运行预览"
              sandbox="allow-scripts"
              srcDoc={webPreview}
              className="flex-1 min-h-0 w-full border-0 bg-white"
            />
          ) : (
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
          )}
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

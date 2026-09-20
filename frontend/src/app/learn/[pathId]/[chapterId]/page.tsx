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
  runModalCode as apiRunModalCode,
  generateSnippetExplain as apiGenerateSnippetExplain,
  getChapterPractice,
  recordLearningHeartbeat,
  updateChapterStatus,
  getChapterSkills,
  getSandboxSettings,
  startSkill,
  completeSkill,
  type ChapterPractice,
  type ChapterSkill,
  type SandboxSettings,
} from "@/lib/api";
import { defaultFilename, fingerprintCode } from "@/lib/codeBlocks";
import { chapterCompletionOutcome } from "@/lib/courseExperience";
import { buildWebPreviewDocument, executionModeForLanguage, inferLearningLanguage, looksLikeHtmlDocument, normalizeLanguage, sandpackTemplateFor } from "@/lib/languageRuntime";
import {
  looksLikeCloudFrameworkCode,
  pickCloudProvider,
  resolveTabExecution,
  type RuntimeTag,
} from "@/lib/tabRuntime";
import { buildSandpackFiles } from "@/lib/sandpackFiles";
import { FrameworkPreview } from "@/components/SandpackPreview";
import { ApiKeyConfigPanel } from "@/components/ApiKeyConfigPanel";
import { useDialog } from "@/components/DialogProvider";
import {
  DEFAULT_DOTENV_STUB,
  clearChapterEnv,
  getEnvValue,
  hasDeepseekApiKey,
  readChapterEnv,
  skillNeedsApiKey,
  upsertEnvValue,
  writeChapterEnv,
} from "@/lib/chapterEnv";
import { buildChapterArchive, safeArchiveName } from "@/lib/chapterExport";
import {
  appendChatImages,
  CHAT_IMAGE_ACCEPT,
  CHAT_IMAGE_MAX_COUNT,
  chatImageSrc,
  composeUserMessageText,
  type ChatImageAttachment,
} from "@/lib/chatImages";
import { buildLearnLoopSteps, nextLearnLoopHint } from "@/lib/learnLoop";
import {
  autoWindowStart,
  buildChatOutline,
  ensureMessageVisibleStart,
  hiddenTurnCount,
  loadEarlierStart,
} from "@/lib/chatWindow";
import {
  DocumentLearningPanel,
  type DocAskContext,
} from "@/components/DocumentLearningPanel";
import { ArrowRight, BookOpen, Bot, CheckCircle2, ChevronDown, Cloud, Download, Dumbbell, HelpCircle, ImagePlus, List, Loader2, MessageSquare, Play, Send, Trophy, User as UserIcon, X } from "lucide-react";
import Link from "next/link";

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
  /** Explicit runtime tag for tab routing; do not confuse with display `editorInfo.runtime`. */
  runtimeTag?: RuntimeTag;
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
  if (t.includes("react") || t.includes("jsx") || t.includes("tsx")) {
    return { lang: "react", file: "App.jsx", comment: "//", runtime: "React Sandpack preview ready." };
  }
  if (t.includes("vue")) {
    return { lang: "vue", file: "App.vue", comment: "", runtime: "Vue Sandpack preview ready." };
  }
  if (t.includes("typescript")) {
    return { lang: "typescript", file: "index.ts", comment: "//", runtime: "TypeScript sandbox ready." };
  }
  if (t.includes("javascript") || t.includes("node") || t.includes("next")) {
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
  if (language === "react") {
    return `export default function App() {
  return (
    <div>
      <h1>Hello React</h1>
      <p>在这里开始编写组件</p>
    </div>
  );
}
`;
  }
  if (language === "vue") {
    return `<template>
  <div>
    <h1>Hello Vue</h1>
    <p>在这里开始编写组件</p>
  </div>
</template>

<script setup>
</script>
`;
  }
  return `${comment} 在这里编写代码\n`;
}

const LANGUAGE_LABELS: Record<string, string> = {
  html: "HTML",
  css: "CSS",
  javascript: "JavaScript",
  typescript: "TypeScript",
  react: "React",
  vue: "Vue",
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
  const { confirm } = useDialog();

  useEffect(() => { authInit(); }, [authInit]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatWindowStart, setChatWindowStart] = useState(0);
  const [chatHistoryPinned, setChatHistoryPinned] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
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
  const [sandpackPreview, setSandpackPreview] = useState<{
    template: "react" | "vue";
    files: Record<string, string>;
    runKey: string;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [modalRunning, setModalRunning] = useState(false);
  const [sandboxSettings, setSandboxSettings] = useState<SandboxSettings | null>(null);
  const [chapterCompleted, setChapterCompleted] = useState(false);
  const [hasRunCode, setHasRunCode] = useState(false);
  const [chapterTitle, setChapterTitle] = useState("本章内容");
  const [exporting, setExporting] = useState(false);
  const [practice, setPractice] = useState<ChapterPractice | null>(null);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceError, setPracticeError] = useState("");
  const [completing, setCompleting] = useState(false);
  const [skills, setSkills] = useState<ChapterSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsExpanded, setSkillsExpanded] = useState(false);
  const [skillActionId, setSkillActionId] = useState<string | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const pendingModalRunRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [animationData, setAnimationData] = useState<any | null>(null);
  const [generatingAnim, setGeneratingAnim] = useState(false);
  const [learnMode, setLearnMode] = useState<"ai" | "doc">("ai");
  const [docAskContext, setDocAskContext] = useState<DocAskContext | null>(null);
  const [docMessages, setDocMessages] = useState<ChatMessage[]>([]);
  const [docChatOpen, setDocChatOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void getSandboxSettings()
      .then((settings) => {
        if (!cancelled) setSandboxSettings(settings);
      })
      .catch(() => {
        if (!cancelled) setSandboxSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeSkill = skills.find((s) => s.progress_status === "active")
    ?? skills.find((s) => s.progress_status !== "passed" && s.progress_status !== "locked")
    ?? null;
  const skillContextPayload = activeSkill
    ? {
        title: activeSkill.title,
        goal: activeSkill.goal,
        objectives: activeSkill.objectives,
      }
    : null;
  const activeSkillRef = useRef(skillContextPayload);
  activeSkillRef.current = skillContextPayload;
  const showApiKeyCard = skillNeedsApiKey(activeSkill);

  const syncDotenvTab = useCallback((content: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === "dotenv" || t.label.startsWith(".env"));
      if (idx < 0) {
        return [
          ...prev,
          {
            id: "dotenv",
            label: ".env（高级）",
            language: "ini",
            originCode: content,
            code: content,
            fingerprint: "dotenv",
          },
        ];
      }
      const copy = [...prev];
      copy[idx] = { ...copy[idx], code: content, label: ".env（高级）" };
      return copy;
    });
  }, []);

  const getDotenvText = useCallback(() => {
    const tab = tabs.find((t) => t.id === "dotenv" || t.label.startsWith(".env"));
    if (tab?.code) return tab.code;
    return readChapterEnv(pathId, chapterId) || DEFAULT_DOTENV_STUB;
  }, [tabs, pathId, chapterId]);

  const saveApiKey = useCallback((runAfter = false) => {
    const key = apiKeyDraft.trim();
    if (!key) return;
    setApiKeySaving(true);
    try {
      const base = (() => {
        const tab = tabs.find((t) => t.id === "dotenv" || t.label.startsWith(".env"));
        if (tab?.code) return tab.code;
        return readChapterEnv(pathId, chapterId) || DEFAULT_DOTENV_STUB;
      })();
      const next = upsertEnvValue(base, "DEEPSEEK_API_KEY", key);
      writeChapterEnv(pathId, chapterId, next);
      syncDotenvTab(next);
      setApiKeyModalOpen(false);
      setConsoleOutput((prev) => [...prev, "已保存 API Key 到本课本地配置。"]);
      if (runAfter) {
        pendingModalRunRef.current = true;
        queueMicrotask(() => {
          if (pendingModalRunRef.current) {
            pendingModalRunRef.current = false;
            void runModalWithDotenv(next);
          }
        });
      }
    } finally {
      setApiKeySaving(false);
    }
  }, [apiKeyDraft, tabs, pathId, chapterId, syncDotenvTab]);

  const runModalWithDotenv = async (dotenvText: string) => {
    if (modalRunning || running) return;
    setModalRunning(true);
    setWebPreview(null);
    setSandpackPreview(null);
    setConsoleOutput((prev) => [...prev, "▶ Modal cloud run..."]);
    try {
      const codeTab =
        activeTabId !== "dotenv" && activeTab && !activeTab.label.startsWith(".env")
          ? activeTab
          : tabs.find((t) => t.id !== "dotenv" && !t.label.startsWith(".env") && normalizeLanguage(t.language) === "python")
            || tabs.find((t) => t.id !== "dotenv" && !t.label.startsWith(".env"))
            || activeTab;
      const codeToRun = (codeTab?.code || activeCode).trim();
      if (!codeToRun) {
        setConsoleOutput((prev) => [...prev, "Error: 没有可运行的代码"]);
        return;
      }
      const data = await apiRunModalCode(codeToRun, "python", dotenvText, pathId, chapterId);
      setConsoleOutput((prev) => [
        ...prev,
        data.output,
        `${data.status} · source=${data.judge_source}${data.trusted ? "" : " · untrusted"}`,
      ]);
      setHasRunCode(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Modal 执行失败";
      setConsoleOutput((prev) => [...prev, `Error: ${message}`]);
    } finally {
      setModalRunning(false);
    }
  };

  const runModal = async () => {
    if (modalRunning || running) return;
    const dotenvText = getDotenvText();
    if (!hasDeepseekApiKey(dotenvText)) {
      setApiKeyDraft(getEnvValue(dotenvText, "DEEPSEEK_API_KEY"));
      setApiKeyModalOpen(true);
      setConsoleOutput((prev) => [
        ...prev,
        "提示: 云端运行需要先配置 DeepSeek API Key。",
      ]);
      return;
    }
    await runModalWithDotenv(dotenvText);
  };

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
    if (chatHistoryPinned) return;
    setChatWindowStart(autoWindowStart(messages));
  }, [messages, chatHistoryPinned]);

  const visibleMessages = messages.slice(chatWindowStart);
  const earlierTurnCount = hiddenTurnCount(messages, chatWindowStart);
  const chatOutline = buildChatOutline(messages);

  const loadEarlierMessages = useCallback(() => {
    const scroller = chatScrollRef.current;
    const prevHeight = scroller?.scrollHeight ?? 0;
    const prevTop = scroller?.scrollTop ?? 0;
    setChatHistoryPinned(true);
    setChatWindowStart((start) => loadEarlierStart(messages, start));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = chatScrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight - prevHeight + prevTop;
        followChatRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      });
    });
  }, [messages]);

  const jumpToMessage = useCallback((messageIndex: number) => {
    setChatHistoryPinned(true);
    setChatWindowStart((start) => ensureMessageVisibleStart(messages, start, messageIndex));
    setOutlineOpen(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(`chat-msg-${messageIndex}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        followChatRef.current = false;
      });
    });
  }, [messages]);

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
  const monacoLanguage =
    activeLang === "react" ? "javascript"
    : activeLang === "vue" ? "html"
    : activeLang;
  const tabExec = resolveTabExecution({
    language: activeLang,
    code: activeCode,
    tag: activeTab?.runtimeTag ?? null,
  });
  const cloudProvider =
    tabExec.mode === "cloud"
      ? pickCloudProvider({
          defaultProvider: sandboxSettings?.default_provider ?? "modal",
          modalConfigured: !!sandboxSettings?.has_modal_credentials,
          daytonaConfigured: !!sandboxSettings?.has_daytona_credentials,
        })
      : null;
  const showLocalRun = tabExec.mode !== "cloud";
  const showCloudRun = tabExec.mode === "cloud" && !!cloudProvider;
  const showSandboxCta = tabExec.mode === "cloud" && !cloudProvider;
  const activeExecMode = executionModeForLanguage(activeLang, activeCode);
  const previewMode =
    activeExecMode === "web"
    || activeExecMode === "sandpack"
    || looksLikeHtmlDocument(activeCode);

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

  const openInEditor = useCallback((code: string, language: string) => {
    const lang = normalizeLanguage(language);
    const fp = fingerprintCode(lang, code);
    const tabId = `lesson-${fp}`;
    const runtimeTag: RuntimeTag | undefined = looksLikeCloudFrameworkCode(code)
      ? "cloud"
      : undefined;
    setTabs((prev) => {
      const existing = prev.find((t) => t.fingerprint === fp || t.id === tabId);
      if (existing) return prev;
      const lessonCount = prev.filter((t) => t.id.startsWith("lesson-")).length;
      return [
        ...prev,
        {
          id: tabId,
          label: defaultFilename(lang, lessonCount),
          language: lang,
          originCode: code,
          code,
          fingerprint: fp,
          ...(runtimeTag ? { runtimeTag } : {}),
        },
      ];
    });
    setActiveTabId(tabId);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    if (tabId === "scratch") return;
    setTabs((prev) => {
      const index = prev.findIndex((t) => t.id === tabId);
      if (index < 0) return prev;
      const next = prev.filter((t) => t.id !== tabId);
      setActiveTabId((curr) => {
        if (curr !== tabId) return curr;
        return (next[Math.max(0, index - 1)] || next[0])?.id || "scratch";
      });
      return next;
    });
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
      let chapterSortOrder = 0;
      try {
        const ch = await fetchChapter(chapterId);
        if (cancelled) return;
        chapterTitle = ch.title || chapterTitle;
        chapterSummary = ch.summary || "";
        chapterSortOrder = typeof ch.sort_order === "number" ? ch.sort_order : 0;
        setChapterTitle(chapterTitle);
        setChapterCompleted(ch.status === "completed");
      } catch { /* ignore */ }

      let loadedSkills: ChapterSkill[] = [];
      try {
        setSkillsLoading(true);
        const skillRes = await getChapterSkills(chapterId);
        if (!cancelled) {
          loadedSkills = skillRes.skills || [];
          setSkills(loadedSkills);
        }
      } catch {
        if (!cancelled) setSkills([]);
      } finally {
        if (!cancelled) setSkillsLoading(false);
      }

      const inferredLanguage = inferLearningLanguage(pathTopic, chapterTitle, chapterSummary);
      const info = detectLang(inferredLanguage);
      const langLabel = LANGUAGE_LABELS[info.lang]
        || info.lang.charAt(0).toUpperCase() + info.lang.slice(1);
      setEditorInfo(info);
      const scratchCode = scratchCodeFor(info.lang, info.comment);
      const initialTabs: EditorTab[] = [
        {
          id: "scratch",
          label: info.file.replace("main", "草稿").replace("Main", "草稿").replace("index", "草稿"),
          language: info.lang,
          originCode: scratchCode,
          code: scratchCode,
          fingerprint: "scratch",
        },
      ];
      if (info.lang === "python") {
        const stored = readChapterEnv(pathId, chapterId);
        const envStub = stored.trim() ? stored : DEFAULT_DOTENV_STUB;
        initialTabs.push({
          id: "dotenv",
          label: ".env（高级）",
          language: "ini",
          originCode: envStub,
          code: envStub,
          fingerprint: "dotenv",
        });
        setApiKeyDraft(getEnvValue(envStub, "DEEPSEEK_API_KEY"));
      }
      setTabs(initialTabs);
      setActiveTabId("scratch");
      setConsoleOutput([info.runtime]);
      setHasRunCode(false);
      setWebPreview(null);
      setSandpackPreview(null);

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
            .map((m) => {
              const images = (m.metadata?.images || [])
                .filter((img) => Boolean(img.url))
                .map((img, index) => ({
                  id: `${m.id}-img-${index}`,
                  mime: img.mime || "image/jpeg",
                  dataUrl: img.url as string,
                  url: img.url,
                  name: img.name || `image-${index + 1}`,
                }));
              return {
                id: m.id,
                role: m.role as ChatMessage["role"],
                content: m.content,
                images: images.length ? images : undefined,
              };
            });
          let markerIndex = -1;
          restored.forEach((message, index) => {
            if (message.content.startsWith(CONTEXT_SYNC_MARKER)) markerIndex = index;
          });
          let visibleHistory = restored.slice(markerIndex + 1);
          const stalePythonContext = info.lang !== "python" && visibleHistory.some(
            (message) => /(?:当前|学习)?路径语言.{0,8}(?:是|为)\s*(?:\*\*)?Python/i.test(message.content)
          );
          const staleChapterNumber = chapterSortOrder > 0 && visibleHistory.some((message) => {
            if (message.role !== "assistant") return false;
            const match = message.content.match(/第\s*(\d+)\s*章/);
            return Boolean(match && Number(match[1]) !== chapterSortOrder);
          });
          if (stalePythonContext || staleChapterNumber) {
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
          const currentSkill = loadedSkills.find((s) => s.progress_status === "active")
            || loadedSkills.find((s) => s.progress_status !== "passed" && s.progress_status !== "locked")
            || null;
          const skillHint = currentSkill
            ? `当前技能是「${currentSkill.title}」${currentSkill.goal ? `：${currentSkill.goal}` : ""}。请围绕该技能目标引导。`
            : "";
          const chapterLabel = chapterSortOrder > 0
            ? `本课第 ${chapterSortOrder} 章「${chapterTitle}」`
            : `「${chapterTitle}」章节`;
          const chapterNumberRule = chapterSortOrder > 0
            ? `称呼本章时必须说「第 ${chapterSortOrder} 章」，不要使用知识库原文里的其他章号。`
            : "";
          ws.send(JSON.stringify({
            type: "message",
            content: `${needsContextSync ? `${CONTEXT_SYNC_MARKER}\n请忽略此前错误的章节编号或语言判断。` : ""}我刚进入${chapterLabel}的学习页面。当前章节的主要语言是 ${langLabel}。${chapterNumberRule}${skillHint}请你作为 AI 编程导师，本章用 ${langLabel} 讲解并给代码示例，不要擅自改成 Python。先简要介绍本章会学到什么，然后问问我有没有相关基础、想从哪个方面开始学起。用友好亲切的语气。`,
            ...(currentSkill
              ? {
                  skill_context: {
                    title: currentSkill.title,
                    goal: currentSkill.goal,
                    objectives: currentSkill.objectives,
                  },
                }
              : {}),
          }));
        }
      } catch {
        setStreaming(false);
      }
    }

    setMessages([]);
    setDocMessages([]);
    setDocChatOpen(false);
    setChatWindowStart(0);
    setChatHistoryPinned(false);
    setOutlineOpen(false);
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
      const template = sandpackTemplateFor(activeLang, activeCode);
      const executionMode = executionModeForLanguage(activeLang, activeCode);
      if (executionMode === "sandpack" && template) {
        setWebPreview(null);
        const ordered = [
          ...tabs.filter((tab) => tab.id === activeTabId),
          ...tabs.filter((tab) => tab.id !== activeTabId),
        ];
        const files = buildSandpackFiles(
          ordered.map((tab) => ({
            label: tab.label,
            language: tab.language,
            code: tab.code,
          })),
          template
        );
        setSandpackPreview({
          template,
          files,
          runKey: `${Date.now()}`,
        });
        setConsoleOutput([`▶ Sandpack ${template} preview refreshed.`]);
        setHasRunCode(true);
      } else if (executionMode === "web" || looksLikeHtmlDocument(activeCode)) {
        const webTabs = tabs.filter((tab) => {
          const lang = normalizeLanguage(tab.language);
          return (
            ["html", "css", "javascript", "typescript", "react"].includes(lang)
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
        setSandpackPreview(null);
        setWebPreview(previewDocument);
        setConsoleOutput(["▶ Browser preview refreshed.", "HTML / CSS / JavaScript 已在隔离预览中运行。"]);
        setHasRunCode(true);
      } else if (executionMode === "pyodide") {
        // Python → Pyodide 浏览器端真实执行
        setWebPreview(null);
        setSandpackPreview(null);
        if (!pyodideReady) {
          setConsoleOutput(prev => [...prev, "⚙️ 正在加载 Python 环境 (Pyodide)..."]);
        }
        const result = await runPython(activeCode);
        setConsoleOutput(prev => [
          ...prev,
          result.output,
          result.error ? "Program exited with error." : "Program finished.",
        ]);
        setHasRunCode(true);
      } else {
        // 非 Python → Judge0 隔离沙箱真实执行
        setWebPreview(null);
        setSandpackPreview(null);
        const data = await apiRunCode(activeCode, activeLang);
        setConsoleOutput(prev => [
          ...prev,
          data.output,
          `${data.status}${data.time ? ` · ${data.time}s` : ""}`,
          data.trusted ? "Remote Judge0 verified." : "LLM fallback: untrusted temporary simulation.",
        ]);
        setHasRunCode(true);
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
      setDocChatOpen(true);
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
        ...(activeSkillRef.current ? { skill_context: activeSkillRef.current } : {}),
      })
    );
  };

  const hasChatted =
    messages.some((m) => m.role === "user")
    || docMessages.some((m) => m.role === "user");
  const practiceTotal = practice?.exercises.length ?? 0;
  const practicePassed = practice?.exercises.filter((item) => item.passed).length ?? 0;
  const learnLoopSteps = buildLearnLoopSteps({
    hasChatted,
    hasRunCode,
    practiceTotal,
    practicePassed,
    chapterCompleted,
  });
  const learnLoopHint = nextLearnLoopHint(learnLoopSteps);

  const refreshSkills = useCallback(async () => {
    try {
      const res = await getChapterSkills(chapterId);
      setSkills(res.skills || []);
    } catch {
      /* ignore */
    }
  }, [chapterId]);

  const handleStartSkill = async (skillId: string) => {
    if (skillActionId) return;
    setSkillActionId(skillId);
    try {
      await startSkill(skillId);
      await refreshSkills();
      setSkillsExpanded(false);
    } catch (error) {
      const notice = {
        role: "system" as const,
        content: error instanceof Error ? error.message : "无法开始该技能",
      };
      if (learnMode === "doc") setDocMessages((prev) => [...prev, notice]);
      else setMessages((prev) => [...prev, notice]);
    } finally {
      setSkillActionId(null);
    }
  };

  const handleCompleteSkill = async (skillId: string) => {
    if (skillActionId) return;
    setSkillActionId(skillId);
    try {
      await completeSkill(skillId);
      await refreshSkills();
      setSkillsExpanded(false);
    } catch (error) {
      const notice = {
        role: "system" as const,
        content: error instanceof Error ? error.message : "无法完成该技能",
      };
      if (learnMode === "doc") setDocMessages((prev) => [...prev, notice]);
      else setMessages((prev) => [...prev, notice]);
    } finally {
      setSkillActionId(null);
    }
  };

  const handleCompleteChapter = async () => {
    if (completing || chapterCompleted) return;
    const ok = await confirm({
      title: "完成本章？",
      message: "确认后将标记本章为已完成，并自动解锁下一章。此操作适合在你已掌握本章内容后进行。",
      confirmText: "确认完成",
      cancelText: "再想想",
      tone: "default",
    });
    if (!ok) return;
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
  };

  return (
    <div
      ref={splitRef}
      className={`flex h-full w-full min-w-0 ${isDragging ? "select-none cursor-col-resize" : ""}`}
    >
      {/* Left: AI Chat / Document mode — 互斥，不叠在一起 */}
      <main className="flex-1 min-w-0 flex flex-col bg-surface overflow-hidden relative">
        {/* Mode switch (三阶色阶：沉稳微冷浅灰导航栏) */}
        <div className="shrink-0 flex items-center gap-2 px-3.5 py-2 border-b border-slate-200/90 dark:border-white/5 bg-slate-50 dark:bg-surface-container-low/40 shadow-2xs">
          <button
            type="button"
            onClick={() => {
              setLearnMode("ai");
              setDocAskContext(null);
            }}
            title="与导师对话学习；需要看原文时切换到「文档学习」。两套记录互不混写。"
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all active:scale-95 shadow-2xs ${
              learnMode === "ai"
                ? "bg-white text-sky-700 border-sky-300 shadow-xs dark:bg-primary/20 dark:text-primary dark:border-primary/40"
                : "text-slate-600 dark:text-slate-400 bg-white/70 dark:bg-white/5 border-slate-200/90 dark:border-white/10 hover:bg-white dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <MessageSquare size={14} />
            AI 教学
          </button>
          <button
            type="button"
            onClick={() => {
              setLearnMode("doc");
              if (docMessages.length > 0) setDocChatOpen(true);
            }}
            title="阅读讲义分阶段内容；提问只出现在文档浮层，不会写入 AI 教学对话。"
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all active:scale-95 shadow-2xs ${
              learnMode === "doc"
                ? "bg-white text-violet-700 border-violet-300 shadow-xs dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/40"
                : "text-slate-600 dark:text-slate-400 bg-white/70 dark:bg-white/5 border-slate-200/90 dark:border-white/10 hover:bg-white dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <BookOpen size={14} />
            文档学习
          </button>
          {learnMode === "doc" && docAskContext && (
            <span className="hidden sm:inline min-w-0 truncate text-[10px] text-slate-500">
              {docAskContext.source_label} · {docAskContext.stage_title.replace(/\*+/g, "")}
              {docAskContext.selection ? " · 含选中" : ""}
            </span>
          )}
          <Link
            href="/help"
            className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-primary"
            title="常见问题"
          >
            <HelpCircle size={13} />
            答疑
          </Link>
        </div>

        {learnMode === "doc" ? (
          <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
            <DocumentLearningPanel
              chapterId={chapterId}
              onAskContextChange={setDocAskContext}
              onOpenInEditor={openInEditor}
              onExplainSnippet={explainSnippet}
              explaining={generatingAnim}
              activeFingerprint={activeTab?.fingerprint}
              reserveBottom={docChatOpen}
            />

            {!docChatOpen && docMessages.length > 0 && (
              <button
                type="button"
                onClick={() => setDocChatOpen(true)}
                className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-violet-500/20 text-violet-200 border border-violet-500/30 shadow-lg hover:bg-violet-500/30"
              >
                <MessageSquare size={13} />
                提问记录 {docMessages.filter((m) => m.role === "user").length}
              </button>
            )}

            {docChatOpen && (
              <div className="absolute inset-x-3 bottom-2 z-10 max-h-[46%] min-h-[140px] flex flex-col rounded-xl border border-violet-500/25 bg-[#0b1220]/95 backdrop-blur-md shadow-2xl">
                <div className="shrink-0 px-3 py-1.5 flex items-center justify-between border-b border-white/5">
                  <span className="text-[11px] font-bold text-violet-300/90">针对文档提问</span>
                  <div className="flex items-center gap-2 min-w-0">
                    {docAskContext && (
                      <span className="text-[10px] text-slate-500 truncate max-w-[14rem]">
                        {docAskContext.source_label} · {docAskContext.stage_title.replace(/\*+/g, "")}
                        {docAskContext.selection ? " · 含选中" : ""}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setDocChatOpen(false)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10"
                      aria-label="收起提问记录"
                      title="收起，把阅读区还给文档"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
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
                                  onClick={() => setLightboxUrl(chatImageSrc(img))}
                                  className="block overflow-hidden rounded-md border border-white/20"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={chatImageSrc(img)} alt={img.name} className="h-14 w-14 object-cover" />
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
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col relative">
            {chatOutline.length > 0 && (
              <div className="absolute top-3 right-4 z-20 flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => setOutlineOpen((open) => !open)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border shadow-xs transition-colors ${
                    outlineOpen
                      ? "bg-sky-600 text-white border-sky-600 dark:bg-primary dark:text-on-primary dark:border-primary"
                      : "bg-white/95 dark:bg-surface-container-high/95 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-sky-400 dark:hover:border-primary/40"
                  }`}
                  title="对话大纲"
                >
                  <List size={13} />
                  大纲
                </button>
                {outlineOpen && (
                  <div className="w-64 max-h-[50vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-surface-container-high shadow-xl p-2">
                    <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      按提问跳转
                    </p>
                    {chatOutline.map((item, idx) => (
                      <button
                        key={`${item.messageIndex}-${idx}`}
                        type="button"
                        onClick={() => jumpToMessage(item.messageIndex)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs leading-snug transition-colors ${
                          item.messageIndex >= chatWindowStart
                            ? "text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-primary/10"
                            : "text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5"
                        }`}
                        title={item.label}
                      >
                        <span className="text-[10px] text-slate-400 mr-1.5">{idx + 1}.</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div
              ref={chatScrollRef}
              onScroll={(event) => {
                const el = event.currentTarget;
                followChatRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6"
            >
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full opacity-60">
                  <div className="flex flex-col items-center text-center">
                    <Loader2 size={36} className="text-secondary animate-spin mb-3" />
                    <p className="text-on-surface-variant text-sm font-headline">AI 导师正在准备引导与代码案例...</p>
                  </div>
                </div>
              )}

              {earlierTurnCount > 0 && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={loadEarlierMessages}
                    className="px-4 py-2 rounded-full text-xs font-semibold text-sky-700 dark:text-primary bg-sky-50 dark:bg-primary/10 border border-sky-200 dark:border-primary/25 hover:bg-sky-100 dark:hover:bg-primary/15 transition-colors"
                  >
                    加载更早的对话（还有 {earlierTurnCount} 轮）
                  </button>
                </div>
              )}

              {visibleMessages.map((msg, offset) => {
                const i = chatWindowStart + offset;
                return msg.role === "user" ? (
                  <div key={i} id={`chat-msg-${i}`} className="flex gap-4 max-w-3xl ml-auto flex-row-reverse scroll-mt-24">
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
                              onClick={() => setLightboxUrl(chatImageSrc(img))}
                              className="block overflow-hidden rounded-lg border border-sky-200/80 dark:border-primary/30 hover:opacity-90"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={chatImageSrc(img)} alt={img.name} className="h-20 w-20 object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="leading-relaxed whitespace-pre-wrap text-[14.5px]">{msg.content}</p>
                    </div>
                  </div>
                ) : msg.role === "system" ? (
                  <div key={i} id={`chat-msg-${i}`} className="text-center text-red-500 dark:text-red-400 text-sm py-2 scroll-mt-24">
                    {msg.content}
                  </div>
                ) : (
                  <div key={i} id={`chat-msg-${i}`} className="flex gap-4 max-w-3xl scroll-mt-24">
                    <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 dark:bg-secondary/20 dark:text-secondary flex items-center justify-center flex-shrink-0 mt-1 border border-violet-200 dark:border-secondary/30 shadow-xs">
                      <Bot size={16} />
                    </div>
                    <div className="p-5 rounded-2xl rounded-tl-none bg-white dark:bg-surface-container-high/40 border border-slate-200/90 dark:border-white/5 border-l-4 border-l-violet-500/80 dark:border-l-secondary shadow-soft dark:shadow-xl text-slate-800 dark:text-on-surface-variant">
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
                );
              })}

              {streaming && messages[messages.length - 1]?.role !== "assistant" && replyTargetRef.current === "ai" && (
                <div className="flex gap-4 max-w-3xl">
                  <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 dark:bg-secondary/20 dark:text-secondary flex items-center justify-center flex-shrink-0 mt-1 border border-violet-200 dark:border-secondary/30 shadow-xs">
                    <Bot size={16} className="text-violet-600 dark:text-secondary" />
                  </div>
                  <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 dark:bg-surface-container-low rounded-full border border-slate-200/90 dark:border-white/5 shadow-2xs">
                    <div className="w-1.5 h-1.5 bg-violet-500/80 dark:bg-secondary/70 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-violet-500/80 dark:bg-secondary/70 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                    <div className="w-1.5 h-1.5 bg-violet-500/80 dark:bg-secondary/70 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chat Input + Complete Button — flex 流内，不叠在对话上 */}
        <div className={`shrink-0 border-t border-slate-200/80 dark:border-white/5 bg-surface ${
          learnMode === "doc" ? "px-3 py-2" : "p-4"
        }`}>
          <div className={`max-w-4xl mx-auto rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/80 dark:bg-surface-container-low/70 px-3 py-2 ${
            learnMode === "doc" ? "mb-2" : "mb-3"
          }`}>
            {skills.length === 0 && !skillsLoading ? (
              <p className="text-[10px] text-slate-500">暂无技能拆分，完成本章即可。</p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSkillsExpanded((v) => !v)}
                  className="w-full flex items-center gap-2 text-left"
                  aria-expanded={skillsExpanded}
                >
                  <p className="min-w-0 flex-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate">
                    本章技能{" "}
                    <span className="font-normal text-slate-500">
                      {skills.filter((s) => s.progress_status === "passed").length}/{skills.length || 0}
                      {activeSkill ? ` · 当前：${activeSkill.title}` : ""}
                    </span>
                  </p>
                  {skillsLoading ? (
                    <Loader2 size={12} className="animate-spin text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown
                      size={14}
                      className={`shrink-0 text-slate-400 transition-transform ${skillsExpanded ? "rotate-180" : ""}`}
                    />
                  )}
                </button>
                {skillsExpanded ? (
                  <ul className="mt-2 space-y-1.5 max-h-28 overflow-y-auto pr-1">
                    {skills.map((skill) => {
                      const isActive = skill.progress_status === "active";
                      const isPassed = skill.progress_status === "passed";
                      const isLocked = skill.progress_status === "locked";
                      return (
                        <li
                          key={skill.id}
                          className={`flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 border ${
                            isActive
                              ? "border-sky-300/80 dark:border-primary/40 bg-sky-50/80 dark:bg-primary/10"
                              : isPassed
                                ? "border-emerald-300/50 dark:border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-500/5"
                                : "border-transparent bg-transparent opacity-70"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate">
                              {skill.sort_order}. {skill.title}
                              {isActive ? " · 进行中" : isPassed ? " · 已过关" : isLocked ? " · 未解锁" : ""}
                            </p>
                            {skill.goal && (
                              <p className="text-[10px] text-slate-500 leading-snug line-clamp-1">{skill.goal}</p>
                            )}
                          </div>
                          <div className="flex-shrink-0 flex items-center gap-1">
                            {isActive ? (
                              <button
                                type="button"
                                disabled={skillActionId === skill.id}
                                onClick={() => void handleCompleteSkill(skill.id)}
                                className="text-[10px] px-2 py-0.5 rounded-md border border-emerald-300/70 text-emerald-700 dark:text-emerald-400 dark:border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 disabled:opacity-50"
                              >
                                {skillActionId === skill.id ? "…" : "过关"}
                              </button>
                            ) : isPassed ? (
                              <CheckCircle2 size={14} className="text-emerald-500" />
                            ) : (
                              <button
                                type="button"
                                disabled={skillActionId === skill.id}
                                onClick={() => void handleStartSkill(skill.id)}
                                className="text-[10px] px-2 py-0.5 rounded-md border border-slate-200 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50"
                              >
                                开始
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </>
            )}
            {showApiKeyCard ? (
              <button
                type="button"
                onClick={() => {
                  setApiKeyDraft(getEnvValue(getDotenvText(), "DEEPSEEK_API_KEY"));
                  setApiKeyModalOpen(true);
                }}
                className="mt-1.5 w-full text-left rounded-md px-1 py-1 text-[10px] text-amber-800 dark:text-amber-200/90 hover:bg-amber-50/80 dark:hover:bg-amber-500/10"
              >
                <span className="font-semibold">配置 API Key</span>
                <span className="opacity-75">
                  {hasDeepseekApiKey(getDotenvText()) ? " · 已保存" : " · 云端试跑前需填写"}
                </span>
              </button>
            ) : null}
          </div>
          {learnMode !== "doc" && (
          <div className="max-w-4xl mx-auto mb-3 rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/80 dark:bg-surface-container-low/70 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {learnLoopSteps.map((step) => (
                <span
                  key={step.id}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                    step.done
                      ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                      : "border-slate-200 dark:border-white/10 text-slate-500"
                  }`}
                >
                  <CheckCircle2 size={11} className={step.done ? "opacity-100" : "opacity-30"} />
                  {step.label}
                  {step.detail ? ` ${step.detail}` : ""}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-slate-500 leading-relaxed">{learnLoopHint}</p>
          </div>
          )}
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
                onClick={() => void handleCompleteChapter()}
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
                        onClick={() => setLightboxUrl(chatImageSrc(img))}
                        className="block overflow-hidden rounded-lg border border-slate-200 dark:border-white/15"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={chatImageSrc(img)} alt={img.name} className="h-14 w-14 object-cover" />
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
              <div className="relative flex items-center rounded-2xl bg-white dark:bg-surface-container-low border border-slate-300/90 dark:border-white/10 shadow-inner-soft focus-within-ring transition-all">
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

        {apiKeyModalOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="配置 API Key"
        >
          <button
            type="button"
            className="absolute inset-0"
            aria-label="关闭"
            onClick={() => setApiKeyModalOpen(false)}
          />
          <div className="relative z-10">
            <ApiKeyConfigPanel
              variant="modal"
              title="云端运行需要 API Key"
              deepseekKey={apiKeyDraft}
              onDeepseekKeyChange={setApiKeyDraft}
              hasSavedKey={hasDeepseekApiKey(getDotenvText())}
              saving={apiKeySaving}
              onSave={() => saveApiKey(false)}
              onSaveAndRun={() => saveApiKey(true)}
              onClear={() => {
                clearChapterEnv(pathId, chapterId);
                const cleared = upsertEnvValue(DEFAULT_DOTENV_STUB, "DEEPSEEK_API_KEY", "");
                writeChapterEnv(pathId, chapterId, cleared);
                syncDotenvTab(cleared);
                setApiKeyDraft("");
              }}
              onOpenAdvanced={() => {
                setApiKeyModalOpen(false);
                const tab = tabs.find((t) => t.id === "dotenv" || t.label.startsWith(".env"));
                if (tab) setActiveTabId(tab.id);
              }}
            />
          </div>
        </div>
      )}

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

      {/* Drag handle — 左右分栏可调宽 (自适应高对比 + 实体 Grip 把手 + 双击居中) */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左右分栏宽度（双击恢复居中）"
        title="按住拖拽调节宽度，双击恢复 1:1 居中"
        onDoubleClick={() => {
          setRightPct(50);
          try { localStorage.setItem(SPLIT_KEY, "50"); } catch { /* ignore */ }
        }}
        onPointerDown={onSplitPointerDown}
        onPointerMove={onSplitPointerMove}
        onPointerUp={onSplitPointerUp}
        onPointerCancel={onSplitPointerUp}
        className={`hidden lg:flex w-2 shrink-0 cursor-col-resize items-center justify-center group relative z-20 touch-none select-none transition-colors ${
          isDragging
            ? "bg-primary/20 dark:bg-primary/30"
            : "bg-slate-200/70 hover:bg-primary/20 dark:bg-white/[0.06] dark:hover:bg-primary/20"
        }`}
      >
        <div
          className={`w-0.5 h-full transition-colors ${
            isDragging
              ? "bg-primary"
              : "bg-slate-300 dark:bg-white/10 group-hover:bg-primary/70"
          }`}
        />
        {/* 实体握把指示点 */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-8 rounded-full border flex flex-col items-center justify-center gap-1 shadow-xs transition-all pointer-events-none ${
            isDragging
              ? "bg-primary text-white border-primary scale-110"
              : "bg-white dark:bg-slate-800 text-slate-400 group-hover:text-primary border-slate-300 dark:border-white/15 group-hover:scale-105"
          }`}
        >
          <span className="w-1 h-1 rounded-full bg-current opacity-80" />
          <span className="w-1 h-1 rounded-full bg-current opacity-80" />
          <span className="w-1 h-1 rounded-full bg-current opacity-80" />
        </div>
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
                <div
                  key={tab.id}
                  className={`flex-shrink-0 flex items-center gap-0.5 rounded-md text-[11px] font-mono transition-all ${
                    tab.id === activeTabId
                      ? "bg-white dark:bg-primary/20 text-sky-700 dark:text-primary border border-slate-300 dark:border-primary/30 shadow-xs font-semibold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/5"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveTabId(tab.id)}
                    className="pl-2.5 pr-1 py-1 max-w-[9rem] truncate"
                    title={tab.label}
                  >
                    {tab.label}
                  </button>
                  {tab.id !== "scratch" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      className="pr-1.5 py-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      aria-label={`关闭 ${tab.label}`}
                      title="关闭"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
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
            {showSandboxCta && (
              <Link
                href="/settings/sandbox"
                title="配置 Modal 等云端沙箱凭证后即可运行"
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-500/30 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all shadow-xs"
              >
                <Cloud size={13} /> 去配置云端沙箱
              </Link>
            )}
            {showCloudRun && (
              <button
                type="button"
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-200 dark:border-violet-500/30 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all active:scale-95 disabled:opacity-50 shadow-xs"
                onClick={() => void runModal()}
                disabled={running || modalRunning || !activeCode.trim()}
                title={
                  cloudProvider === "daytona"
                    ? "在 Daytona 云端运行当前 Python 代码（需配置 API Key）"
                    : "在 Modal 云端运行当前 Python 代码（需配置 Token）"
                }
              >
                {modalRunning ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> 云端…
                  </>
                ) : (
                  <>
                    <Cloud size={13} /> 云端运行
                  </>
                )}
              </button>
            )}
            {showLocalRun && (
              <button
                className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white dark:bg-primary dark:text-on-primary text-xs font-bold font-headline rounded-lg transition-all active:scale-95 disabled:opacity-50 shadow-xs"
                onClick={runCode}
                disabled={running || modalRunning}
              >
                {running ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Running...
                  </>
                ) : (
                  <>
                    <Play size={13} className="fill-current" />
                    {previewMode ? "Preview" : "Run"}
                  </>
                )}
              </button>
            )}
          </div>
          <div className="flex-1 relative w-full h-full overflow-hidden bg-white dark:bg-[#1e1e1e]">
            <div className="absolute inset-0">
              <Editor
                height="100%"
                language={monacoLanguage}
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
                  fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
                  fontLigatures: true,
                  cursorBlinking: "smooth",
                  cursorSmoothCaretAnimation: "on",
                  smoothScrolling: true,
                  renderLineHighlight: "all",
                  scrollBeyondLastLine: false,
                  padding: { top: 16, bottom: 16 },
                  lineNumbersMinChars: 3,
                  glyphMargin: false,
                  folding: true,
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
              {sandpackPreview
                ? `Sandpack · ${sandpackPreview.template}`
                : webPreview
                  ? "Browser Preview"
                  : "Console Output"}
            </span>
          </div>
          {sandpackPreview ? (
            <FrameworkPreview
              template={sandpackPreview.template}
              files={sandpackPreview.files}
              theme={theme === "light" ? "light" : "dark"}
              runKey={sandpackPreview.runKey}
            />
          ) : webPreview ? (
            <iframe
              title="HTML 运行预览"
              sandbox="allow-scripts"
              srcDoc={webPreview}
              className="flex-1 min-h-0 w-full border-0 bg-white"
            />
          ) : (
            <div className="flex-1 p-4 font-mono text-xs space-y-1 overflow-y-auto shadow-inner-soft bg-slate-50/70 dark:bg-black/40">
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

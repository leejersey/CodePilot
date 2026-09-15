"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import Editor from "@monaco-editor/react";
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
  generateAnimation as apiGenerateAnimation,
  updateChapterStatus,
} from "@/lib/api";
import { defaultFilename, extractCodeBlocks, fingerprintCode } from "@/lib/codeBlocks";

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
  const [completing, setCompleting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [animationData, setAnimationData] = useState<any | null>(null);
  const [generatingAnim, setGeneratingAnim] = useState(false);
  const router = useRouter();

  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const activeCode = activeTab?.code ?? "";
  const activeLang = activeTab?.language || editorInfo.lang;

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
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return [...prev.slice(0, -1), { ...last, content: last.content + data.content }];
            }
            return [...prev, { role: "assistant", content: data.content }];
          });
        } else if (data.type === "done") {
          setStreaming(false);
        } else if (data.type === "error") {
          setStreaming(false);
          setMessages(prev => [...prev, { role: "system", content: `错误: ${data.message}` }]);
        }
      };

      ws.onclose = () => { wsRef.current = null; };
    });
  }, []);

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
    setConvId(null);
    setStreaming(false);
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
        // 非 Python → AI 模拟执行
        const data = await apiRunCode(activeCode, activeLang);
        setConsoleOutput(prev => [...prev, data.output, "Program finished."]);
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
    setMessages(prev => [...prev, userMsg]);
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

    wsRef.current?.send(JSON.stringify({ type: "message", content: userMsg.content }));
  };

  return (
    <div className="flex h-full w-full">
      {/* Left: AI Chat */}
      <main className="flex-1 flex flex-col bg-surface overflow-hidden border-r border-white/5 relative">
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth pb-32">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full opacity-60">
              <div className="text-center">
                <span className="material-symbols-outlined text-5xl text-secondary mb-4 block animate-spin">progress_activity</span>
                <p className="text-on-surface-variant">AI 导师正在准备引导...</p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            msg.role === "user" ? (
              <div key={i} className="flex gap-4 max-w-3xl ml-auto flex-row-reverse">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1 border border-primary/30">
                  <span className="material-symbols-outlined text-primary text-sm">person</span>
                </div>
                <div className="glass-panel bg-primary/10 p-4 rounded-2xl rounded-tr-none border border-primary/20 shadow-lg text-on-surface">
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ) : msg.role === "system" ? (
              <div key={i} className="text-center text-red-400 text-sm py-2">{msg.content}</div>
            ) : (
              <div key={i} className="flex gap-4 max-w-3xl">
                <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0 mt-1 border border-secondary/30">
                  <span className="material-symbols-outlined text-secondary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                </div>
                <div className="glass-panel bg-surface-container-high/40 p-5 rounded-2xl rounded-tl-none border border-white/5 shadow-xl text-on-surface-variant">
                  <StepAnimator
                    content={msg.content}
                    isStreaming={streaming && i === messages.length - 1}
                    onOpenInEditor={openInEditor}
                    activeFingerprint={activeTab?.fingerprint}
                  />
                </div>
              </div>
            )
          ))}

          {/* Animation Player */}
          {animationData && (
            <div className="max-w-3xl">
              <AnimationPlayer animationData={animationData} />
            </div>
          )}

          {streaming && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-4 max-w-3xl">
              <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0 mt-1 border border-secondary/30">
                <span className="material-symbols-outlined text-secondary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
              </div>
              <div className="flex items-center gap-1 px-4 py-3 bg-surface-container-low rounded-full border border-white/5">
                <div className="w-1.5 h-1.5 bg-secondary/60 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-secondary/60 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-1.5 h-1.5 bg-secondary/60 rounded-full animate-bounce [animation-delay:0.4s]"></div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input + Complete Button */}
        <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-surface via-surface to-transparent pt-12">
          <div className="relative flex items-end gap-3">
            {/* Complete Chapter Button */}
            {!chapterCompleted ? (
              <button
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 bg-secondary/20 hover:bg-secondary/30 text-secondary border border-secondary/30 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
                onClick={async () => {
                  if (completing) return;
                  setCompleting(true);
                  try {
                    await updateChapterStatus(chapterId, "completed");
                    setChapterCompleted(true);
                    // 触发侧边栏刷新
                    window.dispatchEvent(new Event("chapter-status-changed"));
                    // AI 提示
                    setMessages(prev => [...prev, { role: "assistant", content: "🎉 恭喜你完成了本章学习！下一章已自动解锁，可以从侧边栏继续学习。" }]);
                  } catch {
                    setMessages(prev => [...prev, { role: "system", content: "标记完成失败，请重试" }]);
                  } finally {
                    setCompleting(false);
                  }
                }}
                disabled={completing}
              >
                <span className="material-symbols-outlined text-sm">check_circle</span>
                {completing ? "确认中..." : "完成本章"}
              </button>
            ) : (
              <div className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 bg-primary/10 text-primary rounded-xl text-sm font-bold border border-primary/20">
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                已完成
              </div>
            )}
            {/* Generate Animation Button */}
            <button
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-3 bg-purple-500/15 hover:bg-purple-500/25 text-purple-400 border border-purple-500/25 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
              onClick={async () => {
                if (generatingAnim) return;
                setGeneratingAnim(true);
                setAnimationData(null);
                try {
                  const topic = input.trim() || messages.filter(m => m.role === "assistant").pop()?.content?.slice(0, 100) || "冒泡排序";
                  const data = await apiGenerateAnimation(topic);
                  setAnimationData(data);
                } catch { /* ignore */ }
                setGeneratingAnim(false);
              }}
              disabled={generatingAnim}
            >
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                {generatingAnim ? "progress_activity" : "animation"}
              </span>
              {generatingAnim ? "生成中" : "动画"}
            </button>
            <div className="flex-1 relative">
              <input
                className="w-full bg-surface-container-low border-b-2 border-outline-variant focus:border-primary focus:ring-0 text-on-surface py-4 pl-4 pr-12 rounded-t-xl transition-all placeholder:text-slate-600 outline-none"
                placeholder="向 AI 导师提问..."
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                disabled={streaming}
              />
              <button
                className="absolute right-4 bottom-4 text-primary hover:scale-110 transition-transform disabled:opacity-50"
                onClick={sendMessage}
                disabled={streaming || !input.trim()}
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Right: Code Sandbox */}
      <section className="w-[450px] hidden lg:flex flex-col bg-surface-container-low overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 border-b border-white/5">
          <div className="flex items-center justify-between gap-2 px-2 py-2 bg-surface-container-high/50 border-b border-white/5">
            <div className="flex items-center gap-1 overflow-x-auto min-w-0 flex-1 scrollbar-none">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={`flex-shrink-0 px-2.5 py-1.5 rounded-md text-[11px] font-mono transition-colors ${
                    tab.id === activeTabId
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                  }`}
                  title={tab.label}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-lg hover:brightness-110 transition-all active:scale-95 disabled:opacity-50"
              onClick={runCode}
              disabled={running}
            >
              {running ? (
                <><span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> Running...</>
              ) : (
                <><span className="material-symbols-outlined text-xs">play_arrow</span> Run</>
              )}
            </button>
          </div>
          <div className="flex-1 relative overflow-hidden">
            <Editor
              height="100%"
              language={activeLang}
              path={activeTab?.id || "scratch"}
              theme="vs-dark"
              value={activeCode}
              onChange={(v) => updateActiveCode(v || "")}
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
              }}
            />
          </div>
        </div>

        {/* Console */}
        <div className="h-1/3 flex flex-col min-h-0 bg-[#000000]">
          <div className="flex items-center px-4 py-2 bg-surface-container-high/80 border-b border-white/5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Console Output</span>
          </div>
          <div className="flex-1 p-4 font-mono text-xs space-y-1 overflow-y-auto">
            {consoleOutput.map((line, i) => (
              <div key={i} className={line.startsWith("▶") ? "text-cyan-400" : "text-slate-500"}>{line}</div>
            ))}
            <div className="w-2 h-4 bg-primary/40 inline-block animate-pulse align-middle ml-1"></div>
          </div>
        </div>
      </section>
    </div>
  );
}

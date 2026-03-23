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
  WS_BASE, getAnonymousId,
  getPath as fetchPath, getChapter as fetchChapter,
  createConversation as apiCreateConversation,
  runCode as apiRunCode,
  generateAnimation as apiGenerateAnimation,
  updateChapterStatus,
} from "@/lib/api";

interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
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
  const [code, setCode] = useState(`# 在这里编写代码\n`);
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

  // 3. 页面加载时自动引导
  const initDone = useRef(false);
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    async function autoGuide() {
      // 获取路线信息推断语言
      try {
        const p = await fetchPath(pathId);
        const info = detectLang(p.topic || "");
        setEditorInfo(info);
        setCode(`${info.comment} 在这里编写代码\n`);
        setConsoleOutput([info.runtime]);
      } catch { /* ignore */ }

      // 获取章节信息
      let chapterTitle = "本章内容";
      try {
        const ch = await fetchChapter(chapterId);
        chapterTitle = ch.title || chapterTitle;
      } catch { /* ignore */ }

      // 创建对话
      const newConvId = await createConversation();
      if (!newConvId) return;

      // 连接 WebSocket 并发送引导消息
      setStreaming(true);
      try {
        const ws = await connectWs(newConvId);
        ws.send(JSON.stringify({
          type: "message",
          content: `我刚进入「${chapterTitle}」章节的学习页面。请你作为 AI 编程导师，先简要介绍一下这个章节会学到什么，然后问问我有没有相关基础、想从哪个方面开始学起。用友好亲切的语气。`,
        }));
      } catch { setStreaming(false); }
    }

    autoGuide();
  }, [chapterId, pathId, createConversation, connectWs]);

  // 5. 运行代码
  const { runPython, loading: pyodideLoading, ready: pyodideReady } = usePyodide();

  const runCode = async () => {
    if (running || !code.trim()) return;
    setRunning(true);
    setConsoleOutput(prev => [...prev, "▶ Running..."]);

    try {
      if (editorInfo.lang === "python") {
        // Python → Pyodide 浏览器端真实执行
        if (!pyodideReady) {
          setConsoleOutput(prev => [...prev, "⚙️ 正在加载 Python 环境 (Pyodide)..."]);
        }
        const result = await runPython(code);
        setConsoleOutput(prev => [
          ...prev,
          result.output,
          result.error ? "Program exited with error." : "Program finished.",
        ]);
      } else {
        // 非 Python → AI 模拟执行
        const data = await apiRunCode(code, editorInfo.lang);
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
                  <StepAnimator content={msg.content} isStreaming={streaming && i === messages.length - 1} />
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
          <div className="flex items-center justify-between px-4 py-3 bg-surface-container-high/50">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-sm">code</span>
              <span className="text-xs font-bold tracking-tight text-slate-300 font-headline">{editorInfo.file}</span>
            </div>
            <button
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-lg hover:brightness-110 transition-all active:scale-95 disabled:opacity-50"
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
              defaultLanguage={editorInfo.lang}
              theme="vs-dark"
              value={code}
              onChange={(v) => setCode(v || "")}
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

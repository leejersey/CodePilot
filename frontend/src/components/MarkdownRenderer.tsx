"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
// cjs 在 Next/Turbopack 下比 esm 样式导入更稳
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { Check, CheckCircle2, Clapperboard, Code2, Copy, Loader2 } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { fingerprintCode } from "@/lib/codeBlocks";

const LANG_ALIASES: Record<string, string> = {
  py: "python",
  python3: "python",
  js: "javascript",
  node: "javascript",
  ts: "typescript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  "c++": "cpp",
  cplusplus: "cpp",
  golang: "go",
  rs: "rust",
  kt: "kotlin",
  plaintext: "text",
  text: "text",
};

function normalizeLang(raw: string): string {
  const key = raw.trim().toLowerCase();
  return LANG_ALIASES[key] || key;
}

const baseTheme = oneDark as Record<string, CSSProperties>;
const codeTheme: Record<string, CSSProperties> = {
  ...baseTheme,
  'pre[class*="language-"]': {
    ...baseTheme['pre[class*="language-"]'],
    background: "#0d1117",
    textShadow: "none",
    color: "#abb2bf",
  },
  'code[class*="language-"]': {
    ...baseTheme['code[class*="language-"]'],
    background: "transparent",
    textShadow: "none",
    color: "#abb2bf",
  },
};

interface Props {
  content: string;
  /** 将代码块发送到右侧编辑器 */
  onOpenInEditor?: (code: string, language: string) => void;
  /** 单知识点讲解（代码块旁「讲解」） */
  onExplainSnippet?: (payload: {
    code: string;
    language: string;
    context: string;
  }) => void;
  explaining?: boolean;
  /** 当前激活的编辑器代码指纹，用于高亮「已打开」 */
  activeFingerprint?: string | null;
}

export function MarkdownRenderer({
  content,
  onOpenInEditor,
  onExplainSnippet,
  explaining,
  activeFingerprint,
}: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // fenced code 已由 code 组件渲染完整卡片，去掉外层 pre 默认底色
        pre: ({ children }) => <>{children}</>,
        code({ className, children, ...props }) {
          const match = /language-([\w#+-]+)/i.exec(className || "");
          const codeStr = String(children).replace(/\n$/, "");
          // react-markdown：围栏代码不是 inline
          const isInline = Boolean((props as { inline?: boolean }).inline);

          if (!isInline && (match || codeStr.includes("\n"))) {
            const rawLang = match?.[1] || "text";
            const lang = normalizeLang(rawLang);
            const fp = fingerprintCode(lang, codeStr);
            const isActive = activeFingerprint === fp;
            return (
              <div
                className={`relative group my-3 rounded-xl overflow-hidden border transition-all ${
                  isActive
                    ? "border-primary/50 shadow-[0_0_20px_rgba(83,221,252,0.15)] ring-1 ring-primary/30"
                    : "border-white/[0.08] hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between px-4 py-2 bg-[#121929] text-xs text-slate-400 border-b border-white/5">
                  <span className="font-mono text-primary/80 font-semibold">{lang}</span>
                  <div className="flex items-center gap-2">
                    {onExplainSnippet && (
                      <button
                        type="button"
                        disabled={explaining}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 transition-all disabled:opacity-50"
                        onClick={() =>
                          onExplainSnippet({
                            code: codeStr,
                            language: lang,
                            context: content,
                          })
                        }
                        title="生成该知识点讲解短片（含运行结果）"
                      >
                        {explaining ? (
                          <Loader2 size={12} className="animate-spin text-violet-300" />
                        ) : (
                          <Clapperboard size={12} className="text-violet-300" />
                        )}
                        <span>{explaining ? "生成中" : "动画讲解"}</span>
                      </button>
                    )}
                    {onOpenInEditor && (
                      <button
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border transition-all ${
                          isActive
                            ? "text-primary bg-primary/15 border-primary/30 shadow-[0_0_10px_rgba(83,221,252,0.2)]"
                            : "text-slate-400 hover:text-primary bg-white/5 hover:bg-primary/10 border-white/5"
                        }`}
                        onClick={() => onOpenInEditor(codeStr, lang)}
                      >
                        {isActive ? <CheckCircle2 size={12} /> : <Code2 size={12} />}
                        <span>{isActive ? "编辑中" : "同步至沙箱"}</span>
                      </button>
                    )}
                    <CopyButton text={codeStr} />
                  </div>
                </div>
                <SyntaxHighlighter
                  style={codeTheme}
                  language={lang}
                  PreTag="div"
                  codeTagProps={{
                    style: {
                      background: "transparent",
                      textShadow: "none",
                      fontFamily: "JetBrains Mono, ui-monospace, monospace",
                    },
                  }}
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    background: "#0d1117",
                    fontSize: "13px",
                    padding: "16px",
                    textShadow: "none",
                    color: "#abb2bf",
                  }}
                >
                  {codeStr}
                </SyntaxHighlighter>
              </div>
            );
          }

          return (
            <code className="bg-white/10 text-cyan-300 px-1.5 py-0.5 rounded text-[13px] font-mono" {...props}>
              {children}
            </code>
          );
        },
        h1: ({ children }) => <h1 className="text-xl font-bold text-on-surface mt-4 mb-2 font-headline">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-bold text-on-surface mt-3 mb-2 font-headline">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-bold text-on-surface mt-2 mb-1">{children}</h3>,
        p: ({ children }) => <p className="leading-relaxed mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="space-y-1 mb-2 ml-1">{children}</ul>,
        ol: ({ children }) => <ol className="space-y-1 mb-2 ml-1 list-decimal list-inside">{children}</ol>,
        li: ({ children }) => (
          <li className="flex gap-2 leading-relaxed">
            <span className="text-secondary mt-1.5 text-[8px]">●</span>
            <span className="flex-1">{children}</span>
          </li>
        ),
        strong: ({ children }) => <strong className="font-bold text-on-surface">{children}</strong>,
        em: ({ children }) => <em className="text-secondary/90 italic">{children}</em>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 hover:brightness-125">
            {children}
          </a>
        ),
        hr: () => <hr className="border-white/10 my-3" />,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-secondary/50 pl-3 my-2 text-slate-400 italic">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-3">
            <table className="w-full text-sm border border-white/10 rounded">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="bg-white/5 px-3 py-1.5 text-left font-bold border-b border-white/10">{children}</th>,
        td: ({ children }) => <td className="px-3 py-1.5 border-b border-white/5">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md border border-white/5 transition-all"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      <span className={copied ? "text-emerald-400" : ""}>{copied ? "已复制" : "复制"}</span>
    </button>
  );
}

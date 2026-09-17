"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { Check, CheckCircle2, Clapperboard, Code2, Copy, Loader2 } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { fingerprintCode } from "@/lib/codeBlocks";
import { useTheme } from "@/components/ThemeProvider";

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
  htm: "html",
};

/** Prism 实际高亮语言：vue/react 等标签需映射到已内置的 grammar */
const PRISM_HIGHLIGHT_LANG: Record<string, string> = {
  vue: "markup",
  vue3: "markup",
  svelte: "markup",
  html: "markup",
  react: "jsx",
  "react-jsx": "jsx",
  "react-tsx": "tsx",
};

function normalizeLang(raw: string): string {
  const key = raw.trim().toLowerCase();
  return LANG_ALIASES[key] || key;
}

function prismLanguage(displayLang: string): string {
  return PRISM_HIGHLIGHT_LANG[displayLang] || displayLang;
}

// 经典的暗色代码主题 (One Dark 增强版)
const baseDarkTheme = oneDark as Record<string, CSSProperties>;
const darkCodeTheme: Record<string, CSSProperties> = {
  ...baseDarkTheme,
  'pre[class*="language-"]': {
    ...baseDarkTheme['pre[class*="language-"]'],
    background: "#0d1117",
    textShadow: "none",
    color: "#e6edf3",
    fontFamily: "JetBrains Mono, ui-monospace, monospace",
    lineHeight: "1.6",
  },
  'code[class*="language-"]': {
    ...baseDarkTheme['code[class*="language-"]'],
    background: "transparent",
    textShadow: "none",
    color: "#e6edf3",
    fontFamily: "JetBrains Mono, ui-monospace, monospace",
  },
  comment: { color: "#8b949e", fontStyle: "italic" },
  prolog: { color: "#8b949e", fontStyle: "italic" },
  keyword: { color: "#ff7b72", fontWeight: "bold" },
  string: { color: "#a5d6ff" },
  function: { color: "#d2a8ff", fontWeight: "600" },
  "class-name": { color: "#ffa657", fontWeight: "600" },
  number: { color: "#79c0ff" },
  boolean: { color: "#ff7b72" },
  operator: { color: "#79c0ff" },
  punctuation: { color: "#c9d1d9" },
  builtin: { color: "#ffa657" },
  // markup / vue / html
  tag: { color: "#7ee787" },
  "attr-name": { color: "#79c0ff" },
  "attr-value": { color: "#a5d6ff" },
  // jsx / react
  "property-access": { color: "#e6edf3" },
  script: { color: "#e6edf3" },
  style: { color: "#e6edf3" },
};

// 专业的亮色代码主题 (GitHub Light / VS Code Light 工业级高对比度规范)
const lightCodeTheme: Record<string, CSSProperties> = {
  'pre[class*="language-"]': {
    background: "#f6f8fa",
    color: "#24292f",
    textShadow: "none",
    fontFamily: "JetBrains Mono, ui-monospace, monospace",
    direction: "ltr",
    textAlign: "left",
    whiteSpace: "pre",
    wordSpacing: "normal",
    wordBreak: "normal",
    lineHeight: "1.65",
    MozTabSize: "2",
    OTabSize: "2",
    tabSize: "2",
    hyphens: "none",
  },
  'code[class*="language-"]': {
    background: "transparent",
    color: "#24292f",
    textShadow: "none",
    fontFamily: "JetBrains Mono, ui-monospace, monospace",
  },
  // 注释：中性深灰，极度清晰，拒绝淡灰看不清
  comment: { color: "#57606a", fontStyle: "italic" },
  prolog: { color: "#57606a", fontStyle: "italic" },
  doctype: { color: "#57606a", fontStyle: "italic" },
  cdata: { color: "#57606a", fontStyle: "italic" },
  // 标点符号与括号：清晰纯黑
  punctuation: { color: "#24292f" },
  // 关键字：经典深红，醒目权威
  keyword: { color: "#cf222e", fontWeight: "600" },
  "tag": { color: "#116329" },
  "boolean": { color: "#0550ae", fontWeight: "bold" },
  "number": { color: "#0550ae", fontWeight: "500" },
  // 字符串：深海蓝，高对比度
  string: { color: "#0a3069" },
  char: { color: "#0a3069" },
  "attr-value": { color: "#0a3069" },
  // 函数名：典雅深紫
  function: { color: "#8250df", fontWeight: "600" },
  "class-name": { color: "#953800", fontWeight: "600" },
  // 运算符：深灰带红
  operator: { color: "#0550ae" },
  entity: { color: "#8250df" },
  url: { color: "#0969da", textDecoration: "underline" },
  // 内置函数 (print, len 等)：深金褐
  builtin: { color: "#953800", fontWeight: "600" },
  variable: { color: "#953800" },
  property: { color: "#0550ae" },
  regex: { color: "#116329" },
  important: { color: "#cf222e", fontWeight: "bold" },
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
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children }) => <>{children}</>,
        code({ className, children, ...props }) {
          const match = /language-([\w#+-]+)/i.exec(className || "");
          const codeStr = String(children).replace(/\n$/, "");
          const isInline = Boolean((props as { inline?: boolean }).inline);

          if (!isInline && (match || codeStr.includes("\n"))) {
            const rawLang = match?.[1] || "text";
            const lang = normalizeLang(rawLang);
            const highlightLang = prismLanguage(lang);
            const fp = fingerprintCode(lang, codeStr);
            const isActive = activeFingerprint === fp;
            return (
              <div
                className={`relative group my-4 rounded-xl overflow-hidden border transition-all duration-200 ${
                  isActive
                    ? "border-sky-500 shadow-md ring-2 ring-sky-500/20"
                    : "border-slate-300 dark:border-white/[0.08] shadow-xs hover:border-slate-400 dark:hover:border-white/20"
                }`}
              >
                {/* 代码块顶部工具栏 */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 dark:bg-[#121929] border-b border-slate-200 dark:border-white/5 select-none">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-sky-400">
                      {lang}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {onExplainSnippet && (
                      <button
                        type="button"
                        disabled={explaining}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-violet-700 dark:text-violet-300 bg-violet-100/70 hover:bg-violet-200/70 dark:bg-violet-500/10 dark:hover:bg-violet-500/20 border border-violet-200 dark:border-violet-500/20 transition-all disabled:opacity-50 active:scale-95"
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
                          <Loader2 size={13} className="animate-spin text-violet-600 dark:text-violet-300" />
                        ) : (
                          <Clapperboard size={13} className="text-violet-600 dark:text-violet-300" />
                        )}
                        <span>{explaining ? "生成中" : "动画讲解"}</span>
                      </button>
                    )}
                    {onOpenInEditor && (
                      <button
                        type="button"
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all active:scale-95 ${
                          isActive
                            ? "text-sky-700 dark:text-primary bg-sky-100 dark:bg-primary/10 border-sky-300 dark:border-primary/30 font-semibold"
                            : "text-slate-700 dark:text-slate-400 hover:text-sky-600 dark:hover:text-primary bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-primary/10 border-slate-200 dark:border-white/5"
                        }`}
                        onClick={() => onOpenInEditor(codeStr, lang)}
                      >
                        {isActive ? <CheckCircle2 size={13} /> : <Code2 size={13} />}
                        <span>{isActive ? "编辑中" : "同步至沙箱"}</span>
                      </button>
                    )}
                    <CopyButton text={codeStr} />
                  </div>
                </div>

                {/* 代码高亮主体 */}
                <SyntaxHighlighter
                  style={isDark ? darkCodeTheme : lightCodeTheme}
                  language={highlightLang}
                  PreTag="div"
                  codeTagProps={{
                    style: {
                      background: "transparent",
                      textShadow: "none",
                      fontFamily: "JetBrains Mono, ui-monospace, monospace",
                      fontSize: "13.5px",
                    },
                  }}
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    background: isDark ? "#0d1117" : "#f6f8fa",
                    fontSize: "13.5px",
                    padding: "16px",
                    textShadow: "none",
                  }}
                >
                  {codeStr}
                </SyntaxHighlighter>
              </div>
            );
          }

          // 行内代码 Inline Code (精致专业版)
          return (
            <code
              className="bg-slate-100 dark:bg-white/10 text-[#cf222e] dark:text-cyan-300 border border-slate-200 dark:border-transparent px-1.5 py-0.5 rounded-md text-[13px] font-mono font-semibold mx-0.5"
              {...props}
            >
              {children}
            </code>
          );
        },
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-5 mb-3 font-headline tracking-tight pb-1 border-b border-slate-200/80 dark:border-white/10">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-4 mb-2 font-headline tracking-tight">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-3 mb-1.5">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="leading-7 mb-3 last:mb-0 text-slate-800 dark:text-slate-200 text-[14.5px]">
            {children}
          </p>
        ),
        ul: ({ children }) => (
          <ul className="space-y-1.5 mb-3 ml-1 text-slate-800 dark:text-slate-200 text-[14px]">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="space-y-1.5 mb-3 ml-2 list-decimal list-inside text-slate-800 dark:text-slate-200 text-[14px]">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="flex items-baseline gap-2 leading-relaxed">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 dark:bg-primary shrink-0 translate-y-[-2px]" />
            <span className="flex-1">{children}</span>
          </li>
        ),
        strong: ({ children }) => (
          <strong className="font-bold text-slate-950 dark:text-white">
            {children}
          </strong>
        ),
        em: ({ children }) => (
          <em className="text-violet-800 dark:text-violet-300 not-italic font-semibold px-0.5">
            {children}
          </em>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-sky-600 dark:text-primary font-semibold underline underline-offset-4 hover:text-sky-700 dark:hover:brightness-125 transition-colors"
          >
            {children}
          </a>
        ),
        hr: () => <hr className="border-slate-200 dark:border-white/10 my-4" />,
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-sky-500 dark:border-secondary/70 pl-4 py-2.5 my-3 bg-sky-50/80 dark:bg-surface-container-high/30 rounded-r-xl text-slate-800 dark:text-slate-200 text-[14px] leading-relaxed shadow-xs">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-4 border border-slate-200 dark:border-white/10 rounded-xl shadow-xs">
            <table className="w-full text-sm divide-y divide-slate-200 dark:divide-white/10">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="bg-slate-100 dark:bg-white/5 px-4 py-2.5 text-left font-bold text-slate-900 dark:text-slate-100 text-xs uppercase tracking-wider">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-2.5 text-slate-800 dark:text-slate-300 border-b border-slate-100 dark:border-white/5 text-[13.5px]">
            {children}
          </td>
        ),
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
      type="button"
      className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/5 transition-all shadow-xs dark:shadow-none active:scale-95"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      title="复制代码"
    >
      {copied ? <Check size={13} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={13} />}
      <span className={copied ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""}>
        {copied ? "已复制" : "复制"}
      </span>
    </button>
  );
}

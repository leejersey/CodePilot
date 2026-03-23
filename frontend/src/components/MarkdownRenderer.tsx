"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useState } from "react";

interface Props {
  content: string;
}

export function MarkdownRenderer({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // 代码块 + 行内代码
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const codeStr = String(children).replace(/\n$/, "");

          if (match) {
            return (
              <div className="relative group my-3 rounded-lg overflow-hidden border border-white/10">
                <div className="flex items-center justify-between px-4 py-1.5 bg-[#1a1a2e] text-xs text-slate-400 border-b border-white/5">
                  <span className="font-mono">{match[1]}</span>
                  <CopyButton text={codeStr} />
                </div>
                <SyntaxHighlighter
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  style={oneDark as any}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    background: "#0d1117",
                    fontSize: "13px",
                    padding: "16px",
                  }}
                >
                  {codeStr}
                </SyntaxHighlighter>
              </div>
            );
          }

          // 行内代码
          return (
            <code className="bg-white/10 text-cyan-300 px-1.5 py-0.5 rounded text-[13px] font-mono" {...props}>
              {children}
            </code>
          );
        },
        // 标题
        h1: ({ children }) => <h1 className="text-xl font-bold text-on-surface mt-4 mb-2 font-headline">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-bold text-on-surface mt-3 mb-2 font-headline">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-bold text-on-surface mt-2 mb-1">{children}</h3>,
        // 段落
        p: ({ children }) => <p className="leading-relaxed mb-2 last:mb-0">{children}</p>,
        // 列表
        ul: ({ children }) => <ul className="space-y-1 mb-2 ml-1">{children}</ul>,
        ol: ({ children }) => <ol className="space-y-1 mb-2 ml-1 list-decimal list-inside">{children}</ol>,
        li: ({ children }) => (
          <li className="flex gap-2 leading-relaxed">
            <span className="text-secondary mt-1.5 text-[8px]">●</span>
            <span className="flex-1">{children}</span>
          </li>
        ),
        // 加粗 & 斜体
        strong: ({ children }) => <strong className="font-bold text-on-surface">{children}</strong>,
        em: ({ children }) => <em className="text-secondary/90 italic">{children}</em>,
        // 链接
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 hover:brightness-125">
            {children}
          </a>
        ),
        // 分割线
        hr: () => <hr className="border-white/10 my-3" />,
        // 引用
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-secondary/50 pl-3 my-2 text-slate-400 italic">
            {children}
          </blockquote>
        ),
        // 表格
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
      className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <span className="material-symbols-outlined text-[12px]">{copied ? "check" : "content_copy"}</span>
      {copied ? "已复制" : "复制"}
    </button>
  );
}

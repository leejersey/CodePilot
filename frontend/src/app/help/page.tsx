"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Cloud, HelpCircle, MessageSquare, Settings, Sparkles } from "lucide-react";

const FAQ_ITEMS = [
  {
    q: "「AI 教学」和「文档学习」有什么区别？",
    a: "AI 教学是和导师对话、边问边学；文档学习是按讲义分阶段阅读，可针对当前段落提问（回答出现在文档浮层，不写入 AI 教学对话）。两套对话互不混写。",
  },
  {
    q: "如何配置模型 API Key？",
    a: "模型 Key 用于 AI 对话，在「个人中心 → 模型配置」新增并启用。完整步骤见教程页。",
    href: "/help/llm-key",
    linkLabel: "打开模型 Key 配置教程",
  },
  {
    q: "如何配置沙箱 Key（云端运行）？",
    a: "沙箱凭证（Modal / Daytona）用于学习页「云端运行」。在「个人中心 → 沙箱配置」填写后保存；章节 .env 里的模型密钥与此分开。",
    href: "/help/sandbox-key",
    linkLabel: "打开沙箱 Key 配置教程",
  },
  {
    q: "右侧代码跑不了怎么办？",
    a: "Python 与 HTML/CSS/JS 可在浏览器内试跑；React/Vue 走 Sandpack；其他语言依赖 Judge0。若当前代码块需要 pip / 云端环境，页面会提示「云端运行」——请先配置沙箱凭证。章节内的 .env 仅用于代码里读取的密钥（如 DEEPSEEK_API_KEY）。",
    href: "/help/sandbox-key",
    linkLabel: "查看沙箱配置教程",
  },
  {
    q: "「云端运行」提示去配置沙箱？",
    a: "部分章节（如 LangChain 示例）必须在云端执行。打开沙箱配置填写 Modal Token 或 Daytona API Key，选好默认提供商后保存，再回到章节点「云端运行」。",
    href: "/help/sandbox-key",
    linkLabel: "打开沙箱 Key 配置教程",
  },
  {
    q: "截图发给 AI 后刷新看不见了？",
    a: "配置火山 TOS 后，截图会持久化并可在历史消息中回放。未配置时仅当前轮生效，刷新后不会保留图片。",
  },
  {
    q: "怎样才算完成本章？",
    a: "建议路径：对话理解 → 沙箱试跑 → 完成章节练习 → 点击「完成本章」。完成后下一章会自动解锁。",
  },
  {
    q: "如何切换自己的大模型？",
    a: "打开个人中心 → 模型配置，可添加兼容 OpenAI 协议的 API。未配置时使用平台默认模型。",
    href: "/help/llm-key",
    linkLabel: "打开模型 Key 配置教程",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <Link
        href="/learn"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary mb-6"
      >
        <ArrowLeft size={14} />
        返回学习
      </Link>

      <div className="mb-8">
        <p className="text-xs font-mono font-semibold text-primary mb-2">HELP</p>
        <h1 className="font-headline text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <HelpCircle className="text-primary" size={28} />
          常见问题
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          平台使用说明。课程内容相关问题请在章节内向 AI 导师提问。
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-8">
        <Link
          href="/help/llm-key"
          className="rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/90 dark:bg-surface-container-low/50 px-4 py-4 hover:border-primary/40 transition-colors"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <Sparkles size={15} className="text-primary" />
            模型 Key 教程
          </p>
          <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
            如何申请并填写对话用的 API Key
          </p>
        </Link>
        <Link
          href="/help/sandbox-key"
          className="rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/90 dark:bg-surface-container-low/50 px-4 py-4 hover:border-primary/40 transition-colors"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <Cloud size={15} className="text-primary" />
            沙箱 Key 教程
          </p>
          <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
            如何配置 Modal / Daytona 云端运行
          </p>
        </Link>
      </div>

      <div className="space-y-3 mb-10">
        {FAQ_ITEMS.map((item) => (
          <details
            key={item.q}
            className="group rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/90 dark:bg-surface-container-low/50 px-5 py-4 open:shadow-sm"
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-start gap-2">
              <BookOpen size={15} className="mt-0.5 shrink-0 text-primary" />
              {item.q}
            </summary>
            <p className="mt-3 pl-6 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {item.a}
            </p>
            {"href" in item && item.href && (
              <Link
                href={item.href}
                className="mt-3 ml-6 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                {item.linkLabel}
                <ArrowRight size={12} />
              </Link>
            )}
          </details>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/settings/llm"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/40 hover:text-primary"
        >
          <Settings size={14} />
          模型设置
        </Link>
        <Link
          href="/settings/sandbox"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/40 hover:text-primary"
        >
          <Settings size={14} />
          沙箱配置
        </Link>
        <Link
          href="/learn"
          className="inline-flex items-center gap-2 rounded-xl bg-primary/15 border border-primary/30 px-4 py-2.5 text-xs font-semibold text-primary"
        >
          <MessageSquare size={14} />
          继续学习
        </Link>
      </div>
    </div>
  );
}

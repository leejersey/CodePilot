"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Cloud, ExternalLink } from "lucide-react";

const STEPS = [
  {
    title: "打开沙箱配置",
    body: "进入「个人中心 → 沙箱配置」。这里保存的是云端执行环境凭证（Modal 或 Daytona），用于学习页的「云端运行」，不会使用平台密钥。",
  },
  {
    title: "选择默认提供商",
    body: "在页面顶部选择 Modal 或 Daytona。若只配置了其中一家，系统也会自动用那一家；两家都配了时，以默认提供商为准。",
  },
  {
    title: "创建并填写凭证",
    body: "按提供商在控制台创建 Token / API Key，回到本站粘贴后点「保存」。首次配置两项都要填齐；已保存后留空表示不修改原密钥。",
    links: [
      {
        href: "https://modal.com/settings/tokens",
        label: "Modal Tokens（Token ID + Secret）",
      },
      {
        href: "https://app.daytona.io/dashboard/keys",
        label: "Daytona API Keys",
      },
    ],
  },
  {
    title: "回到章节点「云端运行」",
    body: "LangChain 等需要 pip 的代码会隐藏蓝色浏览器 Run，改为「云端运行」。若仍提示去配置沙箱，刷新页面或确认默认提供商对应的凭证已保存。",
  },
];

export default function HelpSandboxKeyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <Link
        href="/help"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary mb-6"
      >
        <ArrowLeft size={14} />
        返回常见问题
      </Link>

      <div className="mb-8">
        <p className="text-xs font-mono font-semibold text-primary mb-2">TUTORIAL</p>
        <h1 className="font-headline text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Cloud className="text-primary" size={28} />
          如何配置沙箱 Key
        </h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          沙箱 Key 负责「在哪里跑代码」。代码里调用的模型密钥（如 DeepSeek）仍要在章节 .env
          或模型配置中单独填写。
        </p>
      </div>

      <ol className="space-y-4 mb-10">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/90 dark:bg-surface-container-low/50 px-5 py-4"
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">
                {index + 1}
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {step.title}
                </h2>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {step.body}
                </p>
                {step.links && (
                  <ul className="mt-3 space-y-1.5">
                    {step.links.map((link) => (
                      <li key={link.href}>
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                        >
                          <ExternalLink size={12} />
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="space-y-3 mb-8">
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-4">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
            三套 Key 别混
          </p>
          <ul className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed space-y-1 list-disc pl-4">
            <li>
              <strong className="font-semibold text-slate-700 dark:text-slate-200">沙箱凭证</strong>
              ：Modal / Daytona，决定云端能不能起环境
            </li>
            <li>
              <strong className="font-semibold text-slate-700 dark:text-slate-200">章节 .env</strong>
              ：如 <code className="font-mono text-[12px]">DEEPSEEK_API_KEY</code>
              ，给云端代码里的 SDK 用
            </li>
            <li>
              <strong className="font-semibold text-slate-700 dark:text-slate-200">模型配置</strong>
              ：个人中心里的对话模型 API Key，给 AI 导师用
            </li>
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/settings/sandbox"
          className="inline-flex items-center gap-2 rounded-xl bg-primary/15 border border-primary/30 px-4 py-2.5 text-xs font-semibold text-primary"
        >
          去沙箱配置
          <ArrowRight size={14} />
        </Link>
        <Link
          href="/help/llm-key"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/40 hover:text-primary"
        >
          模型 Key 教程
        </Link>
      </div>
    </div>
  );
}

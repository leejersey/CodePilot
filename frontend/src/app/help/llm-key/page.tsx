"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, Sparkles } from "lucide-react";

const STEPS = [
  {
    title: "打开模型配置",
    body: "进入「个人中心 → 模型配置」。未配置时，对话会使用平台默认模型；配置并启用后，将改用你自己的 API Key。",
  },
  {
    title: "获取服务商 API Key",
    body: "在对应控制台创建密钥，复制后妥善保存（通常只显示一次）。",
    links: [
      { href: "https://platform.deepseek.com/api_keys", label: "DeepSeek API Keys" },
      { href: "https://platform.openai.com/api-keys", label: "OpenAI API Keys" },
      { href: "https://aistudio.google.com/apikey", label: "Google AI Studio（Gemini）" },
      { href: "https://openrouter.ai/keys", label: "OpenRouter Keys" },
    ],
  },
  {
    title: "新增一条配置",
    body: "点击「新增配置」，填写名称、选择提供商（DeepSeek / OpenAI / Gemini / OpenRouter / 自定义），粘贴 API Key。预设会自动填好 Base URL 与默认模型；自定义网关需自行填写兼容 OpenAI 的 Base URL。",
  },
  {
    title: "启用并测试",
    body: "保存后，在列表中选中该配置使其生效，再点「测试当前连通性」。成功后回到任意章节，AI 教学对话即走你的模型。",
  },
];

export default function HelpLlmKeyPage() {
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
          <Sparkles className="text-primary" size={28} />
          如何配置模型 API Key
        </h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          模型 Key 用于「AI 教学」对话与文档提问，与云端沙箱凭证、章节代码里的 .env 密钥是三套不同的配置。
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

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 mb-8">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
          和章节 .env 的区别
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          学习页右侧「.env」里的 <code className="font-mono text-[12px]">DEEPSEEK_API_KEY</code>{" "}
          只给云端运行的代码读取（例如 LangChain 调模型）。对话用的模型 Key 请在本页所述的「模型配置」里填写，不要混用。
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/settings/llm"
          className="inline-flex items-center gap-2 rounded-xl bg-primary/15 border border-primary/30 px-4 py-2.5 text-xs font-semibold text-primary"
        >
          去模型配置
          <ArrowRight size={14} />
        </Link>
        <Link
          href="/help/sandbox-key"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/40 hover:text-primary"
        >
          沙箱 Key 教程
        </Link>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

export interface ApiKeyConfigPanelProps {
  title?: string;
  deepseekKey: string;
  onDeepseekKeyChange: (value: string) => void;
  onSave: () => void;
  onClear?: () => void;
  onSaveAndRun?: () => void;
  onOpenAdvanced?: () => void;
  saving?: boolean;
  variant?: "card" | "modal";
  hasSavedKey?: boolean;
}

export function ApiKeyConfigPanel({
  title = "配置模型 API Key",
  deepseekKey,
  onDeepseekKeyChange,
  onSave,
  onClear,
  onSaveAndRun,
  onOpenAdvanced,
  saving = false,
  variant = "card",
  hasSavedKey = false,
}: ApiKeyConfigPanelProps) {
  const [show, setShow] = useState(false);

  return (
    <div
      className={
        variant === "modal"
          ? "rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-surface-container-high p-5 shadow-xl max-w-md w-full"
          : "mt-2 rounded-lg border border-amber-200/80 dark:border-amber-500/25 bg-amber-50/70 dark:bg-amber-500/5 px-2.5 py-2"
      }
    >
      <div className="flex items-start gap-2">
        <KeyRound size={variant === "modal" ? 18 : 14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className={`font-semibold text-slate-800 dark:text-slate-100 ${variant === "modal" ? "text-sm" : "text-[11px]"}`}>
            {title}
            {hasSavedKey ? (
              <span className="ml-1.5 font-normal text-emerald-600 dark:text-emerald-400">已保存</span>
            ) : null}
          </p>
          <p className={`text-slate-500 dark:text-slate-400 mt-0.5 leading-snug ${variant === "modal" ? "text-xs" : "text-[10px]"}`}>
            仅用于本课云端试跑，保存在浏览器本地，不会写入平台账号。
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <input
              type={show ? "text" : "password"}
              value={deepseekKey}
              onChange={(e) => onDeepseekKeyChange(e.target.value)}
              placeholder="DeepSeek API Key"
              autoComplete="off"
              className={`flex-1 min-w-0 rounded-md border border-slate-200 dark:border-white/15 bg-white dark:bg-black/20 px-2 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-amber-400 ${
                variant === "modal" ? "text-sm" : "text-[11px]"
              }`}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
              title={show ? "隐藏" : "显示"}
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${variant === "modal" ? "gap-2" : ""}`}>
            <button
              type="button"
              disabled={saving || !deepseekKey.trim()}
              onClick={onSave}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : null}
              保存
            </button>
            {onSaveAndRun ? (
              <button
                type="button"
                disabled={saving || !deepseekKey.trim()}
                onClick={onSaveAndRun}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold border border-amber-400/60 text-amber-800 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-amber-500/10 disabled:opacity-50"
              >
                保存并云端试跑
              </button>
            ) : null}
            {onClear && hasSavedKey ? (
              <button
                type="button"
                onClick={onClear}
                className="text-[10px] text-slate-500 hover:text-rose-500 px-1"
              >
                清除 Key
              </button>
            ) : null}
            {onOpenAdvanced ? (
              <button
                type="button"
                onClick={onOpenAdvanced}
                className="text-[10px] text-slate-500 hover:text-sky-600 ml-auto px-1"
              >
                高级：打开 .env
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

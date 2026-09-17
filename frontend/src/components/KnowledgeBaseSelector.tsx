"use client";

import { useId } from "react";
import { Bot, Database, Loader2 } from "lucide-react";
import type { KnowledgeBase } from "@/lib/api";
import {
  chooseKnowledgeBase,
  choosePureAi,
  isKnowledgeBaseUnselectable,
  type KnowledgeBaseSelection,
} from "@/lib/knowledgeBaseSelection";

interface KnowledgeBaseSelectorProps extends KnowledgeBaseSelection {
  knowledgeBases: KnowledgeBase[];
  onChange: (selection: KnowledgeBaseSelection) => void;
  onPureAiSelect?: () => void;
  onRetry?: () => void;
  loading?: boolean;
  error?: string;
  disabled?: boolean;
  label?: string;
}

export function KnowledgeBaseSelector({
  knowledgeBases,
  pureAi,
  knowledgeBaseIds,
  onChange,
  onPureAiSelect,
  onRetry,
  loading = false,
  error = "",
  disabled = false,
  label = "课程内容来源",
}: KnowledgeBaseSelectorProps) {
  const id = useId();
  const selection = { pureAi, knowledgeBaseIds };
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;

  return (
    <fieldset
      disabled={disabled}
      aria-describedby={error ? `${helpId} ${errorId}` : helpId}
      aria-busy={loading}
    >
      <legend className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">
        {label}
      </legend>

      <p id={helpId} className="sr-only">
        纯 AI 模式与知识库来源互斥；知识库可以多选。
      </p>
      <label
        className={`mb-2 flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
          pureAi
            ? "border-primary/45 bg-primary/10"
            : "border-slate-200 bg-slate-50 hover:border-primary/25 dark:border-white/10 dark:bg-surface-container-low/50"
        }`}
      >
        <input
          type="radio"
          name={`${id}-source-mode`}
          checked={pureAi}
          onChange={() => onChange(choosePureAi())}
          onClick={onPureAiSelect}
          className="mt-1 h-4 w-4 shrink-0 accent-primary"
        />
        <span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Bot size={14} className="text-primary" />
            纯 AI 模式
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            不引用知识库，由 AI 独立生成课程内容。
          </span>
        </span>
      </label>

      <div
        className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-surface-container-low/50"
        aria-live="polite"
      >
        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-slate-500">
            <Loader2 size={14} className="mr-2 animate-spin text-primary" />
            加载可用知识库…
          </div>
        ) : error ? (
          <div className="px-4 py-6 text-center">
            <p id={errorId} role="alert" className="text-xs text-rose-500">
              {error}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-600 dark:text-rose-300"
              >
                重试加载
              </button>
            )}
          </div>
        ) : knowledgeBases.length === 0 ? (
          <div className="px-4 py-7 text-center">
            <Database size={22} className="mx-auto mb-2 text-slate-400" />
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              暂无可选知识库
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              可继续使用纯 AI 模式。
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-white/5">
            {knowledgeBases.map((kb) => {
              const checked = knowledgeBaseIds.includes(kb.id);
              const readyCount = kb.ready_document_count ?? kb.document_count;
              const unavailable = isKnowledgeBaseUnselectable(kb);
              return (
                <li key={kb.id}>
                  <label
                    className={`flex items-start gap-3 px-3 py-3 transition-colors ${
                      unavailable ? "cursor-not-allowed opacity-55" : "cursor-pointer"
                    } ${
                      checked ? "bg-primary/10" : "hover:bg-slate-100 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-primary"
                      checked={checked}
                      onChange={() => onChange(chooseKnowledgeBase(selection, kb.id))}
                      aria-label={`选择知识库 ${kb.name}`}
                      disabled={unavailable}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {kb.name}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                        <span>{kb.visibility === "platform_public" ? "平台共享" : "当前账号私有"}</span>
                        <span>{kb.document_count} 个文档</span>
                        <span className={readyCount > 0 ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}>
                          {readyCount}/{kb.document_count} 就绪
                        </span>
                        <span>{unavailable ? "不可用于生成" : "可用于生成"}</span>
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </fieldset>
  );
}

"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { AccessibleModal } from "@/components/AccessibleModal";
import { KnowledgeBaseSelector } from "@/components/KnowledgeBaseSelector";
import {
  listSelectableKnowledgeBases,
  type CourseGenerateRequest,
  type KnowledgeBase,
} from "@/lib/api";
import { validateCourseSourceSubmission } from "@/lib/courseSourceFormState";
import {
  createKnowledgeBaseSelection,
  type KnowledgeBaseSelection,
} from "@/lib/knowledgeBaseSelection";

export interface CourseSourceFormValue {
  topic: string;
  difficulty: CourseGenerateRequest["difficulty"];
  background: string;
  selection: KnowledgeBaseSelection;
}

export function CourseSourceModal({
  title,
  warning = "",
  initialValue,
  initialPureAiExplicit = false,
  busy,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  warning?: string;
  initialValue: CourseSourceFormValue;
  initialPureAiExplicit?: boolean;
  busy: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (value: CourseSourceFormValue) => void | Promise<void>;
}) {
  const id = useId();
  const [topic, setTopic] = useState(initialValue.topic);
  const [difficulty, setDifficulty] = useState(initialValue.difficulty);
  const [background, setBackground] = useState(initialValue.background);
  const [selection, setSelection] = useState(() =>
    createKnowledgeBaseSelection(
      initialValue.selection.knowledgeBaseIds,
      initialValue.selection.pureAi
    )
  );
  const [pureAiExplicit, setPureAiExplicit] = useState(
    initialPureAiExplicit
  );
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [knowledgeBaseLoading, setKnowledgeBaseLoading] = useState(true);
  const [knowledgeBaseError, setKnowledgeBaseError] = useState("");
  const [formError, setFormError] = useState("");

  const loadKnowledgeBases = useCallback(async (signal?: AbortSignal) => {
    setKnowledgeBaseError("");
    setKnowledgeBaseLoading(true);
    try {
      const items = await listSelectableKnowledgeBases({ signal });
      if (!signal?.aborted) setKnowledgeBases(items);
    } catch (error) {
      if (signal?.aborted) return;
      setKnowledgeBaseError(
        error instanceof Error ? error.message : "知识库加载失败"
      );
    } finally {
      if (!signal?.aborted) setKnowledgeBaseLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadKnowledgeBases(controller.signal);
    return () => controller.abort();
  }, [loadKnowledgeBases]);

  const sourceBlocked =
    knowledgeBaseLoading ||
    Boolean(
      knowledgeBaseError && !(selection.pureAi && pureAiExplicit)
    );

  async function submit() {
    const validationError = validateCourseSourceSubmission({
      topic,
      selection,
      knowledgeBaseError,
      pureAiExplicit,
    });
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError("");
    await onSubmit({
      topic: topic.trim(),
      difficulty,
      background: background.trim(),
      selection,
    });
  }

  return (
    <AccessibleModal title={title} busy={busy} onClose={onClose}>
      {warning && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          {warning}
        </p>
      )}
      <label htmlFor={`${id}-topic`} className="mt-4 block text-xs font-bold">
        课程主题
      </label>
      <input
        id={`${id}-topic`}
        data-autofocus
        value={topic}
        onChange={(event) => setTopic(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-white/10 dark:bg-surface-container-low"
      />
      <label
        htmlFor={`${id}-difficulty`}
        className="mt-3 block text-xs font-bold"
      >
        难度
      </label>
      <select
        id={`${id}-difficulty`}
        value={difficulty}
        onChange={(event) =>
          setDifficulty(
            event.target.value as CourseGenerateRequest["difficulty"]
          )
        }
        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm dark:border-white/10 dark:bg-surface-container-low"
      >
        <option value="beginner">初级</option>
        <option value="intermediate">中级</option>
        <option value="advanced">高级</option>
      </select>
      <label
        htmlFor={`${id}-background`}
        className="mt-3 block text-xs font-bold"
      >
        学习背景
      </label>
      <textarea
        id={`${id}-background`}
        value={background}
        onChange={(event) => setBackground(event.target.value)}
        placeholder="可选：已有经验、学习目标等"
        className="mt-1.5 min-h-20 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm outline-none focus:border-primary dark:border-white/10 dark:bg-surface-container-low"
      />
      <div className="mt-4">
        <KnowledgeBaseSelector
          knowledgeBases={knowledgeBases}
          loading={knowledgeBaseLoading}
          error={knowledgeBaseError}
          {...selection}
          onChange={setSelection}
          onPureAiSelect={() => setPureAiExplicit(true)}
          onRetry={() => void loadKnowledgeBases()}
          disabled={busy}
        />
      </div>
      {formError && (
        <p role="alert" className="mt-3 text-xs text-rose-500">
          {formError}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="rounded-xl border px-4 py-2 text-xs disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          disabled={busy || sourceBlocked}
          onClick={() => void submit()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </AccessibleModal>
  );
}

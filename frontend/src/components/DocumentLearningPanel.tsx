"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import {
  getChapterLearningDocs,
  type DocStage,
  type LearningDocsPayload,
} from "@/lib/api";

export interface DocAskContext {
  source: "handout";
  source_label: string;
  stage_id: string;
  stage_title: string;
  stage_content: string;
  selection?: string;
}

interface Props {
  chapterId: string;
  onAskContextChange: (ctx: DocAskContext | null) => void;
  onOpenInEditor?: (code: string, language: string) => void;
  onExplainSnippet?: (payload: {
    code: string;
    language: string;
    context: string;
  }) => void;
  explaining?: boolean;
  activeFingerprint?: string | null;
  /** 底部问答浮层打开时，给正文留出滚动空间 */
  reserveBottom?: boolean;
}

export function DocumentLearningPanel({
  chapterId,
  onAskContextChange,
  onOpenInEditor,
  onExplainSnippet,
  explaining,
  activeFingerprint,
  reserveBottom,
}: Props) {
  const [payload, setPayload] = useState<LearningDocsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stages, setStages] = useState<DocStage[]>([]);
  const [unlocked, setUnlocked] = useState(0);
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [selection, setSelection] = useState("");
  const docRef = useRef<HTMLDivElement>(null);
  const onAskRef = useRef(onAskContextChange);
  onAskRef.current = onAskContextChange;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await getChapterLearningDocs(chapterId);
        if (cancelled) return;
        setPayload(data);
        setStages(data.sources.handout.stages || []);
        setUnlocked(0);
        setActiveStageIdx(0);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载文档失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  const activeStage = useMemo(() => {
    if (!stages.length) return null;
    const idx = Math.min(activeStageIdx, unlocked, stages.length - 1);
    return stages[idx] || null;
  }, [stages, activeStageIdx, unlocked]);

  useEffect(() => {
    if (!activeStage || !payload) {
      onAskRef.current(null);
      return;
    }
    onAskRef.current({
      source: "handout",
      source_label: payload.sources.handout.label || "课程讲义",
      stage_id: activeStage.id,
      stage_title: activeStage.title,
      stage_content: activeStage.content,
      selection: selection || undefined,
    });
  }, [activeStage, selection, payload]);

  const onMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !docRef.current) {
      setSelection("");
      return;
    }
    if (!docRef.current.contains(sel.anchorNode)) {
      setSelection("");
      return;
    }
    const text = sel.toString().trim();
    setSelection(text.slice(0, 2000));
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-on-surface-variant">
        加载文档…
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-red-400 px-4 text-center">
        {error || "暂无文档"}
      </div>
    );
  }

  const stageLabel = stages.length
    ? `${Math.min(activeStageIdx + 1, stages.length)} / ${stages.length}`
    : "0 / 0";
  const canUnlockNext = unlocked < stages.length - 1;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-white/5 bg-surface-container-low/40">
        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto">
          {stages.map((st, i) => {
            const locked = i > unlocked;
            const active = i === activeStageIdx;
            return (
              <button
                key={st.id}
                type="button"
                disabled={locked}
                onClick={() => setActiveStageIdx(i)}
                className={`shrink-0 text-[11px] px-2 py-1 rounded-md border transition-colors ${
                  locked
                    ? "opacity-40 border-white/5 text-slate-600 cursor-not-allowed"
                    : active
                      ? "bg-primary/20 text-primary border-primary/40"
                      : "text-slate-400 border-white/10 hover:border-white/25"
                }`}
                title={locked ? "先完成前面的阶段" : st.title}
              >
                {i + 1}. {st.title.replace(/\*+/g, "").slice(0, 16)}
                {st.title.length > 16 ? "…" : ""}
              </button>
            );
          })}
        </div>

        <p className="shrink-0 text-[10px] text-slate-500 tabular-nums">{stageLabel}</p>
        <button
          type="button"
          disabled={!canUnlockNext}
          onClick={() => {
            const next = Math.min(stages.length - 1, unlocked + 1);
            setUnlocked(next);
            setActiveStageIdx(next);
          }}
          className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-md bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 disabled:opacity-40"
        >
          {canUnlockNext ? "下一阶段" : "已全部展开"}
        </button>
      </div>

      <div
        ref={docRef}
        onMouseUp={onMouseUp}
        className="relative flex-1 min-h-0 overflow-y-auto"
      >
        {activeStage ? (
          <article className="min-h-full px-6 py-6 sm:px-10 lg:px-12">
            <MarkdownRenderer
              variant="article"
              content={activeStage.content}
              onOpenInEditor={onOpenInEditor}
              onExplainSnippet={onExplainSnippet}
              explaining={explaining}
              activeFingerprint={activeFingerprint}
            />
            {reserveBottom ? <div className="h-52" aria-hidden /> : null}
          </article>
        ) : (
          <p className="text-sm text-slate-500 px-6 py-8">暂无阶段内容</p>
        )}

        {selection && (
          <div className="sticky bottom-3 mx-6 sm:mx-10 text-[11px] px-3 py-2 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-100 backdrop-blur-sm shadow-lg">
            已选中片段（提问时会带给 AI）：{selection.slice(0, 80)}
            {selection.length > 80 ? "…" : ""}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => setSelection("")}
            >
              清除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

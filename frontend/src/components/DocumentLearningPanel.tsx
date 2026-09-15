"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import {
  getChapterLearningDocs,
  getChapterKbDocStages,
  type DocStage,
  type LearningDocsPayload,
} from "@/lib/api";

export type DocSourceKind = "handout" | "knowledge_base";

export interface DocAskContext {
  source: DocSourceKind;
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
}

export function DocumentLearningPanel({
  chapterId,
  onAskContextChange,
  onOpenInEditor,
  onExplainSnippet,
  explaining,
  activeFingerprint,
}: Props) {
  const [payload, setPayload] = useState<LearningDocsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [source, setSource] = useState<DocSourceKind>("handout");
  const [kbDocId, setKbDocId] = useState<string>("");
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
        setSource("handout");
        const docs = data.sources.knowledge_base.documents || [];
        if (docs[0]) setKbDocId(docs[0].id);
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

  useEffect(() => {
    if (source !== "knowledge_base" || !kbDocId || !payload) return;
    let cancelled = false;
    async function loadKb() {
      try {
        const data = await getChapterKbDocStages(chapterId, kbDocId);
        if (cancelled) return;
        setStages(data.stages || []);
        setUnlocked(0);
        setActiveStageIdx(0);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载知识库文档失败");
        }
      }
    }
    loadKb();
    return () => {
      cancelled = true;
    };
  }, [source, kbDocId, chapterId, payload]);

  useEffect(() => {
    if (source === "handout" && payload) {
      setStages(payload.sources.handout.stages || []);
      setUnlocked(0);
      setActiveStageIdx(0);
    }
  }, [source, payload]);

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
      source,
      source_label:
        source === "handout"
          ? "课程讲义"
          : `知识库原文 · ${
              payload.sources.knowledge_base.documents.find((d) => d.id === kbDocId)
                ?.filename || ""
            }`,
      stage_id: activeStage.id,
      stage_title: activeStage.title,
      stage_content: activeStage.content,
      selection: selection || undefined,
    });
  }, [activeStage, source, selection, payload, kbDocId]);

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

  const kbAvailable = payload.sources.knowledge_base.available;
  const kbDocs = payload.sources.knowledge_base.documents || [];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-white/5 bg-surface-container-low/40">
        <button
          type="button"
          onClick={() => setSource("handout")}
          className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition-colors ${
            source === "handout"
              ? "bg-primary/20 text-primary border-primary/40"
              : "text-slate-400 border-white/10 hover:border-white/25"
          }`}
        >
          课程讲义
        </button>
        <button
          type="button"
          disabled={!kbAvailable}
          onClick={() => setSource("knowledge_base")}
          className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition-colors disabled:opacity-40 ${
            source === "knowledge_base"
              ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
              : "text-slate-400 border-white/10 hover:border-white/25"
          }`}
          title={kbAvailable ? "" : "本课程未绑定就绪知识库"}
        >
          知识库原文
        </button>

        {source === "knowledge_base" && kbDocs.length > 0 && (
          <select
            value={kbDocId}
            onChange={(e) => setKbDocId(e.target.value)}
            className="ml-auto max-w-[200px] text-xs bg-surface-container-low border border-white/10 rounded-lg px-2 py-1.5 outline-none"
          >
            {kbDocs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.filename}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-1 px-3 py-2 overflow-x-auto border-b border-white/5">
        {stages.map((st, i) => {
          const locked = i > unlocked;
          const active = i === activeStageIdx;
          return (
            <button
              key={st.id}
              type="button"
              disabled={locked}
              onClick={() => setActiveStageIdx(i)}
              className={`shrink-0 text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
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

      <div
        ref={docRef}
        onMouseUp={onMouseUp}
        className="flex-1 min-h-0 overflow-y-auto px-5 py-4"
      >
        {activeStage ? (
          <div className="rounded-xl ring-1 ring-primary/25 bg-primary/5 p-4">
            <MarkdownRenderer
              content={activeStage.content}
              onOpenInEditor={onOpenInEditor}
              onExplainSnippet={onExplainSnippet}
              explaining={explaining}
              activeFingerprint={activeFingerprint}
            />
          </div>
        ) : (
          <p className="text-sm text-slate-500">暂无阶段内容</p>
        )}

        {selection && (
          <div className="sticky bottom-2 mt-4 text-[11px] px-3 py-2 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-200">
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

      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-t border-white/5 bg-surface-container-low/30">
        <p className="text-[11px] text-slate-500">
          阶段 {stages.length ? Math.min(activeStageIdx + 1, stages.length) : 0} /{" "}
          {stages.length || 0}
          {activeStage ? ` · ${activeStage.title.replace(/\*+/g, "")}` : ""}
        </p>
        <button
          type="button"
          disabled={unlocked >= stages.length - 1}
          onClick={() => {
            const next = Math.min(stages.length - 1, unlocked + 1);
            setUnlocked(next);
            setActiveStageIdx(next);
          }}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 disabled:opacity-40"
        >
          {unlocked >= stages.length - 1 ? "已全部展开" : "下一阶段"}
        </button>
      </div>
    </div>
  );
}

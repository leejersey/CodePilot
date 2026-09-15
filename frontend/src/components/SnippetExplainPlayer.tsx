"use client";

import { useMemo, useState } from "react";
import { Player } from "@remotion/player";
import {
  SnippetExplainVideo,
  type SnippetBeat,
} from "./animations/SnippetExplainVideo";

export interface SnippetExplainData {
  type: "snippet_explain";
  title: string;
  takeaway?: string;
  language: string;
  code: string;
  run_output: string;
  has_error?: boolean;
  beats: Array<{
    id: string;
    duration_ms: number;
    narration: string;
    focus: string;
    highlight_lines?: number[];
  }>;
}

interface Props {
  data: SnippetExplainData;
  onClose?: () => void;
}

const FPS = 30;

export function SnippetExplainPlayer({ data, onClose }: Props) {
  const [expanded, setExpanded] = useState(true);

  const prepared = useMemo(() => {
    const beatsRaw = Array.isArray(data.beats) ? data.beats : [];
    let cursor = 0;
    const beats: SnippetBeat[] = beatsRaw.map((b, i) => {
      const durationFrames = Math.max(
        Math.round(FPS * 2.5),
        Math.round(((b.duration_ms || 4000) / 1000) * FPS)
      );
      const startFrame = cursor;
      cursor += durationFrames;
      return {
        id: b.id || `b${i}`,
        startFrame,
        durationFrames,
        narration: b.narration || "",
        focus: b.focus || "code",
        highlight_lines: Array.isArray(b.highlight_lines)
          ? b.highlight_lines.map(Number).filter((n) => n > 0)
          : [],
      };
    });
    return {
      title: data.title || "知识点讲解",
      takeaway: data.takeaway || "",
      language: data.language || "python",
      code: data.code || "",
      runOutput: data.run_output || "(无输出)",
      hasError: Boolean(data.has_error),
      beats,
      durationInFrames: Math.max(FPS * 8, cursor),
    };
  }, [data]);

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-primary/30 bg-[#050a16] shadow-[0_0_32px_rgba(83,221,252,0.12)]">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-black/40 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="material-symbols-outlined text-primary text-lg shrink-0"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            movie
          </span>
          <span className="text-sm font-medium text-on-surface truncate">
            {prepared.title}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30 shrink-0">
            单知识点 · 含运行结果
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="material-symbols-outlined text-sm">
              {expanded ? "close_fullscreen" : "open_in_full"}
            </span>
          </button>
          {onClose && (
            <button
              type="button"
              className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
              onClick={onClose}
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          )}
        </div>
      </div>

      <div
        className={`w-full bg-black transition-all duration-300 ${
          expanded ? "aspect-video" : "aspect-[2.2/1] max-h-[280px]"
        }`}
      >
        <Player
          component={SnippetExplainVideo}
          inputProps={{
            title: prepared.title,
            takeaway: prepared.takeaway,
            language: prepared.language,
            code: prepared.code,
            runOutput: prepared.runOutput,
            hasError: prepared.hasError,
            beats: prepared.beats,
          }}
          compositionWidth={960}
          compositionHeight={540}
          durationInFrames={prepared.durationInFrames}
          fps={FPS}
          style={{ width: "100%", height: "100%" }}
          controls
          autoPlay
          loop={false}
          clickToPlay
        />
      </div>
    </div>
  );
}

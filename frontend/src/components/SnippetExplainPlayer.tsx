"use client";

import { useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { Film, Maximize2, Minimize2, X } from "lucide-react";
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
    <div className="my-4 rounded-xl overflow-hidden border border-slate-200 dark:border-primary/30 bg-slate-50 dark:bg-[#050a16] shadow-xs dark:shadow-[0_0_32px_rgba(83,221,252,0.12)]">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white/80 dark:bg-black/40 border-b border-slate-200/80 dark:border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <Film className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {prepared.title}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30 shrink-0">
            单知识点 · 含运行结果
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "收起" : "展开"}
          >
            {expanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          {onClose && (
            <button
              type="button"
              className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
              onClick={onClose}
              title="关闭"
            >
              <X className="w-3.5 h-3.5" />
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

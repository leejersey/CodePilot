"use client";

import { useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { Film, Maximize2, Minimize2, X } from "lucide-react";
import {
  WalkthroughVideo,
  type WalkthroughVideoSegment,
} from "./animations/WalkthroughVideo";

export interface WalkthroughSegment {
  id: string;
  start_ms: number;
  duration_ms: number;
  highlight: string;
  narration: string;
}

export interface DocumentWalkthroughData {
  type: "document_walkthrough";
  title: string;
  description?: string;
  document_markdown: string;
  segments: WalkthroughSegment[];
}

interface Props {
  data: DocumentWalkthroughData;
  onClose?: () => void;
}

const FPS = 30;

function normalizeSegments(raw: WalkthroughSegment[]) {
  const list = [...raw].sort((a, b) => a.start_ms - b.start_ms);
  let cursor = 0;
  return list.map((s, i) => {
    const duration = Math.max(2500, Number(s.duration_ms) || 5000);
    const start = i === 0 ? 0 : Math.max(cursor, Number(s.start_ms) || cursor);
    cursor = start + duration;
    return {
      id: s.id || `s${i + 1}`,
      start_ms: start,
      duration_ms: duration,
      highlight: (s.highlight || "").trim(),
      narration: (s.narration || "").trim(),
    };
  });
}

function splitMarkdownBlocks(markdown: string): string[] {
  const parts = markdown.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function blockMatches(block: string, highlight: string): boolean {
  if (!highlight) return false;
  if (block.includes(highlight)) return true;
  const soft = highlight.trim();
  if (soft && block.includes(soft)) return true;
  const head = soft.split("\n")[0]?.trim().slice(0, 48);
  if (head && head.length >= 4 && block.includes(head)) return true;
  const plain = block.replace(/^#+\s*/, "").replace(/[*_`]/g, "");
  const hPlain = soft.replace(/^#+\s*/, "").replace(/[*_`]/g, "");
  return Boolean(hPlain && plain.includes(hPlain));
}

function mapBlockIndex(
  blocks: string[],
  segments: ReturnType<typeof normalizeSegments>,
  segIndex: number
): number {
  if (blocks.length === 0) return 0;
  const highlight = segments[segIndex]?.highlight || "";
  const found = blocks.findIndex((b) => blockMatches(b, highlight));
  if (found >= 0) return found;
  if (segments.length <= 1) return 0;
  return Math.min(
    blocks.length - 1,
    Math.round((segIndex / Math.max(1, segments.length - 1)) * (blocks.length - 1))
  );
}

export function DocumentWalkthrough({ data, onClose }: Props) {
  const [expanded, setExpanded] = useState(true);

  const prepared = useMemo(() => {
    const segments = normalizeSegments(data.segments || []);
    const blocks = splitMarkdownBlocks(data.document_markdown || "");
    const videoSegments: WalkthroughVideoSegment[] = segments.map((s, i) => ({
      id: s.id,
      startFrame: Math.round((s.start_ms / 1000) * FPS),
      durationFrames: Math.max(FPS, Math.round((s.duration_ms / 1000) * FPS)),
      narration: s.narration,
      blockIndex: mapBlockIndex(blocks, segments, i),
    }));
    // 保证帧连续
    let cursor = 0;
    for (const vs of videoSegments) {
      vs.startFrame = cursor;
      cursor += vs.durationFrames;
    }
    const durationInFrames = Math.max(FPS * 4, cursor);
    return {
      blocks,
      videoSegments,
      durationInFrames,
      title: data.title || "文档讲解",
      description: data.description || "",
    };
  }, [data]);

  const width = 960;
  const compositionHeight = 540;

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-slate-200 dark:border-primary/30 bg-slate-50 dark:bg-[#050a16] shadow-xs dark:shadow-[0_0_32px_rgba(83,221,252,0.12)]">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white/80 dark:bg-black/40 border-b border-slate-200/80 dark:border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <Film className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {prepared.title}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/25 shrink-0">
            Remotion 讲解片
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
          component={WalkthroughVideo}
          inputProps={{
            title: prepared.title,
            description: prepared.description,
            blocks: prepared.blocks,
            segments: prepared.videoSegments,
          }}
          compositionWidth={width}
          compositionHeight={compositionHeight}
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

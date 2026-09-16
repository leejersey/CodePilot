"use client";

import React, { useState } from "react";
import { Player } from "@remotion/player";
import { Clapperboard, Maximize2, Minimize2 } from "lucide-react";
import { SortingAnimation } from "./animations/SortingAnimation";
import { ConceptAnimation } from "./animations/ConceptAnimation";
import {
  DocumentWalkthrough,
  type DocumentWalkthroughData,
} from "./DocumentWalkthrough";
import {
  SnippetExplainPlayer,
  type SnippetExplainData,
} from "./SnippetExplainPlayer";

interface LegacyAnimationData {
  type: string;
  title: string;
  description?: string;
  config: { fps: number; durationInFrames: number };
  steps: Array<{
    frame: number;
    action: string;
    indices?: number[];
    label?: string;
  }>;
  data?: { values?: number[]; labels?: string[] };
}

interface AnimationPlayerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  animationData: any;
  onClose?: () => void;
}

function isSnippet(data: unknown): data is SnippetExplainData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.type === "snippet_explain" && typeof d.code === "string";
}

function isWalkthrough(data: unknown): data is DocumentWalkthroughData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.type === "document_walkthrough" && typeof d.document_markdown === "string";
}

export function AnimationPlayer({ animationData, onClose }: AnimationPlayerProps) {
  if (isSnippet(animationData)) {
    return <SnippetExplainPlayer data={animationData} onClose={onClose} />;
  }
  if (isWalkthrough(animationData)) {
    return <DocumentWalkthrough data={animationData} onClose={onClose} />;
  }
  return <LegacyRemotionPlayer animationData={animationData as LegacyAnimationData} />;
}

function LegacyRemotionPlayer({ animationData }: { animationData: LegacyAnimationData }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { type, title, description, config, steps, data } = animationData;

  const Component = () => {
    switch (type) {
      case "sorting":
      case "array":
        return (
          <SortingAnimation
            values={data?.values || [5, 3, 8, 1, 9, 2, 7]}
            steps={steps || []}
          />
        );
      default:
        return <ConceptAnimation steps={steps || []} title={title} />;
    }
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0a0f1e] shadow-xs dark:shadow-none">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-surface-container-low/50 border-b border-slate-200/80 dark:border-white/5">
        <div className="flex items-center gap-2">
          <Clapperboard className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
        </div>
        <button
          className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors p-1"
          onClick={() => setIsExpanded(!isExpanded)}
          title={isExpanded ? "收起" : "全屏展开"}
        >
          {isExpanded ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      {description && (
        <p className="px-4 py-2 text-xs text-slate-600 dark:text-slate-500 border-b border-slate-200/80 dark:border-white/5">{description}</p>
      )}
      <div className={`${isExpanded ? "h-[400px]" : "h-[260px]"} transition-all duration-300`}>
        <Player
          component={Component}
          compositionWidth={600}
          compositionHeight={isExpanded ? 400 : 260}
          durationInFrames={config?.durationInFrames || 150}
          fps={config?.fps || 30}
          style={{ width: "100%", height: "100%" }}
          controls
          loop
          autoPlay
        />
      </div>
    </div>
  );
}

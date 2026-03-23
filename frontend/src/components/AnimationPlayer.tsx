"use client";

import React, { useState } from "react";
import { Player } from "@remotion/player";
import { SortingAnimation } from "./animations/SortingAnimation";
import { ConceptAnimation } from "./animations/ConceptAnimation";

interface AnimationData {
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
  animationData: AnimationData;
}

export function AnimationPlayer({ animationData }: AnimationPlayerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { type, title, description, config, steps, data } = animationData;

  const Component = () => {
    switch (type) {
      case "sorting":
      case "array":
        return (
          <SortingAnimation
            values={data?.values || [5, 3, 8, 1, 9, 2, 7]}
            steps={steps}
          />
        );
      case "concept":
      case "flowchart":
      case "tree":
      default:
        return <ConceptAnimation steps={steps} title={title} />;
    }
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-white/10 bg-[#0a0f1e]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-container-low/50 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-primary text-lg"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            animation
          </span>
          <span className="text-sm font-medium text-on-surface">{title}</span>
        </div>
        <button
          className="text-slate-500 hover:text-slate-300 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className="material-symbols-outlined text-sm">
            {isExpanded ? "close_fullscreen" : "open_in_full"}
          </span>
        </button>
      </div>

      {/* Description */}
      {description && (
        <p className="px-4 py-2 text-xs text-slate-500 border-b border-white/5">
          {description}
        </p>
      )}

      {/* Player */}
      <div className={`${isExpanded ? "h-[400px]" : "h-[260px]"} transition-all duration-300`}>
        <Player
          component={Component}
          compositionWidth={600}
          compositionHeight={isExpanded ? 400 : 260}
          durationInFrames={config.durationInFrames || 150}
          fps={config.fps || 30}
          style={{ width: "100%", height: "100%" }}
          controls
          loop
          autoPlay
        />
      </div>
    </div>
  );
}

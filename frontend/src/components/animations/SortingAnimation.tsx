"use client";

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

interface Step {
  frame: number;
  action: string;
  indices?: number[];
  label?: string;
}

interface SortingAnimationProps {
  values: number[];
  steps: Step[];
}

export const SortingAnimation: React.FC<SortingAnimationProps> = ({
  values: initialValues,
  steps,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 根据当前帧计算数组状态
  const currentValues = [...initialValues];
  let activeIndices: number[] = [];
  let currentLabel = "";
  let swapIndices: number[] = [];

  for (const step of steps) {
    if (frame >= step.frame) {
      if (step.action === "swap" && step.indices && step.indices.length === 2) {
        const [i, j] = step.indices;
        [currentValues[i], currentValues[j]] = [currentValues[j], currentValues[i]];
        if (frame < step.frame + 15) swapIndices = step.indices;
      }
      if (step.action === "compare" && step.indices) {
        if (frame < step.frame + 15) activeIndices = step.indices;
      }
      if (step.action === "highlight" && step.indices) {
        if (frame < step.frame + 15) activeIndices = step.indices;
      }
      if (step.label && frame >= step.frame && frame < step.frame + 20) {
        currentLabel = step.label;
      }
    }
  }

  const maxVal = Math.max(...initialValues, 1);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0f1e",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', sans-serif",
        padding: 30,
      }}
    >
      {/* 步骤说明 */}
      <div
        style={{
          color: "#94a3b8",
          fontSize: 16,
          marginBottom: 30,
          height: 24,
          opacity: interpolate(currentLabel ? 1 : 0, [0, 1], [0, 1]),
          transition: "opacity 0.3s",
        }}
      >
        {currentLabel}
      </div>

      {/* 条形图 */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          height: 200,
        }}
      >
        {currentValues.map((val, i) => {
          const isActive = activeIndices.includes(i);
          const isSwapping = swapIndices.includes(i);
          const barHeight = (val / maxVal) * 160 + 20;

          const scale = spring({
            frame: isSwapping ? frame % 15 : 0,
            fps,
            config: { damping: 10, stiffness: 200 },
          });

          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 40,
                  height: barHeight,
                  borderRadius: 6,
                  background: isSwapping
                    ? "linear-gradient(to top, #f59e0b, #fbbf24)"
                    : isActive
                    ? "linear-gradient(to top, #06b6d4, #67e8f9)"
                    : "linear-gradient(to top, #334155, #475569)",
                  transform: `scaleY(${isSwapping ? scale : 1})`,
                  transformOrigin: "bottom",
                  transition: "background 0.2s, height 0.3s",
                  boxShadow: isActive ? "0 0 20px rgba(6,182,212,0.4)" : "none",
                }}
              />
              <span
                style={{
                  color: isActive || isSwapping ? "#67e8f9" : "#64748b",
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 400,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {val}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

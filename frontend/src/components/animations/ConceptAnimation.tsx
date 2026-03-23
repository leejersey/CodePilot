"use client";

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
} from "remotion";

interface Step {
  frame: number;
  action: string;
  indices?: number[];
  label?: string;
  text?: string;
}

interface ConceptAnimationProps {
  steps: Step[];
  title?: string;
}

export const ConceptAnimation: React.FC<ConceptAnimationProps> = ({
  steps,
  title,
}) => {
  const frame = useCurrentFrame();

  // 收集当前应显示的文本
  const visibleTexts: { label: string; opacity: number }[] = [];

  for (const step of steps) {
    if (step.action === "show_text" && step.label) {
      const appear = interpolate(
        frame,
        [step.frame, step.frame + 10],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      );
      if (appear > 0) {
        visibleTexts.push({ label: step.label, opacity: appear });
      }
    }
  }

  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0f1e",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        fontFamily: "'Inter', sans-serif",
        padding: 40,
        gap: 20,
      }}
    >
      {title && (
        <h2
          style={{
            color: "#67e8f9",
            fontSize: 24,
            fontWeight: 700,
            opacity: titleOpacity,
            transform: `translateY(${interpolate(titleOpacity, [0, 1], [20, 0])}px)`,
            marginBottom: 10,
          }}
        >
          {title}
        </h2>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
        {visibleTexts.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              opacity: item.opacity,
              transform: `translateX(${interpolate(item.opacity, [0, 1], [-20, 0])}px)`,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
                marginTop: 6,
                flexShrink: 0,
              }}
            />
            <span style={{ color: "#cbd5e1", fontSize: 16, lineHeight: 1.6 }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

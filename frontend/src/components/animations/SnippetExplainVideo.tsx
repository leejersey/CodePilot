"use client";

import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface SnippetBeat {
  id: string;
  durationFrames: number;
  startFrame: number;
  narration: string;
  focus: "title" | "code" | "console" | "takeaway" | string;
  highlight_lines: number[];
}

export interface SnippetExplainVideoProps {
  title: string;
  takeaway: string;
  language: string;
  code: string;
  runOutput: string;
  hasError: boolean;
  beats: SnippetBeat[];
}

function activeBeat(frame: number, beats: SnippetBeat[]): SnippetBeat | null {
  if (!beats.length) return null;
  for (let i = beats.length - 1; i >= 0; i--) {
    if (frame >= beats[i].startFrame) return beats[i];
  }
  return beats[0];
}

export const SnippetExplainVideo: React.FC<SnippetExplainVideoProps> = ({
  title,
  takeaway,
  language,
  code,
  runOutput,
  hasError,
  beats,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();
  const beat = activeBeat(frame, beats);
  const local = beat ? frame - beat.startFrame : 0;
  const enter = spring({
    frame: local,
    fps,
    config: { damping: 14, stiffness: 110 },
  });

  const lines = code.replace(/\n$/, "").split("\n");
  const hl = new Set(beat?.highlight_lines || []);
  const focus = beat?.focus || "title";

  const codeReveal = interpolate(local, [0, Math.min(20, (beat?.durationFrames || 30) * 0.4)], [0, 1], {
    extrapolateRight: "clamp",
  });
  const visibleLineCount =
    focus === "code"
      ? Math.max(1, Math.ceil(codeReveal * lines.length))
      : lines.length;

  const consoleChars = Math.floor(
    interpolate(
      local,
      [0, Math.min(45, Math.max(15, (beat?.durationFrames || 40) * 0.7))],
      [0, runOutput.length],
      { extrapolateRight: "clamp" }
    )
  );
  const consoleText =
    focus === "console" || focus === "takeaway"
      ? runOutput.slice(0, focus === "console" ? consoleChars : runOutput.length)
      : "";

  const progress = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;
  const flash = interpolate(local, [0, 3, 10], [0.25, 0.08, 0], {
    extrapolateRight: "clamp",
  });

  const captionOpacity = interpolate(enter, [0, 1], [0, 1]);
  const captionY = interpolate(enter, [0, 1], [36, 0]);

  const panelGlow = (active: boolean) =>
    active
      ? {
          border: "1px solid rgba(83,221,252,0.55)",
          boxShadow: "0 0 28px rgba(83,221,252,0.22)",
          opacity: 1,
          transform: `scale(${interpolate(enter, [0, 1], [0.98, 1])})`,
        }
      : {
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "none",
          opacity: 0.45,
          transform: "scale(1)",
        };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#050a16",
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "#e2e8f0",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse 55% 45% at 20% 15%, rgba(83,221,252,0.12), transparent 60%),
            radial-gradient(ellipse 45% 40% at 85% 75%, rgba(172,138,255,0.10), transparent 55%),
            #050a16
          `,
        }}
      />

      {/* Header */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(5,10,22,0.85)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 99,
              background: "#53ddfc",
              boxShadow: "0 0 10px #53ddfc",
            }}
          />
          <span style={{ color: "#53ddfc", fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>
            单知识点讲解
          </span>
          <span
            style={{
              ...panelGlow(focus === "title"),
              padding: "4px 10px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              maxWidth: width * 0.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              background: focus === "title" ? "rgba(83,221,252,0.12)" : "transparent",
            }}
          >
            {title}
          </span>
        </div>
        <span style={{ color: "#64748b", fontSize: 11 }}>{language}</span>
      </div>

      {/* Main stage: code + console */}
      <div
        style={{
          position: "absolute",
          top: 64,
          left: 24,
          right: 24,
          bottom: 118,
          display: "flex",
          gap: 14,
        }}
      >
        {/* Code panel */}
        <div
          style={{
            flex: 1.35,
            borderRadius: 14,
            background: "#0d1117",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            ...panelGlow(focus === "code"),
          }}
        >
          <div
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              color: "#94a3b8",
              fontSize: 11,
            }}
          >
            {language} · 代码
          </div>
          <div style={{ flex: 1, padding: "12px 14px", overflow: "hidden" }}>
            {lines.slice(0, visibleLineCount).map((line, i) => {
              const lineNo = i + 1;
              const on = hl.has(lineNo) && focus === "code";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 12,
                    fontSize: 13,
                    lineHeight: 1.55,
                    background: on ? "rgba(83,221,252,0.14)" : "transparent",
                    borderLeft: on ? "2px solid #53ddfc" : "2px solid transparent",
                    paddingLeft: 8,
                    marginBottom: 2,
                    color: on ? "#f8fafc" : "#94a3b8",
                  }}
                >
                  <span style={{ width: 22, color: "#475569", textAlign: "right", flexShrink: 0 }}>
                    {lineNo}
                  </span>
                  <span style={{ whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {line || " "}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Console panel */}
        <div
          style={{
            flex: 1,
            borderRadius: 14,
            background: "#000",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            ...panelGlow(focus === "console" || focus === "takeaway"),
          }}
        >
          <div
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              color: hasError ? "#f87171" : "#94a3b8",
              fontSize: 11,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>运行结果</span>
            <span>{hasError ? "ERROR" : "OK"}</span>
          </div>
          <div
            style={{
              flex: 1,
              padding: "14px 16px",
              fontSize: 13,
              lineHeight: 1.6,
              color: hasError ? "#fca5a5" : "#86efac",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            <span style={{ color: "#22d3ee" }}>$ run{"\n"}</span>
            {consoleText}
            {focus === "console" && consoleChars < runOutput.length ? (
              <span style={{ opacity: 0.7 }}>▌</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Takeaway 不再用浮层盖住画面；结论走底部旁白 */}

      {/* Narration lower-third */}
      <div
        style={{
          position: "absolute",
          left: 24,
          right: 24,
          bottom: 28,
          opacity: captionOpacity,
          transform: `translateY(${captionY}px)`,
        }}
      >
        <div
          style={{
            borderRadius: 12,
            padding: "12px 16px",
            background: "linear-gradient(90deg, rgba(12,24,48,0.96), rgba(24,16,40,0.94))",
            border:
              focus === "takeaway"
                ? "1px solid rgba(172,138,255,0.45)"
                : "1px solid rgba(83,221,252,0.25)",
            display: "flex",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 3,
              borderRadius: 4,
              background:
                focus === "takeaway"
                  ? "linear-gradient(180deg,#c4b5fd,#ac8aff)"
                  : "linear-gradient(180deg,#53ddfc,#ac8aff)",
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            {focus === "takeaway" && takeaway ? (
              <>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.2,
                    marginBottom: 4,
                    color: "#c4b5fd",
                    fontWeight: 700,
                  }}
                >
                  TAKEAWAY
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.45, fontWeight: 600, color: "#e9d5ff", marginBottom: 6 }}>
                  {takeaway}
                </div>
              </>
            ) : null}
            <div style={{ fontSize: 15, lineHeight: 1.45, fontWeight: 500 }}>
              {beat?.narration || ""}
            </div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: "rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: "linear-gradient(90deg,#53ddfc,#ac8aff)",
          }}
        />
      </div>

      <AbsoluteFill
        style={{
          pointerEvents: "none",
          backgroundColor: `rgba(83,221,252,${flash})`,
        }}
      />
    </AbsoluteFill>
  );
};

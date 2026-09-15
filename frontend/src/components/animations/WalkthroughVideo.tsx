"use client";

import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface WalkthroughVideoSegment {
  id: string;
  startFrame: number;
  durationFrames: number;
  narration: string;
  blockIndex: number;
}

export interface WalkthroughVideoProps {
  title: string;
  description?: string;
  blocks: string[];
  segments: WalkthroughVideoSegment[];
}

function stripMd(raw: string): { heading: boolean; text: string } {
  const t = raw.trim();
  const heading = /^#{1,3}\s+/.test(t);
  const text = t
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/, "").replace(/```$/, "").trim())
    .trim();
  return { heading, text };
}

function activeSegmentIndex(frame: number, segments: WalkthroughVideoSegment[]): number {
  if (!segments.length) return -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (frame >= segments[i].startFrame) return i;
  }
  return 0;
}

export const WalkthroughVideo: React.FC<WalkthroughVideoProps> = ({
  title,
  description,
  blocks,
  segments,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const segIdx = activeSegmentIndex(frame, segments);
  const seg = segIdx >= 0 ? segments[segIdx] : null;
  const blockIndex = seg
    ? Math.min(Math.max(0, seg.blockIndex), Math.max(0, blocks.length - 1))
    : 0;

  const localFrame = seg ? frame - seg.startFrame : frame;
  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 16, stiffness: 120 },
  });

  const captionY = interpolate(enter, [0, 1], [48, 0]);
  const captionOpacity = interpolate(enter, [0, 1], [0, 1], {
    extrapolateRight: "clamp",
  });

  // 切段闪白一下
  const flash = seg
    ? interpolate(localFrame, [0, 4, 12], [0.35, 0.12, 0], {
        extrapolateRight: "clamp",
      })
    : 0;

  // 背景缓慢漂移
  const drift = interpolate(frame, [0, durationInFrames], [0, 40], {
    extrapolateRight: "clamp",
  });

  const progress = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;

  const parsedBlocks = blocks.map(stripMd);

  // 文档「镜头」：把当前块滚到视觉中心
  const cardH = Math.round(height * 0.52);
  const rowH = 72;
  const targetScroll = Math.max(0, blockIndex * rowH - cardH * 0.28);
  const cameraY = (() => {
    if (!seg) return targetScroll;
    return interpolate(
      localFrame,
      [0, Math.min(18, Math.max(6, seg.durationFrames * 0.25))],
      [
        Math.max(0, (blockIndex > 0 ? blockIndex - 1 : 0) * rowH - cardH * 0.28),
        targetScroll,
      ],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
  })();

  const kenBurns = interpolate(
    localFrame,
    [0, Math.max(1, (seg?.durationFrames || 30) - 1)],
    [1, 1.04],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#050a16",
        fontFamily: "'JetBrains Mono', 'SF Pro Text', system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Ambient */}
      <div
        style={{
          position: "absolute",
          inset: -40,
          background: `
            radial-gradient(ellipse 60% 50% at ${30 + drift * 0.4}% 20%, rgba(83,221,252,0.14), transparent 60%),
            radial-gradient(ellipse 50% 40% at ${70 - drift * 0.3}% 80%, rgba(172,138,255,0.10), transparent 55%),
            linear-gradient(180deg, #07101f 0%, #050a16 100%)
          `,
        }}
      />

      {/* Top chrome */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(5,10,22,0.72)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#53ddfc",
              boxShadow: "0 0 12px rgba(83,221,252,0.8)",
            }}
          />
          <span style={{ color: "#53ddfc", fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>
            CODEPILOT · 讲解
          </span>
          <span style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600, maxWidth: width * 0.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </span>
        </div>
        <div
          style={{
            color: "#64748b",
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {String(Math.max(1, segIdx + 1)).padStart(2, "0")} / {String(Math.max(1, segments.length)).padStart(2, "0")}
        </div>
      </div>

      {/* Document stage */}
      <div
        style={{
          position: "absolute",
          top: 72,
          left: 36,
          right: 36,
          height: cardH,
          borderRadius: 16,
          border: "1px solid rgba(83,221,252,0.18)",
          background: "rgba(10,18,36,0.92)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
          overflow: "hidden",
          transform: `scale(${kenBurns})`,
          transformOrigin: "center center",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            transform: `translateY(${-cameraY}px)`,
          }}
        >
          {description ? (
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 14 }}>{description}</div>
          ) : null}
          {parsedBlocks.map((b, i) => {
            const active = i === blockIndex;
            const dist = Math.abs(i - blockIndex);
            const opacity = active ? 1 : Math.max(0.22, 1 - dist * 0.28);
            const scale = active ? interpolate(enter, [0, 1], [0.97, 1]) : 0.98;
            return (
              <div
                key={i}
                style={{
                  minHeight: rowH - 8,
                  marginBottom: 8,
                  padding: "12px 14px",
                  borderRadius: 12,
                  opacity,
                  transform: `scale(${scale})`,
                  background: active ? "rgba(83,221,252,0.12)" : "transparent",
                  border: active
                    ? "1px solid rgba(83,221,252,0.55)"
                    : "1px solid transparent",
                  boxShadow: active ? "0 0 28px rgba(83,221,252,0.22)" : "none",
                }}
              >
                <div
                  style={{
                    color: b.heading ? "#67e8f9" : active ? "#f1f5f9" : "#94a3b8",
                    fontSize: b.heading ? 18 : 14,
                    fontWeight: b.heading ? 700 : 450,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {b.text}
                </div>
              </div>
            );
          })}
          {parsedBlocks.length === 0 && (
            <div style={{ color: "#64748b", fontSize: 14 }}>暂无文档内容</div>
          )}
        </div>

        {/* Scanline / vignette */}
        <div
          style={{
            pointerEvents: "none",
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(5,10,22,0.35) 0%, transparent 12%, transparent 88%, rgba(5,10,22,0.55) 100%)",
          }}
        />
      </div>

      {/* Lower-third narration */}
      <div
        style={{
          position: "absolute",
          left: 36,
          right: 36,
          bottom: 52,
          opacity: captionOpacity,
          transform: `translateY(${captionY}px)`,
        }}
      >
        <div
          style={{
            borderRadius: 14,
            padding: "16px 20px",
            background: "linear-gradient(90deg, rgba(12,24,48,0.95), rgba(20,16,40,0.92))",
            border: "1px solid rgba(172,138,255,0.28)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
            display: "flex",
            gap: 14,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              width: 4,
              alignSelf: "stretch",
              borderRadius: 4,
              background: "linear-gradient(180deg, #53ddfc, #ac8aff)",
              minHeight: 36,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                color: "#a78bfa",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.5,
                marginBottom: 6,
                textTransform: "uppercase",
              }}
            >
              旁白
            </div>
            <div style={{ color: "#e2e8f0", fontSize: 16, lineHeight: 1.5, fontWeight: 500 }}>
              {seg?.narration || "…"}
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 4,
          background: "rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: "linear-gradient(90deg, #53ddfc, #ac8aff)",
            boxShadow: "0 0 12px rgba(83,221,252,0.5)",
          }}
        />
      </div>

      {/* Segment cut flash */}
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(83,221,252,${flash})`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

"use client";

import { useState, useEffect, useRef } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Props {
  content: string;
  /** 是否正在流式接收中 */
  isStreaming?: boolean;
}

/**
 * 步骤式动画组件
 * 将 AI 消息按段落拆分，每个段落带延迟的 fade-slide-in 动画
 */
export function StepAnimator({ content, isStreaming = false }: Props) {
  const [visibleCount, setVisibleCount] = useState(0);
  const prevBlockCount = useRef(0);

  // 按空行 / 标题 / 分割线拆分为逻辑步骤块
  const blocks = splitIntoBlocks(content);

  useEffect(() => {
    // 有新块出现时逐步显示
    if (blocks.length > prevBlockCount.current) {
      const newBlocks = blocks.length - prevBlockCount.current;
      prevBlockCount.current = blocks.length;

      // 快速依次显示新出现的块
      for (let i = 0; i < newBlocks; i++) {
        setTimeout(() => {
          setVisibleCount(prev => prev + 1);
        }, i * 120); // 每个块间隔 120ms
      }
    }
  }, [blocks.length]);

  // 流式传输中 → 最后一块实时显示（无动画延迟）
  return (
    <div className="space-y-0">
      {blocks.map((block, i) => {
        const isVisible = i < visibleCount;
        const isLastAndStreaming = isStreaming && i === blocks.length - 1;

        return (
          <div
            key={i}
            className={`transition-all duration-500 ease-out ${
              isVisible || isLastAndStreaming
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-3 h-0 overflow-hidden"
            }`}
            style={{
              transitionDelay: isVisible ? "0ms" : "0ms",
            }}
          >
            <MarkdownRenderer content={block} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * 将 Markdown 内容按逻辑段落拆分
 * 拆分规则：空行分隔 / 标题行 / 分割线 / 代码块
 */
function splitIntoBlocks(content: string): string[] {
  if (!content.trim()) return [];

  const lines = content.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    // 代码块边界
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        // 代码块结束
        current.push(line);
        blocks.push(current.join("\n"));
        current = [];
        inCodeBlock = false;
        continue;
      } else {
        // 代码块开始 — 先保存之前的内容
        if (current.length > 0) {
          blocks.push(current.join("\n"));
          current = [];
        }
        current.push(line);
        inCodeBlock = true;
        continue;
      }
    }

    if (inCodeBlock) {
      current.push(line);
      continue;
    }

    // 标题行 → 新的块
    if (/^#{1,4}\s/.test(line.trim())) {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
        current = [];
      }
      current.push(line);
      continue;
    }

    // 分割线 → 新的块
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
        current = [];
      }
      blocks.push(line);
      continue;
    }

    // 空行 → 段落分割
    if (line.trim() === "") {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
        current = [];
      }
      continue;
    }

    current.push(line);
  }

  // 最后剩余的内容
  if (current.length > 0) {
    blocks.push(current.join("\n"));
  }

  return blocks;
}

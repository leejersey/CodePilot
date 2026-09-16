"use client";

import { MarkdownRenderer } from "./MarkdownRenderer";

interface Props {
  content: string;
  /** 是否正在流式接收中 */
  isStreaming?: boolean;
  onOpenInEditor?: (code: string, language: string) => void;
  onExplainSnippet?: (payload: {
    code: string;
    language: string;
    context: string;
  }) => void;
  explaining?: boolean;
  activeFingerprint?: string | null;
}

/**
 * 步骤式动画组件
 * 将 AI 消息按段落拆分，每个段落带延迟的 fade-slide-in 动画
 */
export function StepAnimator({
  content,
  isStreaming = false,
  onOpenInEditor,
  onExplainSnippet,
  explaining,
  activeFingerprint,
}: Props) {
  // 按空行 / 标题 / 分割线拆分为逻辑步骤块
  const blocks = splitIntoBlocks(content);

  // 流式阶段保持布局稳定，不对持续增长的段落做高度或位移动画。
  if (isStreaming) {
    return (
      <MarkdownRenderer
        content={content}
        onOpenInEditor={onOpenInEditor}
        onExplainSnippet={onExplainSnippet}
        explaining={explaining}
        activeFingerprint={activeFingerprint}
      />
    );
  }

  return (
    <div className="space-y-0">
      {blocks.map((block, i) => (
        <div key={i}>
          <MarkdownRenderer
            content={block}
            onOpenInEditor={onOpenInEditor}
            onExplainSnippet={onExplainSnippet}
            explaining={explaining}
            activeFingerprint={activeFingerprint}
          />
        </div>
      ))}
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

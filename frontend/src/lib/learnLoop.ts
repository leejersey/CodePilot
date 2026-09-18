/** 章节学习闭环进度：讲 → 跑 → 练 → 完成 */

export type LearnLoopStepId = "chat" | "run" | "practice" | "complete";

export interface LearnLoopInput {
  hasChatted: boolean;
  hasRunCode: boolean;
  practiceTotal: number;
  practicePassed: number;
  chapterCompleted: boolean;
}

export interface LearnLoopStep {
  id: LearnLoopStepId;
  label: string;
  done: boolean;
  detail?: string;
}

export function buildLearnLoopSteps(input: LearnLoopInput): LearnLoopStep[] {
  const practiceDone =
    input.practiceTotal > 0
      ? input.practicePassed >= input.practiceTotal
      : false;
  return [
    {
      id: "chat",
      label: "对话学习",
      done: input.hasChatted,
    },
    {
      id: "run",
      label: "代码试跑",
      done: input.hasRunCode,
    },
    {
      id: "practice",
      label: "章节练习",
      done: practiceDone || (input.practiceTotal === 0 && input.chapterCompleted),
      detail:
        input.practiceTotal > 0
          ? `${input.practicePassed}/${input.practiceTotal}`
          : "暂无题目",
    },
    {
      id: "complete",
      label: "完成本章",
      done: input.chapterCompleted,
    },
  ];
}

export function nextLearnLoopHint(steps: LearnLoopStep[]): string {
  const next = steps.find((step) => !step.done);
  if (!next) return "本章学习闭环已完成，可从侧边栏进入下一章。";
  switch (next.id) {
    case "chat":
      return "下一步：在左侧与 AI 对话，或切换到文档模式阅读讲义。";
    case "run":
      return "下一步：把示例放进右侧沙箱，点「运行」验证理解。";
    case "practice":
      return "下一步：打开「章节练习」，用真实题目巩固。";
    case "complete":
      return "下一步：确认掌握后点击「完成本章」，解锁下一章。";
    default:
      return "";
  }
}

/** 长对话窗口：最近 N 轮可见 + 加载更早 + 大纲跳转。 */

export const CHAT_VISIBLE_TURNS = 12;
export const CHAT_LOAD_EARLIER_TURNS = 8;

export interface ChatOutlineItem {
  messageIndex: number;
  label: string;
}

/** 每一「轮」的起始下标：用户消息起一轮；若开头有助手/系统引导，也算一轮。 */
export function turnStartIndices(messages: Array<{ role: string }>): number[] {
  if (messages.length === 0) return [];
  const starts: number[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i].role === "user") starts.push(i);
  }
  if (starts.length === 0) return [0];
  if (starts[0] > 0) return [0, ...starts];
  return starts;
}

/** 默认只展示最近 visibleTurns 轮时的窗口起点。 */
export function autoWindowStart(
  messages: Array<{ role: string }>,
  visibleTurns: number = CHAT_VISIBLE_TURNS
): number {
  const starts = turnStartIndices(messages);
  if (starts.length <= visibleTurns) return 0;
  return starts[starts.length - visibleTurns] ?? 0;
}

/** 从当前窗口再往前展开 loadTurns 轮。 */
export function loadEarlierStart(
  messages: Array<{ role: string }>,
  currentStart: number,
  loadTurns: number = CHAT_LOAD_EARLIER_TURNS
): number {
  const starts = turnStartIndices(messages);
  if (starts.length === 0 || currentStart <= 0) return 0;
  let turnIdx = 0;
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i] <= currentStart) turnIdx = i;
  }
  return starts[Math.max(0, turnIdx - loadTurns)] ?? 0;
}

/** 保证 messageIndex 落入窗口（大纲跳转时用）。 */
export function ensureMessageVisibleStart(
  messages: Array<{ role: string }>,
  currentStart: number,
  messageIndex: number
): number {
  if (messageIndex < 0) return currentStart;
  if (messageIndex >= currentStart) return currentStart;
  const starts = turnStartIndices(messages);
  let turnStart = 0;
  for (const start of starts) {
    if (start <= messageIndex) turnStart = start;
  }
  return turnStart;
}

export function hiddenTurnCount(
  messages: Array<{ role: string }>,
  windowStart: number
): number {
  if (windowStart <= 0) return 0;
  return turnStartIndices(messages).filter((start) => start < windowStart).length;
}

export function outlineLabel(content: string, maxLen = 36): string {
  const line = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean) || "";
  const cleaned = line.replace(/\[已附\s*\d+\s*张图片\]/g, "").trim();
  if (!cleaned) return "（图片提问）";
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen)}…`;
}

export function buildChatOutline(
  messages: Array<{ role: string; content: string }>
): ChatOutlineItem[] {
  return messages
    .map((message, messageIndex) => ({ message, messageIndex }))
    .filter(({ message }) => message.role === "user")
    .map(({ message, messageIndex }) => ({
      messageIndex,
      label: outlineLabel(message.content),
    }));
}

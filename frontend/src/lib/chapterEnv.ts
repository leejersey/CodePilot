/** Per-chapter learner .env helpers (browser localStorage). */

const KEY_PREFIX = "codepilot.env.";

export function chapterEnvStorageKey(pathId: string, chapterId: string): string {
  return `${KEY_PREFIX}${pathId}.${chapterId}`;
}

export function readChapterEnv(pathId: string, chapterId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(chapterEnvStorageKey(pathId, chapterId)) || "";
  } catch {
    return "";
  }
}

export function writeChapterEnv(pathId: string, chapterId: string, content: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(chapterEnvStorageKey(pathId, chapterId), content);
  } catch {
    /* ignore quota */
  }
}

export function clearChapterEnv(pathId: string, chapterId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(chapterEnvStorageKey(pathId, chapterId));
  } catch {
    /* ignore */
  }
}

export function getEnvValue(dotenv: string, key: string): string {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "mi");
  const match = (dotenv || "").match(re);
  if (!match) return "";
  let value = (match[1] || "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

export function upsertEnvValue(dotenv: string, key: string, value: string): string {
  const lines = (dotenv || "").split(/\r?\n/);
  const re = new RegExp(`^\\s*${key}\\s*=`);
  let found = false;
  const next = lines.map((line) => {
    if (re.test(line)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) {
    const body = next.filter((l, i) => !(i === next.length - 1 && l === ""));
    body.push(`${key}=${value}`);
    return `${body.join("\n").replace(/\n+$/, "")}\n`;
  }
  return `${next.join("\n").replace(/\n+$/, "")}\n`;
}

export function hasDeepseekApiKey(dotenv: string): boolean {
  return getEnvValue(dotenv, "DEEPSEEK_API_KEY").trim().length > 0;
}

/** Skill copy that should surface the API key card. */
export function skillNeedsApiKey(skill: {
  title?: string | null;
  goal?: string | null;
  objectives?: string[] | null;
} | null): boolean {
  if (!skill) return false;
  const blob = [
    skill.title || "",
    skill.goal || "",
    ...(skill.objectives || []),
  ].join("\n").toLowerCase();
  return /环境配置|api\s*key|密钥|模型接入|init_chat_model|搭建.*环境/.test(blob);
}

export const DEFAULT_DOTENV_STUB = `# 学员自备密钥（仅用于「云端运行」，保存在本机浏览器）
# 推荐用下方「配置 API Key」卡片填写
DEEPSEEK_API_KEY=
`;

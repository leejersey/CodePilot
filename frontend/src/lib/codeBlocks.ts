/**
 * 从 Markdown 中提取 fenced 代码块，供右侧编辑器 Tab 绑定。
 */
import { normalizeLanguage } from "./languageRuntime";

export interface ExtractedCodeBlock {
  language: string;
  code: string;
  /** 稳定指纹，用于 Tab id */
  fingerprint: string;
}

const FENCE_RE = /```([a-zA-Z0-9_+-]*)[^\n]*\n([\s\S]*?)```/g;

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/** 与 Markdown 代码块共用的稳定指纹 */
export function fingerprintCode(language: string, code: string): string {
  return simpleHash(`${language.toLowerCase()}\n${code}`);
}

/** 过滤掉过短、几乎不可运行的示意块 */
export function isRunnableSnippet(code: string, language: string): boolean {
  const lines = code
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  // 至少 2 行，或单行但含可执行痕迹
  const joined = lines.join("\n");
  if (lines.length === 1) {
    return /^(print|console\.|def |class |function |const |let |var |if |for |while |return |#include|fn |package |<[\w!]|[@.#\w-]+\s*\{)/m.test(
      joined
    );
  }
  // 全是注释则跳过
  const commentOnly =
    (language === "python" && lines.every((l) => l.startsWith("#"))) ||
    (["javascript", "typescript", "java", "go", "rust", "cpp", "c"].includes(language) &&
      lines.every((l) => l.startsWith("//") || l.startsWith("/*") || l.startsWith("*")));
  if (commentOnly) return false;
  return true;
}

export function extractCodeBlocks(markdown: string): ExtractedCodeBlock[] {
  const blocks: ExtractedCodeBlock[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(FENCE_RE);
  while ((m = re.exec(markdown)) !== null) {
    const language = normalizeLanguage(m[1] || "text");
    const code = m[2].replace(/\n$/, "");
    if (!code.trim()) continue;
    if (language === "text" || language === "plain" || language === "markdown" || language === "md") {
      continue;
    }
    if (!isRunnableSnippet(code, language)) continue;
    blocks.push({
      language,
      code,
      fingerprint: fingerprintCode(language, code),
    });
  }
  return blocks;
}

export function defaultFilename(language: string, index: number): string {
  const map: Record<string, string> = {
    python: "py",
    javascript: "js",
    typescript: "ts",
    java: "java",
    go: "go",
    rust: "rs",
    cpp: "cpp",
    c: "c",
    csharp: "cs",
    kotlin: "kt",
    swift: "swift",
    ruby: "rb",
    php: "php",
    bash: "sh",
    html: "html",
    css: "css",
    react: "jsx",
    vue: "vue",
  };
  const ext = map[language] || "txt";
  return `代码${index + 1}.${ext}`;
}

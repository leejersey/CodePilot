export type ExecutionMode = "pyodide" | "web" | "remote";

const LANGUAGE_ALIASES: Record<string, string> = {
  py: "python",
  python3: "python",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  "c++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  golang: "go",
  rb: "ruby",
  sh: "bash",
  shell: "bash",
  htm: "html",
  // 前端框架标签：同步沙箱 / 预览时落到可执行语言
  vue: "html",
  vue3: "html",
  react: "javascript",
};

export function normalizeLanguage(language: string): string {
  const value = language.trim().toLowerCase();
  return LANGUAGE_ALIASES[value] || value || "text";
}

export function detectLanguageHint(text: string): string | null {
  const value = text.toLowerCase();
  if (/\bhtml5?\b|超文本|页面骨架/.test(value)) return "html";
  if (/\bcss3?\b|样式表|页面样式/.test(value)) return "css";
  if (/\btypescript\b/.test(value)) return "typescript";
  if (/\bjavascript\b|\bnode(?:\.js|js)?\b|\breact\b|\bvue\b|\bnext(?:\.js|js)?\b/.test(value)) return "javascript";
  if (/\bpython\b|\bdjango\b|\bflask\b|\bfastapi\b|\bpytest\b/.test(value)) return "python";
  if (/\bgolang\b|(^|[^a-z])go([^a-z]|$)/.test(value)) return "go";
  if (/\brust\b/.test(value)) return "rust";
  if (/c\+\+|\bcpp\b/.test(value)) return "cpp";
  if (/c#|\bcsharp\b|\.net\b/.test(value)) return "csharp";
  if (/\bjava\b/.test(value)) return "java";
  if (/\bkotlin\b/.test(value)) return "kotlin";
  if (/\bswift\b/.test(value)) return "swift";
  if (/\bruby\b/.test(value)) return "ruby";
  if (/\bphp\b/.test(value)) return "php";
  if (/\bbash\b|\bshell\b/.test(value)) return "bash";
  if (/前端|frontend|front-end/.test(value)) return "javascript";
  return null;
}

export function inferLearningLanguage(
  pathTopic: string,
  chapterTitle: string,
  chapterSummary = ""
): string {
  return detectLanguageHint(`${chapterTitle}\n${chapterSummary}`)
    || detectLanguageHint(pathTopic)
    || "python";
}

export function executionModeForLanguage(language: string): ExecutionMode {
  const normalized = normalizeLanguage(language);
  if (normalized === "python") return "pyodide";
  // 前端章节的 JS 面向 DOM，走浏览器预览；远程 Judge0 没有页面可渲染。
  if (normalized === "html" || normalized === "css" || normalized === "javascript") {
    return "web";
  }
  return "remote";
}

export interface WebPreviewFile {
  language: string;
  code: string;
}

/** 编辑器语言标成 js/ts，但内容其实是完整 HTML 文档时也能识别。 */
export function looksLikeHtmlDocument(code: string): boolean {
  const sample = code.slice(0, 800).toLowerCase();
  return /<!doctype\s+html\b/.test(sample) || /<html[\s>]/.test(sample);
}

export function buildWebPreviewDocument(files: WebPreviewFile[]): string {
  const normalized = files.map((file) => ({
    language: normalizeLanguage(file.language),
    code: file.code,
  }));
  if (normalized.length === 0) {
    return '<!doctype html><html><head><meta charset="utf-8"></head><body><main class="preview"><h1>网页预览</h1></main></body></html>';
  }

  // files[0] 约定为当前活动标签：多份完整 HTML 时必须预览当前页，而不是第一份历史标签。
  const primary = normalized[0];
  const htmlDocument =
    looksLikeHtmlDocument(primary.code) || primary.language === "html"
      ? primary
      : normalized.find((file) => looksLikeHtmlDocument(file.code))
        || normalized.find((file) => file.language === "html")
        || null;

  const html =
    htmlDocument?.code
    || '<main class="preview"><h1>网页预览</h1><p>当前 CSS / JavaScript 将应用到这个示例页面。</p></main>';

  const companions = normalized.filter((file) => file !== htmlDocument);
  const css = companions
    .filter((file) => file.language === "css" && !looksLikeHtmlDocument(file.code))
    .map((file) => file.code)
    .join("\n");

  const javascript = companions
    .filter(
      (file) =>
        (file.language === "javascript" || file.language === "typescript")
        && !looksLikeHtmlDocument(file.code)
    )
    .map((file) => file.code)
    .join("\n")
    .replace(/<\/script/gi, "<\\/script");

  const styleTag = css ? `<style>${css}</style>` : "";
  const scriptTag = javascript ? `<script>${javascript}</script>` : "";

  if (/<html[\s>]/i.test(html) || /<!doctype\s+html\b/i.test(html)) {
    let document = html;
    if (styleTag) {
      document = /<\/head>/i.test(document)
        ? document.replace(/<\/head>/i, `${styleTag}</head>`)
        : `${styleTag}${document}`;
    }
    if (scriptTag) {
      document = /<\/body>/i.test(document)
        ? document.replace(/<\/body>/i, `${scriptTag}</body>`)
        : `${document}${scriptTag}`;
    }
    return document;
  }
  return `<!doctype html><html><head><meta charset="utf-8">${styleTag}</head><body>${html}${scriptTag}</body></html>`;
}

import JSZip from "jszip";

export interface ChapterCodeTab {
  label: string;
  language: string;
  code: string;
}

export function safeArchiveName(value: string): string {
  const basename = value.split(/[\\/]/).pop()?.trim() || "";
  return basename
    .replace(/[<>:"：|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "") || "chapter-code";
}

function uniqueFilename(label: string, used: Set<string>): string {
  const safe = safeArchiveName(label);
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const extension = dot > 0 ? safe.slice(dot) : "";
  let candidate = safe;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${stem}-${suffix}${extension}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function buildChapterArchive(options: {
  chapterTitle: string;
  language: string;
  tabs: ChapterCodeTab[];
  exportedAt?: Date;
}): Promise<Uint8Array> {
  const zip = new JSZip();
  const used = new Set<string>(["readme.md"]);
  const files = options.tabs.map((tab) => {
    const filename = uniqueFilename(tab.label, used);
    zip.file(filename, tab.code);
    return { filename, language: tab.language };
  });
  const exportedAt = options.exportedAt || new Date();
  zip.file(
    "README.md",
    [
      `# ${options.chapterTitle}`,
      "",
      `- 课程语言：${options.language}`,
      `- 导出时间：${exportedAt.toISOString()}`,
      `- 文件数量：${files.length}`,
      "",
      "## 文件",
      "",
      ...files.map((file) => `- \`${file.filename}\` (${file.language})`),
      "",
    ].join("\n"),
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

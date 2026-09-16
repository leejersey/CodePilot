import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

import { buildChapterArchive, safeArchiveName } from "./chapterExport.ts";

test("safeArchiveName removes paths and unsafe characters", () => {
  assert.equal(safeArchiveName("../../第一章 / demo"), "demo");
  assert.equal(safeArchiveName("数组：入门"), "数组-入门");
});

test("buildChapterArchive keeps every tab and resolves duplicate names", async () => {
  const archive = await buildChapterArchive({
    chapterTitle: "数组入门",
    language: "python",
    exportedAt: new Date("2026-09-16T00:00:00Z"),
    tabs: [
      { label: "main.py", language: "python", code: "print(1)" },
      { label: "main.py", language: "python", code: "print(2)" },
    ],
  });
  const zip = await JSZip.loadAsync(archive);

  assert.equal(await zip.file("main.py")?.async("string"), "print(1)");
  assert.equal(await zip.file("main-2.py")?.async("string"), "print(2)");
  assert.match(await zip.file("README.md")!.async("string"), /数组入门/);
});

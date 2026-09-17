import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWebPreviewDocument,
  executionModeForLanguage,
  inferLearningLanguage,
  normalizeLanguage,
} from "./languageRuntime.ts";

test("normalizes common language aliases", () => {
  assert.equal(normalizeLanguage("py"), "python");
  assert.equal(normalizeLanguage("JSX"), "javascript");
  assert.equal(normalizeLanguage("C++"), "cpp");
  assert.equal(normalizeLanguage("C#"), "csharp");
});

test("selects browser preview for web documents", () => {
  assert.equal(executionModeForLanguage("html"), "web");
  assert.equal(executionModeForLanguage("css"), "web");
  assert.equal(executionModeForLanguage("javascript"), "web");
  assert.equal(executionModeForLanguage("python"), "pyodide");
  assert.equal(executionModeForLanguage("go"), "remote");
});

test("chapter language takes priority over a broad learning path topic", () => {
  assert.equal(inferLearningLanguage("前端入门", "3. JavaScript — 让页面动起来"), "javascript");
  assert.equal(inferLearningLanguage("前端入门", "1. HTML — 搭建页面骨架"), "html");
  assert.equal(inferLearningLanguage("前端入门", "2. CSS — 给页面化妆"), "css");
  assert.equal(inferLearningLanguage("全栈开发", "Python 核心语法"), "python");
});

test("combines html css and javascript into a preview document", () => {
  const document = buildWebPreviewDocument([
    { language: "html", code: "<h1>Hello</h1>" },
    { language: "css", code: "h1 { color: red; }" },
    { language: "javascript", code: "document.body.dataset.ready = 'yes';" },
  ]);

  assert.match(document, /<h1>Hello<\/h1>/);
  assert.match(document, /h1 \{ color: red; \}/);
  assert.match(document, /dataset\.ready/);
});

test("a full html document pasted into a javascript tab still previews as a page", () => {
  const source = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8" /><title>原生 JS 计数器</title></head>
<body>
  <p id="num">0</p>
  <button id="btn">+1</button>
  <script>
    let count = 0;
    document.querySelector("#btn").addEventListener("click", () => {
      count += 1;
      document.querySelector("#num").textContent = String(count);
    });
  </script>
</body>
</html>`;

  const document = buildWebPreviewDocument([
    { language: "javascript", code: source },
  ]);

  assert.match(document, /id="num"/);
  assert.match(document, /id="btn"/);
  assert.match(document, /let count = 0/);
  assert.doesNotMatch(document, /<script><!DOCTYPE html>/i);
  assert.doesNotMatch(document, /网页预览/);
});

test("preview prefers the active html tab instead of an earlier sibling demo", () => {
  const first = `<!DOCTYPE html><html><body><h1>打开控制台看看</h1></body></html>`;
  const third = `<!DOCTYPE html>
<html><body>
  <p id="num">0</p>
  <button id="btn">+1</button>
</body></html>`;

  const document = buildWebPreviewDocument([
    { language: "html", code: third },
    { language: "html", code: first },
  ]);

  assert.match(document, /id="num"/);
  assert.match(document, /id="btn"/);
  assert.doesNotMatch(document, /打开控制台看看/);
});

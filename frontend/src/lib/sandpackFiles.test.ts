import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSandpackFiles,
} from "./sandpackFiles.ts";

test("maps a react tab into /App.js", () => {
  const files = buildSandpackFiles(
    [{ label: "App.jsx", language: "react", code: "export default function App(){return <div/>}" }],
    "react"
  );
  assert.match(files["/App.js"], /function App/);
});

test("maps vue SFC into /src/App.vue", () => {
  const files = buildSandpackFiles(
    [{
      label: "App.vue",
      language: "vue",
      code: "<template><h1>Hi</h1></template>",
    }],
    "vue"
  );
  assert.equal(files["/src/App.vue"], "<template><h1>Hi</h1></template>");
});

test("active tab always becomes the vue entry even when named 代码1.vue", () => {
  const files = buildSandpackFiles(
    [
      {
        label: "代码1.vue",
        language: "vue",
        code: "<template><h2>我的购物清单</h2></template>",
      },
      {
        label: "App.vue",
        language: "vue",
        code: "<template><h1>Hello Vue</h1></template>",
      },
    ],
    "vue"
  );
  assert.match(files["/src/App.vue"], /我的购物清单/);
  assert.doesNotMatch(files["/src/App.vue"], /Hello Vue/);
});

test("active react tab wins over scratch App", () => {
  const files = buildSandpackFiles(
    [
      { label: "代码1.jsx", language: "react", code: "export default function App(){return <b>A</b>}" },
      { label: "App.jsx", language: "react", code: "export default function App(){return <b>Hello</b>}" },
    ],
    "react"
  );
  assert.match(files["/App.js"], /<b>A<\/b>/);
});

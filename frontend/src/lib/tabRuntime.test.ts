import assert from "node:assert/strict";
import test from "node:test";

import { pickCloudProvider, resolveTabExecution } from "./tabRuntime.ts";

test("tag wins over heuristics", () => {
  assert.equal(
    resolveTabExecution({
      language: "python",
      code: "import langchain\n",
      tag: "browser",
    }).mode,
    "pyodide"
  );
});

test("langchain import → cloud", () => {
  assert.equal(
    resolveTabExecution({
      language: "python",
      code: "from langchain.chat_models import init_chat_model\n",
    }).mode,
    "cloud"
  );
});

test("vue → sandpack", () => {
  assert.equal(
    resolveTabExecution({ language: "vue", code: "<template></template>" }).mode,
    "sandpack"
  );
});

test("plain python → pyodide", () => {
  assert.equal(
    resolveTabExecution({ language: "python", code: "print(1)\n" }).mode,
    "pyodide"
  );
});

test("pickCloudProvider uses default when keyed", () => {
  assert.equal(
    pickCloudProvider({
      defaultProvider: "modal",
      modalConfigured: true,
      daytonaConfigured: false,
    }),
    "modal"
  );
});

test("pickCloudProvider uses sole keyed when default missing key", () => {
  assert.equal(
    pickCloudProvider({
      defaultProvider: null,
      modalConfigured: true,
      daytonaConfigured: false,
    }),
    "modal"
  );
});

test("pickCloudProvider returns null when unmet", () => {
  assert.equal(
    pickCloudProvider({
      defaultProvider: "modal",
      modalConfigured: false,
      daytonaConfigured: false,
    }),
    null
  );
});

test("pickCloudProvider uses daytona when default and keyed", () => {
  assert.equal(
    pickCloudProvider({
      defaultProvider: "daytona",
      modalConfigured: false,
      daytonaConfigured: true,
    }),
    "daytona"
  );
});

test("pickCloudProvider uses sole daytona when default missing key", () => {
  assert.equal(
    pickCloudProvider({
      defaultProvider: "modal",
      modalConfigured: false,
      daytonaConfigured: true,
    }),
    "daytona"
  );
});

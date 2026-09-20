import assert from "node:assert/strict";
import test from "node:test";

import {
  getEnvValue,
  hasDeepseekApiKey,
  skillNeedsApiKey,
  upsertEnvValue,
} from "./chapterEnv.ts";

test("upsert and read DEEPSEEK_API_KEY", () => {
  const next = upsertEnvValue("FOO=1\n", "DEEPSEEK_API_KEY", "sk-abc");
  assert.equal(getEnvValue(next, "DEEPSEEK_API_KEY"), "sk-abc");
  assert.equal(hasDeepseekApiKey(next), true);
});

test("skillNeedsApiKey matches env-related skills", () => {
  assert.equal(
    skillNeedsApiKey({
      title: "搭建 LangChain v1.x 环境与模型接入",
      goal: "独立完成安装与对话模型连通",
    }),
    true
  );
  assert.equal(
    skillNeedsApiKey({ title: "用 Prompt 模板组织消息角色", goal: "会写 ChatPromptTemplate" }),
    false
  );
  assert.equal(
    skillNeedsApiKey({ title: "理解 LangChain 的定位", goal: "一句话说明框架职责" }),
    false
  );
});

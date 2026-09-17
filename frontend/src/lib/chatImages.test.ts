import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAT_IMAGE_MAX_COUNT,
  composeUserMessageText,
  defaultImagePrompt,
  isAllowedChatImageMime,
  parseDataUrl,
} from "./chatImages.ts";

test("allows common screenshot mime types", () => {
  assert.equal(isAllowedChatImageMime("image/jpeg"), true);
  assert.equal(isAllowedChatImageMime("image/png"), true);
  assert.equal(isAllowedChatImageMime("image/webp"), true);
  assert.equal(isAllowedChatImageMime("application/pdf"), false);
});

test("composeUserMessageText keeps user text and marks attachments", () => {
  assert.equal(composeUserMessageText("帮我看这个报错", 2), "帮我看这个报错\n\n[已附 2 张图片]");
  assert.match(composeUserMessageText("", 1), /请分析/);
  assert.equal(composeUserMessageText("仅文字", 0), "仅文字");
});

test("default prompt mentions image count", () => {
  assert.match(defaultImagePrompt(1), /这张/);
  assert.match(defaultImagePrompt(3), /3张/);
});

test("parseDataUrl validates data urls", () => {
  assert.deepEqual(
    parseDataUrl("data:image/png;base64,aaa"),
    { mime: "image/png", ok: true }
  );
  assert.equal(parseDataUrl("https://example.com/a.png").ok, false);
});

test("demo caps at four images", () => {
  assert.equal(CHAT_IMAGE_MAX_COUNT, 4);
});

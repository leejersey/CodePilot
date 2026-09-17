import assert from "node:assert/strict";
import test from "node:test";

import { safeReturnPath } from "./authNavigation.ts";

test("safeReturnPath preserves internal protected routes", () => {
  assert.equal(
    safeReturnPath("/learn/path-id/chapter-id?mode=doc"),
    "/learn/path-id/chapter-id?mode=doc",
  );
});

test("safeReturnPath rejects external and protocol-relative redirects", () => {
  assert.equal(safeReturnPath("https://evil.example"), "/");
  assert.equal(safeReturnPath("//evil.example/path"), "/");
  assert.equal(safeReturnPath("/\\evil.example/path"), "/");
  assert.equal(safeReturnPath("/auth/login"), "/");
});

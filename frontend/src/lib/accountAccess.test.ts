import assert from "node:assert/strict";
import test from "node:test";

import { isRealAccount, needsRealAccount, shouldOfferSignIn } from "./accountAccess.ts";

const anonymous = { auth_provider: "anonymous" };
const member = { auth_provider: "email" };

test("account-scoped routes reject an anonymous session", () => {
  for (const pathname of [
    "/dashboard",
    "/settings",
    "/settings/account",
    "/settings/llm",
    "/settings/usage",
    "/history",
    "/learn",
    "/creator/courses",
    "/creator/knowledge",
    "/admin",
    "/admin/courses",
  ]) {
    assert.equal(needsRealAccount(pathname), true, pathname);
  }
});

test("public and anonymous-trial routes stay reachable without an account", () => {
  for (const pathname of [
    "/",
    "/auth/login",
    "/courses",
    "/courses/course-one",
    // 匿名试用：匿名会话拥有的旧学习路径必须继续可访问。
    "/learn/path-one",
    "/learn/path-one/chapter-one",
    "/exercise/exercise-one",
  ]) {
    assert.equal(needsRealAccount(pathname), false, pathname);
  }
});

test("a route prefix must not leak access to a sibling route", () => {
  assert.equal(needsRealAccount("/learner"), false);
  assert.equal(needsRealAccount("/administration"), false);
  assert.equal(needsRealAccount("/creator"), true);
});

test("sign-in is offered to visitors and anonymous sessions but not to members", () => {
  assert.equal(shouldOfferSignIn(null), true);
  assert.equal(shouldOfferSignIn(anonymous), true);
  assert.equal(shouldOfferSignIn(member), false);
  assert.equal(shouldOfferSignIn(undefined), true);
});

test("only a real account is treated as already signed in on the login page", () => {
  // 与 /auth/login 的自动跳转条件一致：匿名会话必须能停在登录页。
  assert.equal(isRealAccount(anonymous), false);
  assert.equal(isRealAccount(member), true);
  assert.equal(isRealAccount(null), false);
});

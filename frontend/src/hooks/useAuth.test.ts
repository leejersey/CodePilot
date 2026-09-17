import assert from "node:assert/strict";
import test from "node:test";

import { deriveAuthFlags, useAuth } from "./useAuth.ts";


class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}


function jwt(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}


function resetAuth(storage: MemoryStorage) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { search: "" } },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  useAuth.setState({
    token: null,
    user: null,
    loading: true,
    isAdmin: false,
    isSuperAdmin: false,
    isCreator: false,
  });
}


test("creator capability includes creator and administrative roles", () => {
  assert.deepEqual(deriveAuthFlags("learner"), {
    isAdmin: false,
    isSuperAdmin: false,
    isCreator: false,
  });
  assert.equal(deriveAuthFlags("creator").isCreator, true);
  assert.equal(deriveAuthFlags("admin").isCreator, true);
  assert.equal(deriveAuthFlags("super_admin").isCreator, true);
});


test("init renews a rejected signed anonymous session once", async () => {
  const storage = new MemoryStorage();
  storage.setItem("codepilot_token", jwt({ token_kind: "anonymous" }));
  resetAuth(storage);
  const calls: string[] = [];
  const renewedUser = {
    id: "new-anonymous",
    email: null,
    nickname: "Learner",
    avatar_url: null,
    auth_provider: "anonymous",
    role: "learner",
    status: "active",
  };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/api/v1/auth/me")) {
      return { ok: false } as Response;
    }
    return {
      ok: true,
      json: async () => ({ access_token: "renewed-token", user: renewedUser }),
    } as Response;
  }) as typeof fetch;

  await useAuth.getState().init();

  assert.deepEqual(calls.map((url) => url.split("/api/v1")[1]), [
    "/auth/me",
    "/auth/anonymous",
  ]);
  assert.equal(storage.getItem("codepilot_token"), "renewed-token");
  assert.equal(useAuth.getState().user?.id, "new-anonymous");
});


test("init preserves rejected real-login behavior without anonymous fallback", async () => {
  const storage = new MemoryStorage();
  storage.setItem("codepilot_token", jwt({ token_kind: "access" }));
  resetAuth(storage);
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return { ok: false } as Response;
  }) as typeof fetch;

  await useAuth.getState().init();

  assert.equal(calls, 1);
  assert.equal(storage.getItem("codepilot_token"), null);
  assert.equal(useAuth.getState().user, null);
});


test("anonymous renewal failure stops without retry loop", async () => {
  const storage = new MemoryStorage();
  storage.setItem("codepilot_token", jwt({ token_kind: "anonymous" }));
  resetAuth(storage);
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return { ok: false } as Response;
  }) as typeof fetch;

  await useAuth.getState().init();

  assert.equal(calls, 2);
  assert.equal(useAuth.getState().loading, false);
  assert.equal(useAuth.getState().user, null);
});

import assert from "node:assert/strict";
import test from "node:test";

import { getAuthHeaders } from "./api.ts";


class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}


function installStorage(storage: MemoryStorage) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}


test("API headers never send unsigned anonymous identity fallback", () => {
  installStorage(new MemoryStorage());

  assert.deepEqual(getAuthHeaders(), {
    "Content-Type": "application/json",
  });
  assert.equal("X-Anonymous-ID" in getAuthHeaders(), false);
});


test("API headers authenticate anonymous and real users only by signed token", () => {
  const storage = new MemoryStorage();
  storage.setItem("codepilot_token", "server-signed-token");
  installStorage(storage);

  assert.deepEqual(getAuthHeaders(false), {
    Authorization: "Bearer server-signed-token",
  });
});

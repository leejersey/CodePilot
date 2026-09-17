"use client";

import { create } from "zustand";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface User {
  id: string;
  email: string | null;
  nickname: string;
  avatar_url: string | null;
  auth_provider: string;
  role: "learner" | "creator" | "admin" | "super_admin";
  status: "active" | "disabled";
}

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isCreator: boolean;

  /** 初始化：从 localStorage 恢复 token 并获取用户信息 */
  init: () => Promise<void>;
  /** 注册 */
  register: (email: string, password: string, nickname: string) => Promise<void>;
  /** 登录 */
  login: (email: string, password: string) => Promise<void>;
  /** 修改密码并刷新当前 Token */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** 退出 */
  logout: () => void;
  /** 获取 Authorization Header */
  authHeader: () => Record<string, string>;
}

let authInitPromise: Promise<void> | null = null;

export function deriveAuthFlags(role?: User["role"] | null) {
  return {
    isAdmin: role === "admin" || role === "super_admin",
    isSuperAdmin: role === "super_admin",
    isCreator:
      role === "creator" || role === "admin" || role === "super_admin",
  };
}

function authenticatedState(user: User | null | undefined) {
  return { user: user || null, ...deriveAuthFlags(user?.role) };
}

function tokenKind(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized)).token_kind ?? null;
  } catch {
    return null;
  }
}

export const useAuth = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,
  isCreator: false,

  init: async () => {
    if (authInitPromise) return authInitPromise;
    authInitPromise = (async () => {
      let saved = typeof window !== "undefined" ? localStorage.getItem("codepilot_token") : null;
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get("token");
        if (urlToken) {
          localStorage.setItem("codepilot_token", urlToken);
          saved = urlToken;
        }
      }
      try {
        if (!saved) {
          const anonymousResponse = await fetch(`${API_BASE}/api/v1/auth/anonymous`, {
            method: "POST",
          });
          if (!anonymousResponse.ok) throw new Error("匿名会话创建失败");
          const data = await anonymousResponse.json();
          localStorage.setItem("codepilot_token", data.access_token);
          set({
            ...authenticatedState(data.user),
            token: data.access_token,
            loading: false,
          });
          return;
        }
        const savedTokenKind = tokenKind(saved);
        set({ token: saved });
        const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${saved}` },
        });
        if (res.ok) {
          const user = await res.json();
          set({
            ...authenticatedState(user),
            token: saved,
            loading: false,
          });
        } else {
          localStorage.removeItem("codepilot_token");
          set({ token: null, loading: false, ...authenticatedState(null) });
          if (savedTokenKind === "anonymous") {
            const anonymousResponse = await fetch(`${API_BASE}/api/v1/auth/anonymous`, {
              method: "POST",
            });
            if (!anonymousResponse.ok) return;
            const data = await anonymousResponse.json();
            localStorage.setItem("codepilot_token", data.access_token);
            set({
              ...authenticatedState(data.user),
              token: data.access_token,
              loading: false,
            });
          }
        }
      } catch {
        set({ token: null, loading: false, ...authenticatedState(null) });
      }
    })();
    try {
      await authInitPromise;
    } finally {
      authInitPromise = null;
    }
  },

  register: async (email, password, nickname) => {
    const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, nickname }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "注册失败");
    }
    const data = await res.json();
    localStorage.setItem("codepilot_token", data.access_token);
    set({
      token: data.access_token,
      loading: false,
      ...authenticatedState(data.user),
    });
  },

  login: async (email, password) => {
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "登录失败");
    }
    const data = await res.json();
    localStorage.setItem("codepilot_token", data.access_token);
    set({
      token: data.access_token,
      loading: false,
      ...authenticatedState(data.user),
    });
  },

  changePassword: async (currentPassword, newPassword) => {
    const { token } = get();
    if (!token) throw new Error("请先登录");
    const res = await fetch(`${API_BASE}/api/v1/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "修改密码失败");
    }
    const data = await res.json();
    localStorage.setItem("codepilot_token", data.access_token);
    set({
      token: data.access_token,
      ...authenticatedState(data.user),
    });
  },

  logout: () => {
    localStorage.removeItem("codepilot_token");
    set({ token: null, ...authenticatedState(null) });
  },

  authHeader: () => {
    const { token } = get();
    if (token) return { Authorization: `Bearer ${token}` };
    return {} as Record<string, string>;
  },
}));

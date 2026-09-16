"use client";

import { create } from "zustand";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface User {
  id: string;
  email: string | null;
  nickname: string;
  avatar_url: string | null;
  auth_provider: string;
  role: "learner" | "admin" | "super_admin";
  status: "active" | "disabled";
}

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;

  /** 初始化：从 localStorage 恢复 token 并获取用户信息 */
  init: () => Promise<void>;
  /** 注册 */
  register: (email: string, password: string, nickname: string) => Promise<void>;
  /** 登录 */
  login: (email: string, password: string) => Promise<void>;
  /** 退出 */
  logout: () => void;
  /** 获取 Authorization Header */
  authHeader: () => Record<string, string>;
}

export const useAuth = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,

  init: async () => {
    let saved = typeof window !== "undefined" ? localStorage.getItem("codepilot_token") : null;
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get("token");
      if (urlToken) {
        localStorage.setItem("codepilot_token", urlToken);
        saved = urlToken;
      }
    }
    if (!saved) {
      set({ loading: false, isAdmin: false, isSuperAdmin: false });
      return;
    }
    set({ token: saved });
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${saved}` },
      });
      if (res.ok) {
        const user = await res.json();
        set({
          user,
          token: saved,
          loading: false,
          isAdmin: user.role === "admin" || user.role === "super_admin",
          isSuperAdmin: user.role === "super_admin",
        });
      } else {
        // Token 过期或无效
        localStorage.removeItem("codepilot_token");
        set({ token: null, user: null, loading: false, isAdmin: false, isSuperAdmin: false });
      }
    } catch {
      set({ loading: false });
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
      user: data.user,
      loading: false,
      isAdmin: data.user?.role === "admin" || data.user?.role === "super_admin",
      isSuperAdmin: data.user?.role === "super_admin",
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
      user: data.user,
      loading: false,
      isAdmin: data.user?.role === "admin" || data.user?.role === "super_admin",
      isSuperAdmin: data.user?.role === "super_admin",
    });
  },

  logout: () => {
    localStorage.removeItem("codepilot_token");
    set({ token: null, user: null, isAdmin: false, isSuperAdmin: false });
  },

  authHeader: () => {
    const { token } = get();
    if (token) return { Authorization: `Bearer ${token}` };
    return {} as Record<string, string>;
  },
}));

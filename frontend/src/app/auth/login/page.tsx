"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { login, register, user, init } = useAuth();

  useEffect(() => { init(); }, [init]);
  useEffect(() => { if (user) router.push("/"); }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, nickname || "Learner");
      }
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-secondary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <a href="/" className="text-3xl font-bold tracking-tighter text-primary font-headline inline-block">
            CodePilot
          </a>
          <p className="text-on-surface-variant mt-2 text-sm">AI 编程学习平台</p>
        </div>

        {/* Card */}
        <div className="glass-panel bg-surface-container/60 backdrop-blur-xl rounded-3xl border border-white/5 shadow-2xl p-8">
          {/* Tabs */}
          <div className="flex bg-surface-container-low rounded-xl p-1 mb-6">
            <button
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 ${
                mode === "login"
                  ? "bg-primary/20 text-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
              onClick={() => { setMode("login"); setError(""); }}
            >
              登录
            </button>
            <button
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 ${
                mode === "register"
                  ? "bg-primary/20 text-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
              onClick={() => { setMode("register"); setError(""); }}
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nickname (register only) */}
            {mode === "register" && (
              <div>
                <label className="block text-xs text-on-surface-variant mb-1.5 font-medium">昵称</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">person</span>
                  <input
                    type="text"
                    placeholder="你的昵称"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    className="w-full bg-surface-container-low border border-white/5 rounded-xl pl-10 pr-4 py-3 text-sm text-on-surface placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/30 transition-all"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 font-medium">邮箱</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">mail</span>
                <input
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-surface-container-low border border-white/5 rounded-xl pl-10 pr-4 py-3 text-sm text-on-surface placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/30 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 font-medium">密码</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">lock</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder={mode === "register" ? "至少 6 位密码" : "输入密码"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-surface-container-low border border-white/5 rounded-xl pl-10 pr-4 py-3 text-sm text-on-surface placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/30 transition-all"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">
                <span className="material-symbols-outlined text-base">error</span>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-primary to-secondary text-surface font-bold py-3 rounded-xl hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-surface/30 border-t-surface rounded-full animate-spin" />
                  处理中...
                </span>
              ) : mode === "login" ? "登录" : "创建账户"}
            </button>
          </form>

          {/* Footer hint */}
          <p className="text-center text-xs text-slate-600 mt-6">
            {mode === "login" ? "还没有账户？" : "已有账户？"}
            <button
              className="text-primary hover:underline ml-1"
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            >
              {mode === "login" ? "立即注册" : "去登录"}
            </button>
          </p>
        </div>

        {/* Skip */}
        <div className="text-center mt-4">
          <a href="/" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
            跳过登录，匿名体验 →
          </a>
        </div>
      </div>
    </div>
  );
}

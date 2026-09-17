"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { User, Mail, Lock, AlertCircle, Loader2, Code2, ArrowRight, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { isRealAccount } from "@/lib/accountAccess";
import { safeReturnPath } from "@/lib/authNavigation";

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
  useEffect(() => {
    // 匿名签发会话不算已登录：否则点「登录」会立刻被弹回首页。
    if (!isRealAccount(user)) return;
    const returnTo = safeReturnPath(
      new URLSearchParams(window.location.search).get("returnTo")
    );
    router.replace(returnTo);
  }, [user, router]);

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
      const returnTo = safeReturnPath(
        new URLSearchParams(window.location.search).get("returnTo")
      );
      router.replace(returnTo);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-[#060e20] text-on-background px-4 py-12 relative overflow-hidden transition-colors duration-200">
      {/* Top action bar */}
      <header className="absolute top-6 left-6 right-6 flex items-center justify-between z-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur-md shadow-xs transition-all"
        >
          <ArrowLeft size={14} />
          返回首页
        </Link>
        <ThemeToggle />
      </header>

      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none hero-grid opacity-25 dark:opacity-20" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-500/10 dark:bg-cyan-500/10 rounded-full blur-3xl animate-pulse pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse pointer-events-none" style={{ animationDelay: "1s" }} />

      <div className="relative w-full max-w-md z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 dark:bg-cyan-500/10 border border-sky-500/20 dark:border-cyan-500/20 flex items-center justify-center text-sky-600 dark:text-cyan-400 group-hover:scale-105 transition-transform shadow-xs">
              <Code2 className="w-5 h-5" />
            </div>
            <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 font-headline">
              Code<span className="text-primary">Pilot</span>
            </span>
          </Link>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-xs font-mono">下一代 AI 编程交互学习工作台</p>
        </div>

        {/* Card */}
        <div className="bg-white/90 dark:bg-surface-container-high/40 backdrop-blur-2xl rounded-3xl border border-slate-200/90 dark:border-white/10 shadow-xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-8">
          {/* Tabs */}
          <div className="flex bg-slate-100 dark:bg-slate-900/80 rounded-xl p-1 mb-6 border border-slate-200 dark:border-white/5">
            <button
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === "login"
                  ? "bg-white dark:bg-gradient-to-r dark:from-cyan-500 dark:to-primary text-sky-700 dark:text-slate-950 font-bold shadow-xs dark:shadow-md border border-slate-200 dark:border-transparent"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              onClick={() => { setMode("login"); setError(""); }}
            >
              账户登录
            </button>
            <button
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === "register"
                  ? "bg-white dark:bg-gradient-to-r dark:from-cyan-500 dark:to-primary text-sky-700 dark:text-slate-950 font-bold shadow-xs dark:shadow-md border border-slate-200 dark:border-transparent"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              onClick={() => { setMode("register"); setError(""); }}
            >
              快速注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nickname (register only) */}
            {mode === "register" && (
              <div>
                <label className="block text-xs text-slate-700 dark:text-slate-300 mb-1.5 font-medium">个性昵称</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    placeholder="输入你的技术昵称"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition-all"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs text-slate-700 dark:text-slate-300 mb-1.5 font-medium">电子邮箱</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs text-slate-700 dark:text-slate-300 mb-1.5 font-medium">访问密码</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder={mode === "register" ? "设置至少 6 位安全密码" : "输入密码"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition-all"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-sky-600 hover:bg-sky-500 dark:bg-gradient-to-r dark:from-cyan-500 dark:to-primary text-white dark:text-slate-950 font-bold py-3 rounded-xl shadow-sm hover:shadow-md dark:shadow-[0_0_20px_rgba(6,182,212,0.3)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>处理中...</span>
                </>
              ) : (
                <>
                  <span>{mode === "login" ? "立即登录" : "创建极客账户"}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer hint */}
          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-6">
            {mode === "login" ? "还没有账户？" : "已有账户？"}
            <button
              className="text-sky-600 dark:text-cyan-400 hover:underline ml-1 font-semibold transition-colors"
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            >
              {mode === "login" ? "立即注册" : "去登录"}
            </button>
          </p>
        </div>

        {/* Skip */}
        <div className="text-center mt-5">
          <Link href="/" className="text-xs text-slate-500 hover:text-sky-600 dark:hover:text-cyan-400 transition-colors inline-flex items-center gap-1 font-mono">
            <span>跳过登录，匿名体验基础功能</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}


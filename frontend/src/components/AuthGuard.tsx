"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import { Lock, Compass, Code2, BarChart3, LogIn, Loader2 } from "lucide-react";

/**
 * 登录鉴权守卫：包裹需要登录才能访问的页面。
 * - 加载中显示加载动画
 * - 未登录显示引导登录界面
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, init } = useAuth();
  const router = useRouter();

  useEffect(() => { init(); }, [init]);

  // 加载中
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-on-background transition-colors duration-200">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-xs text-slate-500 font-mono">正在验证登录态...</p>
        </div>
      </div>
    );
  }

  // 未登录 → 展示引导登录界面
  if (!user) {
    return (
      <>
        <Header />
        <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4 pt-20 bg-background text-on-background transition-colors duration-200">
          <div className="text-center max-w-md mx-auto p-8 rounded-3xl bg-white/80 dark:bg-surface-container/40 border border-slate-200/80 dark:border-white/5 shadow-xl dark:shadow-2xl">
            {/* 图标 */}
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Lock className="w-8 h-8" />
            </div>

            {/* 标题 */}
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2 font-headline">
              登录后解锁完整功能
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-6 leading-relaxed">
              登录 CodePilot 账户以访问个性化路线、实时编码沙箱判题与全站技能图谱。学习进度将在云端实时同步。
            </p>

            {/* 功能亮点 */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { icon: Compass, label: "成长路线" },
                { icon: Code2, label: "沙箱演练" },
                { icon: BarChart3, label: "技能图谱" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-white/5"
                  >
                    <Icon className="w-5 h-5 text-primary" />
                    <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">{item.label}</span>
                  </div>
                );
              })}
            </div>

            {/* 按钮组 */}
            <div className="flex flex-col gap-3">
              <Link
                href="/auth/login"
                className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-primary text-white font-bold py-3 px-6 rounded-xl hover:shadow-[0_0_20px_rgba(2,132,199,0.25)] active:scale-[0.98] transition-all"
              >
                <LogIn className="w-4 h-4" />
                立即登录 / 注册
              </Link>
              <button
                onClick={() => router.push("/")}
                className="text-xs text-slate-500 hover:text-primary transition-colors py-1.5"
              >
                返回平台首页
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return <>{children}</>;
}

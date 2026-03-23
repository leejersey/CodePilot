"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/layout/Header";
import Link from "next/link";

/**
 * 登录鉴权守卫：包裹需要登录才能访问的页面。
 * - 加载中显示加载动画
 * - 未登录显示引导登录界面
 * - 已登录正常渲染子组件
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, init } = useAuth();
  const router = useRouter();

  useEffect(() => { init(); }, [init]);

  // 加载中
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-on-surface-variant">加载中...</p>
        </div>
      </div>
    );
  }

  // 未登录 → 展示引导登录界面
  if (!user) {
    return (
      <>
      <Header />
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4 pt-20">
        <div className="text-center max-w-md mx-auto">
          {/* 图标 */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-primary">lock</span>
          </div>

          {/* 标题 */}
          <h2 className="text-2xl font-bold text-on-surface mb-3 font-headline">
            登录后解锁完整功能
          </h2>
          <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">
            登录 CodePilot 账户以访问个性化学习路线、练习记录和学习数据统计。<br />
            你的学习进度将自动同步保存。
          </p>

          {/* 功能亮点 */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { icon: "route", label: "学习路线" },
              { icon: "code", label: "编程练习" },
              { icon: "analytics", label: "数据分析" },
            ].map((item) => (
              <div
                key={item.icon}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-surface-container-low/50 border border-white/5"
              >
                <span className="material-symbols-outlined text-xl text-primary/70">{item.icon}</span>
                <span className="text-xs text-on-surface-variant">{item.label}</span>
              </div>
            ))}
          </div>

          {/* 按钮组 */}
          <div className="flex flex-col gap-3">
            <Link
              href="/auth/login"
              className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-secondary text-surface font-bold py-3 px-6 rounded-xl hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] transition-all duration-200"
            >
              <span className="material-symbols-outlined text-lg">login</span>
              登录 / 注册
            </Link>
            <button
              onClick={() => router.push("/")}
              className="text-sm text-slate-500 hover:text-slate-300 transition-colors py-2"
            >
              返回首页
            </button>
          </div>
        </div>
      </div>
      </>
    );
  }

  // 已登录 → 正常渲染
  return <>{children}</>;
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/layout/Header";
import { AuthGuard } from "@/components/AuthGuard";
import { ArrowLeft, PenLine } from "lucide-react";

/**
 * 创作者守卫：需先登录，且角色为 creator / admin / super_admin。
 */
export function CreatorGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, init, isCreator } = useAuth();
  const router = useRouter();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <AuthGuard>
      {loading || !user ? null : !isCreator ? (
        <>
          <Header />
          <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4 pt-20 bg-background text-on-background transition-colors duration-200">
            <div className="text-center max-w-md mx-auto p-8 rounded-3xl bg-white/80 dark:bg-surface-container/40 border border-slate-200/80 dark:border-white/5 shadow-xl dark:shadow-2xl">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary">
                <PenLine className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2 font-headline">
                需要创作者权限
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6 leading-relaxed">
                课程创作台仅向创作者开放。你仍可以在课程中心浏览并学习已发布课程，如需创作课程请联系管理员为账号开通创作者权限。
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => router.push("/courses")}
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-primary text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all hover:opacity-90 shadow-[0_0_20px_rgba(6,182,212,0.2)]"
                >
                  去课程中心
                </button>
                <button
                  onClick={() => router.push("/")}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-sm text-slate-600 dark:text-slate-400 transition-colors hover:text-primary"
                >
                  <ArrowLeft className="w-4 h-4" />
                  返回首页
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>{children}</>
      )}
    </AuthGuard>
  );
}

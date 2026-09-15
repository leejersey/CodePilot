"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/layout/Header";
import { AuthGuard } from "@/components/AuthGuard";

/**
 * 管理员守卫：需先登录，且 role === admin。
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, init } = useAuth();
  const router = useRouter();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <AuthGuard>
      {loading || !user ? null : user.role !== "admin" ? (
        <>
          <Header />
          <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4 pt-20">
            <div className="text-center max-w-md mx-auto">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-red-400">admin_panel_settings</span>
              </div>
              <h2 className="text-2xl font-bold text-on-surface mb-3 font-headline">需要管理员权限</h2>
              <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">
                知识库由管理员维护。若你应有权限，请确认账号邮箱已加入 ADMIN_EMAILS 后重新登录。
              </p>
              <button
                onClick={() => router.push("/")}
                className="inline-flex items-center justify-center gap-2 bg-primary/15 hover:bg-primary/25 text-primary px-6 py-3 rounded-xl text-sm font-medium border border-primary/20 transition-all"
              >
                返回首页
              </button>
            </div>
          </div>
        </>
      ) : (
        <>{children}</>
      )}
    </AuthGuard>
  );
}

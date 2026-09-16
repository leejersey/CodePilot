"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/layout/Header";
import { AuthGuard } from "@/components/AuthGuard";
import { ShieldAlert, ArrowLeft } from "lucide-react";

/**
 * 管理员守卫：需先登录，且 role === admin。
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, init, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <AuthGuard>
      {loading || !user ? null : !isAdmin ? (
        <>
          <Header />
          <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4 pt-20 bg-[#070b14]">
            <div className="text-center max-w-md mx-auto p-8 rounded-3xl bg-surface-container/40 border border-white/5 shadow-2xl">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-100 mb-2 font-headline">需要管理员权限</h2>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                此页面属于平台后台管理，请联系超级管理员为你的账号分配权限。
              </p>
              <button
                onClick={() => router.push("/")}
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-primary text-slate-950 font-bold px-6 py-2.5 rounded-xl text-sm transition-all hover:opacity-90 shadow-[0_0_20px_rgba(6,182,212,0.2)]"
              >
                <ArrowLeft className="w-4 h-4" />
                返回平台首页
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

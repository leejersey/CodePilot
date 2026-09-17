"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { isRealAccount, needsRealAccount } from "@/lib/accountAccess";
import { Loader2 } from "lucide-react";

/**
 * 登录鉴权守卫：包裹需要登录才能访问的页面。
 * - 加载中显示加载动画
 * - 未登录显示引导登录界面
 *
 * 匿名签名会话可以继续试用自己的旧学习路径，但账号页面必须是真实账号。
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, init } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const authorized = needsRealAccount(pathname) ? isRealAccount(user) : Boolean(user);

  useEffect(() => { init(); }, [init]);
  useEffect(() => {
    if (loading || authorized) return;
    const currentPath = `${pathname}${window.location.search}`;
    router.replace(`/auth/login?returnTo=${encodeURIComponent(currentPath)}`);
  }, [authorized, loading, pathname, router]);

  if (loading || !authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-on-background transition-colors duration-200">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-xs text-slate-500 font-mono">
            {loading ? "正在验证登录态..." : "正在前往登录页面..."}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

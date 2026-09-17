"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { isRealAccount, needsRealAccount } from "@/lib/accountAccess";
import { isPublicRoute, toLoginWithReturnTo } from "@/lib/courseExperience";

export function RouteAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, init } = useAuth();
  // 匿名会话不是账号：账号页面必须放行到登录，否则守卫永远不会触发。
  const authorized = needsRealAccount(pathname) ? isRealAccount(user) : Boolean(user);
  const isPublic = isPublicRoute(pathname);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (isPublic || loading || authorized) return;
    router.replace(
      toLoginWithReturnTo(`${pathname}${window.location.search}`)
    );
  }, [authorized, isPublic, loading, pathname, router]);

  if (!isPublic && (loading || !authorized)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

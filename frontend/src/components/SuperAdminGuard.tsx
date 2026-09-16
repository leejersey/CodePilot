"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

export function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const { loading, user, isSuperAdmin } = useAuth();

  if (loading || !user) return null;
  if (isSuperAdmin) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md rounded-3xl border border-white/[0.07] bg-surface-container/40 p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
          <ShieldAlert size={27} />
        </div>
        <h1 className="font-headline text-xl font-bold text-white">需要超级管理员权限</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          普通管理员可以管理平台内容，但不能查看或修改账号权限。
        </p>
        <Link
          href="/admin"
          className="mt-6 inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:border-primary/30 hover:text-primary"
        >
          返回管理概览
        </Link>
      </div>
    </div>
  );
}

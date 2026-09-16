"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { AdminGuard } from "@/components/AdminGuard";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/ThemeToggle";

const navItems = [
  { label: "管理概览", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "知识库管理", href: "/admin/knowledge", icon: BookOpen },
  { label: "练习管理", href: "/admin/exercises", icon: ClipboardList },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isSuperAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleNavItems = isSuperAdmin
    ? [...navItems, { label: "账号管理", href: "/admin/users", icon: Users }]
    : navItems;

  const sidebar = (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#081126] transition-colors duration-200">
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 dark:border-white/[0.07] px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
          <Sparkles size={17} className="text-primary" />
        </div>
        <div>
          <p className="font-headline text-sm font-bold text-slate-900 dark:text-white">CodePilot</p>
          <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">ADMIN CONSOLE</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        <p className="px-3 pb-2 pt-2 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-slate-600">
          管理模块
        </p>
        {visibleNavItems.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all ${
                active
                  ? "border-primary/25 bg-primary/10 font-semibold text-primary shadow-xs"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <item.icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-slate-200 dark:border-white/[0.07] p-3">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft size={17} />
          返回前台
        </Link>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.025] px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
            <ShieldCheck size={15} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
              {user?.nickname || "管理员"}
            </p>
            <p className="truncate text-[10px] text-slate-500 dark:text-slate-600">{user?.email}</p>
            <p className="mt-0.5 text-[9px] font-mono uppercase tracking-wide text-primary">
              {user?.role === "super_admin" ? "超级管理员" : "管理员"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-50 dark:bg-[#060e20] text-slate-900 dark:text-slate-100 transition-colors duration-200">
        <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{sidebar}</div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="关闭后台导航"
              className="absolute inset-0 bg-black/40 dark:bg-black/65 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <div className="relative h-full w-64">{sidebar}</div>
          </div>
        )}

        <div className="min-h-screen lg:pl-64">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 dark:border-white/[0.07] bg-white/80 dark:bg-[#060e20]/90 px-4 backdrop-blur-xl sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white lg:hidden"
                onClick={() => setMobileOpen((value) => !value)}
              >
                {mobileOpen ? <X size={19} /> : <Menu size={19} />}
              </button>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">后台管理</p>
                <p className="hidden text-[10px] text-slate-500 sm:block">
                  知识库与练习内容统一管理
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-transparent px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 transition-colors hover:border-primary/40 hover:text-primary shadow-xs dark:shadow-none"
              >
                <ArrowLeft size={13} />
                返回前台
              </Link>
            </div>
          </header>
          <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </AdminGuard>
  );
}

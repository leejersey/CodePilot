"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  Code2,
  Compass,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { CommandMenu } from "./CommandMenu";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Header() {
  const { user, init, logout, loading, isAdmin } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initDone = useRef(false);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    init();
  }, [init]);

  // 全局快捷键 Cmd+K / Ctrl+K 监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandMenuOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 点击外部关闭菜单
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const navItems = [
    { label: "学习路径", href: "/learn", icon: Compass },
    ...(isAdmin
      ? [
          { label: "后台管理", href: "/admin", icon: ShieldCheck },
        ]
      : []),
    { label: "练习", href: "/exercises", icon: Code2 },
    { label: "仪表盘", href: "/dashboard", icon: LayoutDashboard },
  ];

  return (
    <>
      <header className="fixed top-0 w-full flex justify-between items-center px-6 py-3.5 bg-white/80 dark:bg-[#060e20]/80 backdrop-blur-xl z-40 shadow-xs dark:shadow-[0_8px_32px_rgba(6,14,32,0.8)] border-b border-slate-200/80 dark:border-white/[0.06] transition-colors duration-200">
        {/* Logo & Navigation */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary/20 to-secondary/20 dark:from-primary/30 dark:to-secondary/30 border border-primary/40 flex items-center justify-center text-primary group-hover:scale-105 transition-transform shadow-[0_0_15px_rgba(2,132,199,0.2)] dark:shadow-[0_0_15px_rgba(83,221,252,0.3)]">
              <Sparkles size={16} className="text-primary" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-headline">
              Code<span className="text-primary">Pilot</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 font-headline text-sm tracking-wide">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition-all duration-200 ${
                    isActive
                      ? "text-primary bg-primary/10 border border-primary/20 shadow-[0_0_15px_rgba(2,132,199,0.1)] dark:shadow-[0_0_15px_rgba(83,221,252,0.1)]"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  <item.icon size={15} className={isActive ? "text-primary" : "text-slate-500 dark:text-slate-400"} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Quick Command Trigger */}
          <button
            onClick={() => setCommandMenuOpen(true)}
            className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 dark:bg-surface-container-low/70 dark:hover:bg-surface-container-high/80 border border-slate-200/80 dark:border-white/10 hover:border-primary/40 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 text-xs transition-all shadow-xs group"
          >
            <Search size={14} className="group-hover:text-primary transition-colors" />
            <span>快速搜索...</span>
            <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[10px] font-mono text-slate-500 dark:text-slate-400 group-hover:border-primary/30">
              ⌘K
            </kbd>
          </button>

          {/* Theme Switcher Toggle */}
          <ThemeToggle />

          {/* History */}
          <Link
            href="/history"
            className={`p-2 rounded-xl border transition-all ${
              pathname === "/history"
                ? "text-primary bg-primary/10 border-primary/30"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 border-transparent"
            }`}
            title="学习历史"
          >
            <History size={18} />
          </Link>

          {/* User Section */}
          {loading ? (
            <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-surface-container-low border border-slate-300 dark:border-white/10 animate-pulse" />
          ) : user ? (
            /* Logged in */
            <div className="relative" ref={menuRef}>
              <button
                className="flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/5 p-1.5 rounded-xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-white/10"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary via-secondary/70 to-primary/40 flex items-center justify-center text-white text-xs font-bold shadow-[0_0_12px_rgba(2,132,199,0.25)] dark:shadow-[0_0_12px_rgba(83,221,252,0.25)]">
                  {(user.nickname || user.email || "U")[0].toUpperCase()}
                </div>
                <span className="hidden md:inline text-xs font-medium text-slate-700 dark:text-slate-300 max-w-[100px] truncate">
                  {user.nickname || user.email}
                </span>
                <ChevronDown size={14} className="text-slate-500" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white/95 dark:bg-surface-container-high/95 backdrop-blur-2xl rounded-2xl border border-slate-200 dark:border-white/10 shadow-xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-2.5 border-b border-slate-200/80 dark:border-white/5">
                    <p className="text-sm font-semibold text-on-surface truncate">{user.nickname}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    {isAdmin && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-secondary/15 text-secondary text-[10px] font-mono uppercase tracking-wider font-bold border border-secondary/30">
                        Admin 权限
                      </span>
                    )}
                  </div>
                  <Link
                    href="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-600 dark:text-slate-300 hover:text-primary dark:hover:text-primary hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <LayoutDashboard size={15} />
                    学习仪表盘
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-600 dark:text-slate-300 hover:text-primary dark:hover:text-primary hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <Settings size={15} />
                    个人中心
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-600 dark:text-slate-300 hover:text-primary dark:hover:text-primary hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                      <ShieldCheck size={15} />
                      后台管理
                    </Link>
                  )}
                  <Link
                    href="/history"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-600 dark:text-slate-300 hover:text-primary dark:hover:text-primary hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <History size={15} />
                    学习历史
                  </Link>
                  <div className="border-t border-slate-200/80 dark:border-white/5 mt-1 pt-1">
                    <button
                      className="flex items-center gap-2.5 w-full px-4 py-2 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                      onClick={() => {
                        logout();
                        setMenuOpen(false);
                      }}
                    >
                      <LogOut size={15} />
                      退出登录
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Guest */
            <Link
              href="/auth/login"
              className="flex items-center gap-1.5 bg-primary/15 hover:bg-primary/25 text-primary px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 border border-primary/30 shadow-xs"
            >
              <LogIn size={14} />
              登录
            </Link>
          )}

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Navigation */}
      {mobileNavOpen && (
        <div className="md:hidden fixed top-[61px] inset-x-0 bg-white/95 dark:bg-surface-container-high/95 backdrop-blur-2xl border-b border-slate-200 dark:border-white/10 z-30 p-4 space-y-2 animate-in slide-in-from-top duration-200">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileNavOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-primary hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          ))}
          <div className="flex items-center justify-between px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">外观主题</span>
            <ThemeToggle showLabel />
          </div>
          <button
            onClick={() => {
              setMobileNavOpen(false);
              setCommandMenuOpen(true);
            }}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <Search size={18} />
            全局搜索 (Cmd + K)
          </button>
        </div>
      )}

      {/* Command Menu Modal */}
      <CommandMenu isOpen={commandMenuOpen} onClose={() => setCommandMenuOpen(false)} />
    </>
  );
}

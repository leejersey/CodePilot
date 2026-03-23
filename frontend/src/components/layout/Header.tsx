"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";

export function Header() {
  const { user, init, logout, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initDone = useRef(false);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    init();
  }, [init]);

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

  return (
    <header className="fixed top-0 w-full flex justify-between items-center px-6 py-4 bg-[#060e20]/80 backdrop-blur-xl z-50 shadow-[0_8px_32px_rgba(6,14,32,0.8)] border-b border-white/5">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-2xl font-bold tracking-tighter text-cyan-400 font-headline">
          CodePilot
        </Link>
        <nav className="hidden md:flex items-center gap-6 font-headline text-sm tracking-wide">
          <Link className="text-slate-400 hover:text-cyan-300 transition-colors hover:bg-white/5 duration-200 px-3 py-1.5 rounded-md" href="/learn">Learning Path</Link>
          <Link className="text-slate-400 hover:text-cyan-300 transition-colors hover:bg-white/5 duration-200 px-3 py-1.5 rounded-md" href="/exercises">Exercises</Link>
          <Link className="text-slate-400 hover:text-cyan-300 transition-colors hover:bg-white/5 duration-200 px-3 py-1.5 rounded-md" href="/dashboard">Dashboard</Link>
        </nav>
      </div>
      <div className="flex items-center gap-6">
        <div className="hidden lg:flex items-center bg-surface-container-low px-4 py-2 rounded-full border border-white/5">
          <span className="material-symbols-outlined text-slate-500 text-[18px]">search</span>
          <input className="bg-transparent border-none text-sm focus:ring-0 text-on-surface w-40 outline-none ml-2 placeholder:text-slate-500" placeholder="搜索资源..." type="text" />
        </div>
        <Link href="/history">
          <button className="text-slate-400 hover:text-cyan-300 transition-all active:scale-95">
            <span className="material-symbols-outlined text-xl">history</span>
          </button>
        </Link>

        {/* 用户区域 */}
        {loading ? (
          <div className="w-9 h-9 rounded-full bg-surface-container-low border border-white/10 animate-pulse" />
        ) : user ? (
          /* 已登录 */
          <div className="relative" ref={menuRef}>
            <button
              className="flex items-center gap-2 hover:bg-white/5 px-2 py-1 rounded-xl transition-colors"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-surface text-sm font-bold">
                {(user.nickname || user.email || "U")[0].toUpperCase()}
              </div>
              <span className="hidden md:inline text-sm text-on-surface-variant max-w-[100px] truncate">
                {user.nickname || user.email}
              </span>
              <span className="material-symbols-outlined text-slate-500 text-sm">expand_more</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-surface-container-high/95 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="px-4 py-2 border-b border-white/5">
                  <p className="text-sm font-medium text-on-surface truncate">{user.nickname}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
                <a href="/dashboard" className="flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:bg-white/5 transition-colors">
                  <span className="material-symbols-outlined text-base">dashboard</span>
                  学习仪表盘
                </a>
                <a href="/history" className="flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:bg-white/5 transition-colors">
                  <span className="material-symbols-outlined text-base">history</span>
                  学习历史
                </a>
                <div className="border-t border-white/5 mt-1 pt-1">
                  <button
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    onClick={() => { logout(); setMenuOpen(false); }}
                  >
                    <span className="material-symbols-outlined text-base">logout</span>
                    退出登录
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* 未登录 */
          <Link
            href="/auth/login"
            className="flex items-center gap-2 bg-primary/15 hover:bg-primary/25 text-primary px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 border border-primary/20"
          >
            <span className="material-symbols-outlined text-base">login</span>
            登录
          </Link>
        )}
      </div>
    </header>
  );
}

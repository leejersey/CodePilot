"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  Code2,
  Compass,
  FolderGit2,
  History,
  LayoutDashboard,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";

interface CommandMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandMenu({ isOpen, onClose }: CommandMenuProps) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands = useMemo(() => {
    const list = [
      {
        id: "home",
        title: "探索首页",
        desc: "输入任意技术栈生成专属学习大纲",
        icon: Compass,
        action: () => router.push("/"),
        category: "导航",
      },
      {
        id: "learn",
        title: "学习路径",
        desc: "查看已生成的技能大纲与章节进度",
        icon: FolderGit2,
        action: () => router.push("/learn"),
        category: "导航",
      },
      {
        id: "exercises",
        title: "编程演练场",
        desc: "挑战管理员发布的知识库实战题",
        icon: Code2,
        action: () => router.push("/exercises"),
        category: "导航",
      },
      {
        id: "dashboard",
        title: "学习仪表盘",
        desc: "查看活跃度热力图与多维技能雷达",
        icon: LayoutDashboard,
        action: () => router.push("/dashboard"),
        category: "导航",
      },
      {
        id: "history",
        title: "学习历史",
        desc: "浏览过往学习记录与足迹",
        icon: History,
        action: () => router.push("/history"),
        category: "导航",
      },
    ];

    if (isAdmin) {
      list.push({
        id: "admin",
        title: "后台管理",
        desc: "集中管理知识库与练习发布",
        icon: ShieldCheck,
        action: () => router.push("/admin"),
        category: "管理员",
      });
    }

    return list;
  }, [router, isAdmin]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) => c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl rounded-2xl bg-surface-container-high/95 border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.6),0_0_30px_rgba(83,221,252,0.1)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-white/10">
          <Search size={18} className="text-primary/70 mr-3 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索功能、页面或按快捷键跳转..."
            className="w-full bg-transparent border-none text-on-surface placeholder:text-slate-500 text-sm focus:outline-none focus:ring-0 font-body"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-slate-500 hover:text-slate-300 p-1"
            >
              <X size={14} />
            </button>
          )}
          <kbd className="hidden sm:inline-block ml-2 px-1.5 py-0.5 text-[10px] text-slate-400 bg-white/5 border border-white/10 rounded font-mono">
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              未找到匹配指令，可尝试搜索“路径”、“练习”或“知识库”
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-on-surface hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-1.5 rounded-lg ${
                        isSelected ? "bg-primary/20 text-primary" : "bg-white/5 text-slate-400"
                      }`}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{cmd.title}</p>
                      <p className="text-xs text-slate-500 truncate">{cmd.desc}</p>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 shrink-0 ml-2">
                    {cmd.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-surface-container-low/60 border-t border-white/5 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span>↑↓ 导航</span>
            <span>↵ 选择</span>
            <span>ESC 退出</span>
          </div>
          <span className="text-primary/70 font-headline font-bold">CodePilot Command</span>
        </div>
      </div>
    </div>
  );
}

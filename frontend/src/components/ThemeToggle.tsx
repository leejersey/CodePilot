"use client";

import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className = "", showLabel = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative inline-flex items-center gap-2 p-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/80 hover:bg-slate-200/80 dark:bg-surface-container-low/70 dark:hover:bg-surface-container-high/80 text-slate-700 dark:text-slate-300 hover:text-primary dark:hover:text-primary transition-all duration-200 shadow-sm active:scale-95 group ${className}`}
      aria-label={isDark ? "切换至亮色模式" : "切换至暗色模式"}
      title={isDark ? "切换至亮色模式" : "切换至暗色模式"}
    >
      <div className="relative w-4 h-4 flex items-center justify-center">
        <Sun
          size={16}
          className={`text-amber-500 transition-all duration-300 ${
            isDark ? "-rotate-90 scale-0 opacity-0 absolute" : "rotate-0 scale-100 opacity-100"
          }`}
        />
        <Moon
          size={16}
          className={`text-primary transition-all duration-300 ${
            isDark ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0 absolute"
          }`}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium font-headline">
          {isDark ? "亮色模式" : "暗色模式"}
        </span>
      )}
    </button>
  );
}

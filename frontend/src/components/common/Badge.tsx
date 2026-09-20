"use client";

import React from "react";
import { BookOpen, CheckCircle2, Flame, ShieldAlert, Sparkles, Terminal } from "lucide-react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children?: React.ReactNode;
  variant?: "default" | "rag" | "primary" | "secondary" | "success" | "warning" | "danger";
  difficulty?: "beginner" | "intermediate" | "advanced" | "easy" | "medium" | "hard" | string;
  language?: string;
  className?: string;
  size?: "sm" | "md";
}

export function Badge({
  children,
  variant,
  difficulty,
  language,
  className = "",
  size = "md",
  ...props
}: BadgeProps) {
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";

  // 1. 难度模式
  if (difficulty) {
    const d = difficulty.toLowerCase();
    if (d === "beginner" || d === "easy" || d === "入门" || d === "初级") {
      return (
        <span
          className={`inline-flex items-center gap-1 font-semibold font-headline rounded-full border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 shadow-2xs ${sizeClasses} ${className}`}
          {...props}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse" />
          {children || "入门"}
        </span>
      );
    }
    if (d === "advanced" || d === "hard" || d === "高级") {
      return (
        <span
          className={`inline-flex items-center gap-1 font-semibold font-headline rounded-full border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-400 shadow-2xs ${sizeClasses} ${className}`}
          {...props}
        >
          <Flame size={12} className="text-rose-600 dark:text-rose-400" />
          {children || "高级"}
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold font-headline rounded-full border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 shadow-2xs ${sizeClasses} ${className}`}
        {...props}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
        {children || "中级"}
      </span>
    );
  }

  // 2. 编程语言模式
  if (language) {
    const l = language.toLowerCase();
    let colorClass = "border-slate-200 dark:border-primary/20 bg-slate-100/90 dark:bg-primary/10 text-slate-800 dark:text-primary";
    if (l === "go") colorClass = "border-sky-200 dark:border-sky-500/20 bg-sky-50 dark:bg-sky-500/10 text-sky-800 dark:text-sky-400";
    if (l === "javascript" || l === "js") colorClass = "border-amber-200 dark:border-yellow-500/20 bg-amber-50 dark:bg-yellow-500/10 text-amber-900 dark:text-yellow-400";
    if (l === "typescript" || l === "ts") colorClass = "border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 text-blue-800 dark:text-blue-400";
    if (l === "rust") colorClass = "border-orange-200 dark:border-orange-500/20 bg-orange-50 dark:bg-orange-500/10 text-orange-900 dark:text-orange-400";
    if (l === "c++" || l === "cpp") colorClass = "border-cyan-200 dark:border-cyan-500/20 bg-cyan-50 dark:bg-cyan-500/10 text-cyan-900 dark:text-cyan-400";

    return (
      <span
        className={`inline-flex items-center gap-1.5 font-mono font-semibold rounded-full border shadow-2xs ${colorClass} ${sizeClasses} ${className}`}
        {...props}
      >
        <Terminal size={12} />
        <span className="uppercase">{children || language}</span>
      </span>
    );
  }

  // 3. 知识库 RAG 专属勋章
  if (variant === "rag") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-semibold rounded-full border border-violet-200 dark:border-secondary/30 bg-violet-50 dark:bg-secondary/15 text-violet-800 dark:text-secondary ${sizeClasses} shadow-2xs ${className}`}
        {...props}
      >
        <BookOpen size={12} className="text-violet-600 dark:text-secondary" />
        {children || "知识库课程"}
      </span>
    );
  }

  if (variant === "success") {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold rounded-full border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 shadow-2xs ${sizeClasses} ${className}`}
        {...props}
      >
        <CheckCircle2 size={12} />
        {children}
      </span>
    );
  }

  if (variant === "danger") {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold rounded-full border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-400 shadow-2xs ${sizeClasses} ${className}`}
        {...props}
      >
        <ShieldAlert size={12} />
        {children}
      </span>
    );
  }

  // 默认 Primary 模式
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-full border border-sky-200 dark:border-primary/20 bg-sky-50 dark:bg-primary/10 text-sky-800 dark:text-primary shadow-2xs ${sizeClasses} ${className}`}
      {...props}
    >
      <Sparkles size={12} />
      {children}
    </span>
  );
}

export function DifficultyBadge({
  difficulty,
  className,
}: {
  difficulty?: string;
  className?: string;
}) {
  return <Badge difficulty={difficulty} className={className} />;
}

export function KnowledgeBadge({
  kbName,
  className,
}: {
  kbName?: string;
  className?: string;
}) {
  return (
    <Badge variant="rag" className={className}>
      {kbName ? `RAG · ${kbName}` : "知识库赋能"}
    </Badge>
  );
}


"use client";

import React from "react";
import Link from "next/link";
import { FolderSearch, Plus, ArrowRight } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode | React.ElementType;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionText,
  onAction,
  action,
  className = "",
}: EmptyStateProps) {
  const renderIcon = () => {
    if (!icon) {
      return <FolderSearch size={28} className="text-cyan-400" />;
    }
    if (React.isValidElement(icon)) return icon;
    const IconComp = icon as React.ElementType;
    return <IconComp size={28} className="text-cyan-400" />;
  };

  const buttonLabel = action?.label || actionText;
  const clickHandler = action?.onClick || onAction;

  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-12 rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-surface-container-low/30 backdrop-blur-sm ${className}`}
    >
      <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-500 dark:text-cyan-400 mb-4 shadow-[0_0_30px_rgba(6,182,212,0.1)]">
        {renderIcon()}
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 font-headline mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm mb-6 leading-relaxed">
          {description}
        </p>
      )}

      {action?.href && buttonLabel ? (
        <Link
          href={action.href}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-primary text-slate-950 font-bold text-sm hover:opacity-90 transition-all active:scale-95 shadow-[0_4px_20px_rgba(6,182,212,0.25)]"
        >
          <span>{buttonLabel}</span>
          <ArrowRight size={15} />
        </Link>
      ) : buttonLabel && clickHandler ? (
        <button
          onClick={clickHandler}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-primary text-slate-950 font-bold text-sm hover:opacity-90 transition-all active:scale-95 shadow-[0_4px_20px_rgba(6,182,212,0.25)]"
        >
          <Plus size={16} />
          {buttonLabel}
        </button>
      ) : null}
    </div>
  );
}


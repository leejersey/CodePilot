"use client";

import React, { useRef } from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  enableSpotlight?: boolean;
  interactive?: boolean;
  elevated?: boolean;
}

export function Card({
  children,
  className = "",
  enableSpotlight = true,
  interactive = false,
  elevated = false,
  ...props
}: CardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!enableSpotlight || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cardRef.current.style.setProperty("--mouse-x", `${x}px`);
    cardRef.current.style.setProperty("--mouse-y", `${y}px`);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={`relative isolate rounded-2xl bg-white/90 dark:bg-surface-container-high/40 backdrop-blur-xl border border-slate-200/90 dark:border-white/[0.08] transition-all duration-200 ease-out overflow-hidden ${
        elevated ? "shadow-elevated" : "shadow-soft"
      } ${
        enableSpotlight ? "spotlight-card" : ""
      } ${
        interactive
          ? "hover:border-primary/50 hover:shadow-elevated hover:-translate-y-0.5 cursor-pointer active:scale-[0.99]"
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}


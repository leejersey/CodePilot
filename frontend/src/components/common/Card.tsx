"use client";

import React, { useRef } from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  enableSpotlight?: boolean;
  interactive?: boolean;
}

export function Card({
  children,
  className = "",
  enableSpotlight = true,
  interactive = false,
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
      className={`relative isolate rounded-2xl bg-white/80 dark:bg-surface-container-high/40 backdrop-blur-xl border border-slate-200/80 dark:border-white/[0.08] shadow-xs dark:shadow-none transition-all duration-300 overflow-hidden ${
        enableSpotlight ? "spotlight-card" : ""
      } ${
        interactive
          ? "hover:border-primary/40 hover:shadow-[0_8px_30px_rgba(2,132,199,0.08)] dark:hover:shadow-[0_8px_30px_rgba(83,221,252,0.1)] hover:-translate-y-0.5 cursor-pointer"
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}


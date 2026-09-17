"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, GraduationCap } from "lucide-react";
import { CreatorGuard } from "@/components/CreatorGuard";
import { Header } from "@/components/layout/Header";
import { isActiveNavRoute } from "@/lib/courseExperience";

const CREATOR_NAV = [
  { label: "我的课程", href: "/creator/courses", icon: GraduationCap },
  { label: "我的知识库", href: "/creator/knowledge", icon: BookOpen },
];

export default function CreatorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return (
    <CreatorGuard>
      <Header />
      <main className="min-h-screen bg-background px-4 pb-20 pt-24 sm:px-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <nav
            aria-label="创作台导航"
            className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/5 dark:bg-white/5"
          >
            {CREATOR_NAV.map((item) => {
              const active = isActiveNavRoute(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs transition-colors ${
                    active
                      ? "bg-white font-bold text-primary shadow-xs dark:bg-primary/20"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <item.icon size={14} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {children}
        </div>
      </main>
    </CreatorGuard>
  );
}

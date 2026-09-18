"use client";

import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { AuthGuard } from "@/components/AuthGuard";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { ChevronRight } from "lucide-react";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <Header />
      <main className="min-h-screen pt-24 pb-20 px-6 md:px-10 bg-background">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-on-surface-variant text-xs mb-6 font-label tracking-widest uppercase">
            <Link href="/" className="hover:text-primary transition-colors">
              首页
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-primary">个人中心</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold font-headline mb-2">个人中心</h1>
          <p className="text-on-surface-variant mb-8">
            按板块管理账号、模型与用量；后续功能会继续挂在左侧导航。
          </p>

          <div className="md:flex md:items-start md:gap-8">
            <SettingsNav />
            <div className="min-w-0 flex-1 max-w-2xl">{children}</div>
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}

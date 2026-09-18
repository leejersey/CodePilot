"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Gauge, KeyRound, Sparkles } from "lucide-react";

export const SETTINGS_NAV = [
  {
    href: "/settings/account",
    label: "账号与安全",
    description: "资料与密码",
    icon: KeyRound,
  },
  {
    href: "/settings/llm",
    label: "模型配置",
    description: "个人 LLM",
    icon: Sparkles,
  },
  {
    href: "/settings/usage",
    label: "用量统计",
    description: "本月配额",
    icon: Gauge,
  },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <>
      {/* Mobile: select */}
      <div className="md:hidden mb-6">
        <label className="sr-only" htmlFor="settings-section">
          个人中心板块
        </label>
        <select
          id="settings-section"
          value={SETTINGS_NAV.find((item) => pathname.startsWith(item.href))?.href || SETTINGS_NAV[0].href}
          onChange={(event) => router.push(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-surface-container-high px-4 py-3 text-sm text-on-surface outline-none focus:border-primary"
        >
          {SETTINGS_NAV.map((item) => (
            <option key={item.href} value={item.href}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: sidebar */}
      <nav className="hidden md:flex flex-col gap-1 shrink-0 w-52" aria-label="个人中心导航">
        {SETTINGS_NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                active
                  ? "bg-primary/15 text-primary border border-primary/25"
                  : "text-on-surface-variant border border-transparent hover:bg-white/5 hover:text-on-surface"
              }`}
            >
              <Icon className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="block text-[11px] opacity-70 mt-0.5">{item.description}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

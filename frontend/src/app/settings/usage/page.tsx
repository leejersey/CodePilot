"use client";

import { useEffect, useState } from "react";
import { useDialog } from "@/components/DialogProvider";
import { Gauge } from "lucide-react";
import { getMyLlmUsage, type LlmUsageSummary } from "@/lib/api";

export default function SettingsUsagePage() {
  const { alert } = useDialog();
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<LlmUsageSummary | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setUsage(await getMyLlmUsage());
      } catch (err) {
        await alert({
          title: "加载失败",
          message: err instanceof Error ? err.message : "无法加载用量数据",
        });
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-headline text-on-surface">用量统计</h2>
        <p className="text-sm text-on-surface-variant mt-1">查看本月 LLM 调用与平台配额消耗。</p>
      </div>

      {loading ? (
        <div className="h-48 rounded-2xl bg-surface-container-high animate-pulse" />
      ) : usage ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-on-surface">本月 LLM 用量</h3>
            </div>
            <span className="text-xs font-mono text-slate-500">{usage.month}</span>
          </div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-slate-500">平台 Token 配额</span>
            <span className="font-mono text-on-surface">
              {usage.platform_tokens.toLocaleString()} / {usage.monthly_token_quota.toLocaleString()}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div
              className={`h-full rounded-full transition-all ${
                usage.quota_percent >= 90 ? "bg-rose-500" : "bg-gradient-to-r from-primary to-secondary"
              }`}
              style={{ width: `${Math.min(100, usage.quota_percent)}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["调用次数", usage.request_count.toLocaleString()],
              ["总 Token", usage.total_tokens.toLocaleString()],
              ["BYOK Token", usage.byok_tokens.toLocaleString()],
              [
                "预估费用",
                usage.pricing_configured ? `$${usage.estimated_cost_usd.toFixed(4)}` : "未配置价格",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-black/10 p-3"
              >
                <p className="text-[10px] text-slate-500">{label}</p>
                <p className="mt-1 text-xs font-bold font-mono text-on-surface">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-slate-500">
            个人 API Key 的调用会统计，但不会消耗平台 Token 配额。费用根据配置单价估算。
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">暂无用量数据。</p>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Loader2,
  RefreshCw,
  Server,
} from "lucide-react";
import {
  getObservabilitySummary,
  getServiceHealth,
  listErrorEvents,
  resolveErrorEvent,
  type ErrorEvent,
  type ObservabilitySummary,
  type ServiceHealth,
} from "@/lib/api";

export default function ObservabilityPage() {
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [summary, setSummary] = useState<ObservabilitySummary | null>(null);
  const [errors, setErrors] = useState<ErrorEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const [healthData, summaryData, errorData] = await Promise.all([
        getServiceHealth(),
        getObservabilitySummary(),
        listErrorEvents({ pageSize: 30 }),
      ]);
      setHealth(healthData);
      setSummary(summaryData);
      setErrors(errorData.items);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "监控数据加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const resolve = async (eventId: string) => {
    const updated = await resolveErrorEvent(eventId);
    setErrors((items) => items.map((item) => item.id === eventId ? updated : item));
    setSummary((value) => value ? { ...value, unresolved: Math.max(0, value.unresolved - 1) } : value);
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
        加载运行状态…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-mono font-semibold text-primary">OBSERVABILITY</p>
          <h1 className="font-headline text-3xl font-bold text-slate-900 dark:text-white">运行监控</h1>
          <p className="mt-2 text-sm text-slate-500">服务健康、错误追踪和后台任务告警，每 30 秒自动刷新。</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-primary/40 hover:text-primary disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          刷新
        </button>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">{error}</div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "整体状态", value: health?.status === "ok" ? "正常" : "降级", icon: Activity },
          { label: "24 小时错误", value: summary?.errors_24h ?? 0, icon: AlertTriangle },
          { label: "未解决", value: summary?.unresolved ?? 0, icon: CircleDot },
          { label: "失败任务", value: summary?.failed_jobs_24h ?? 0, icon: Server },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/90 dark:bg-surface-container-low/60 p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs text-slate-500">{item.label}</span>
              <item.icon className="h-4 w-4 text-primary" />
            </div>
            <p className="font-headline text-2xl font-bold text-slate-900 dark:text-white">{item.value}</p>
          </div>
        ))}
      </section>

      {health && (
        <section className="rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/90 dark:bg-surface-container-low/50 p-6">
          <h2 className="mb-4 font-headline text-lg font-bold text-slate-900 dark:text-white">依赖服务</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(health.services).map(([name, status]) => {
              const ready = status === "ready";
              return (
                <div key={name} className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/5 px-4 py-3">
                  <span className="text-sm font-medium capitalize text-slate-700 dark:text-slate-200">{name}</span>
                  <span className={`inline-flex items-center gap-1.5 text-xs ${ready ? "text-emerald-500" : "text-rose-500"}`}>
                    {ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {ready ? "正常" : "不可用"}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] text-slate-500">
            Sentry：{health.monitoring.sentry === "configured" ? "已配置" : "未配置"} · Webhook 告警：
            {health.monitoring.webhook_alerts === "configured" ? "已配置" : "未配置"}
          </p>
        </section>
      )}

      {summary && (
        <section className="rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/90 dark:bg-surface-container-low/50 p-6">
          <h2 className="font-headline text-lg font-bold text-slate-900 dark:text-white">24 小时错误趋势</h2>
          <div className="mt-5 flex h-28 items-end gap-1.5">
            {Array.from({ length: 24 }, (_, index) => {
              const now = new Date();
              const hour = new Date(now.getTime() - (23 - index) * 3600_000);
              const match = summary.trend.find((item) => {
                const value = new Date(item.hour);
                return value.getFullYear() === hour.getFullYear()
                  && value.getMonth() === hour.getMonth()
                  && value.getDate() === hour.getDate()
                  && value.getHours() === hour.getHours();
              });
              const count = match?.count || 0;
              const max = Math.max(1, ...summary.trend.map((item) => item.count));
              return (
                <div key={hour.toISOString()} className="group flex h-full min-w-0 flex-1 items-end">
                  <div
                    title={`${hour.getHours()}:00 · ${count} 个错误`}
                    className={`w-full rounded-t-sm transition-all ${count ? "bg-rose-500" : "bg-slate-200 dark:bg-white/10"}`}
                    style={{ height: `${Math.max(4, count / max * 100)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-500">
            <span>24 小时前</span>
            <span>当前</span>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/90 dark:bg-surface-container-low/50 p-6">
        <h2 className="mb-4 font-headline text-lg font-bold text-slate-900 dark:text-white">最近错误</h2>
        {errors.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">暂无错误记录</p>
        ) : (
          <div className="space-y-3">
            {errors.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 dark:border-white/5 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-500">{item.service}</span>
                      <code className="text-[10px] text-slate-500">{item.error_id}</code>
                      {item.status_code && <span className="text-[10px] text-slate-500">HTTP {item.status_code}</span>}
                    </div>
                    <p className="mt-2 break-words text-sm font-medium text-slate-800 dark:text-slate-200">{item.message}</p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {item.method} {item.path} · {new Date(item.created_at).toLocaleString()}
                      {item.request_id ? ` · request ${item.request_id}` : ""}
                    </p>
                  </div>
                  {item.resolved_at ? (
                    <span className="shrink-0 text-xs text-emerald-500">已解决</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void resolve(item.id)}
                      className="shrink-0 rounded-lg border border-emerald-500/25 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                    >
                      标记解决
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/api";

export function ClientErrorMonitor() {
  useEffect(() => {
    const reported = new Set<string>();
    const report = (message: string, stack?: string) => {
      const key = `${message}:${stack || ""}`.slice(0, 500);
      if (reported.has(key)) return;
      reported.add(key);
      void reportClientError({
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 8000),
        path: window.location.pathname,
        source: "window",
      }).catch(() => undefined);
    };
    const onError = (event: ErrorEvent) => {
      report(event.message || "Frontend runtime error", event.error?.stack);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      report(
        reason instanceof Error ? reason.message : String(reason || "Unhandled promise rejection"),
        reason instanceof Error ? reason.stack : undefined
      );
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

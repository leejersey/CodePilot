"use client";

import { DialogProvider } from "@/components/DialogProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { RouteAccessGuard } from "@/components/RouteAccessGuard";
import { ClientErrorMonitor } from "@/components/ClientErrorMonitor";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <DialogProvider>
        <ClientErrorMonitor />
        <RouteAccessGuard>{children}</RouteAccessGuard>
      </DialogProvider>
    </ThemeProvider>
  );
}


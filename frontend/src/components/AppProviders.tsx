"use client";

import { DialogProvider } from "@/components/DialogProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <DialogProvider>{children}</DialogProvider>;
}

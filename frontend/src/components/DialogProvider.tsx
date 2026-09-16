"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, HelpCircle, Info } from "lucide-react";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** danger = 删除等破坏性操作 */
  tone?: "danger" | "default";
};

export type AlertOptions = {
  title?: string;
  message: string;
  confirmText?: string;
};

type DialogApi = {
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
  alert: (opts: AlertOptions | string) => Promise<void>;
};

const DialogContext = createContext<DialogApi | null>(null);

type Pending =
  | {
      kind: "confirm";
      opts: ConfirmOptions;
      resolve: (v: boolean) => void;
    }
  | {
      kind: "alert";
      opts: AlertOptions;
      resolve: () => void;
    };

function normalizeConfirm(opts: ConfirmOptions | string): ConfirmOptions {
  if (typeof opts === "string") return { message: opts, tone: "danger" };
  return opts;
}

function normalizeAlert(opts: AlertOptions | string): AlertOptions {
  if (typeof opts === "string") return { message: opts };
  return opts;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  const confirm = useCallback((opts: ConfirmOptions | string) => {
    return new Promise<boolean>((resolve) => {
      setPending({ kind: "confirm", opts: normalizeConfirm(opts), resolve });
    });
  }, []);

  const alert = useCallback((opts: AlertOptions | string) => {
    return new Promise<void>((resolve) => {
      setPending({ kind: "alert", opts: normalizeAlert(opts), resolve });
    });
  }, []);

  const closeConfirm = useCallback((ok: boolean) => {
    const cur = pendingRef.current;
    if (!cur || cur.kind !== "confirm") return;
    cur.resolve(ok);
    setPending(null);
  }, []);

  const closeAlert = useCallback(() => {
    const cur = pendingRef.current;
    if (!cur || cur.kind !== "alert") return;
    cur.resolve();
    setPending(null);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pending.kind === "confirm") closeConfirm(false);
        else closeAlert();
      }
      if (e.key === "Enter" && pending.kind === "alert") {
        closeAlert();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, closeConfirm, closeAlert]);

  const api = useMemo(() => ({ confirm, alert }), [confirm, alert]);

  const tone = pending?.kind === "confirm" ? pending.opts.tone || "danger" : "default";
  const isDanger = tone === "danger";

  return (
    <DialogContext.Provider value={api}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-dialog-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            aria-label="关闭"
            onClick={() =>
              pending.kind === "confirm" ? closeConfirm(false) : closeAlert()
            }
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1528] text-slate-900 dark:text-slate-100 shadow-2xl dark:shadow-[0_20px_60px_rgba(0,0,0,0.55)] overflow-hidden">
            <div
              className={`h-1 w-full ${
                isDanger && pending.kind === "confirm"
                  ? "bg-gradient-to-r from-red-500 to-orange-400"
                  : "bg-gradient-to-r from-primary to-secondary"
              }`}
            />
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                    isDanger && pending.kind === "confirm"
                      ? "bg-rose-500/15 text-rose-400 border-rose-500/25"
                      : "bg-cyan-500/15 text-cyan-400 border-cyan-500/25"
                  }`}
                >
                  {pending.kind === "confirm" ? (
                    isDanger ? (
                      <AlertTriangle className="w-5 h-5" />
                    ) : (
                      <HelpCircle className="w-5 h-5" />
                    )
                  ) : (
                    <Info className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h2
                    id="app-dialog-title"
                    className="text-base font-bold font-headline text-on-surface"
                  >
                    {pending.opts.title ||
                      (pending.kind === "confirm"
                        ? isDanger
                          ? "确认删除"
                          : "请确认"
                        : "提示")}
                  </h2>
                  <p className="mt-2 text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                    {pending.opts.message}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-6">
                {pending.kind === "confirm" ? (
                  <>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-white/5 border border-white/10 transition-colors"
                      onClick={() => closeConfirm(false)}
                    >
                      {pending.opts.cancelText || "取消"}
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                        isDanger
                          ? "bg-red-500/90 hover:bg-red-500 text-white"
                          : "bg-primary hover:brightness-110 text-on-primary"
                      }`}
                      onClick={() => closeConfirm(true)}
                      autoFocus
                    >
                      {pending.opts.confirmText || (isDanger ? "删除" : "确定")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="px-5 py-2 rounded-xl text-sm font-bold bg-primary text-on-primary hover:brightness-110 transition-colors"
                    onClick={closeAlert}
                    autoFocus
                  >
                    {pending.opts.confirmText || "知道了"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialog must be used within DialogProvider");
  }
  return ctx;
}

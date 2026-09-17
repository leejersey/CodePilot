"use client";

import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import {
  getNextFocusIndex,
  shouldDismissModal,
} from "@/lib/modalAccessibility";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function AccessibleModal({
  title,
  children,
  busy = false,
  onClose,
  className = "max-w-lg",
}: {
  title: string;
  children: ReactNode;
  busy?: boolean;
  onClose: () => void;
  className?: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const returnFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusInitial = () => {
      const dialog = dialogRef.current;
      const preferred = dialog?.querySelector<HTMLElement>("[data-autofocus]");
      const first = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (preferred || first || dialog)?.focus();
    };
    const frame = window.requestAnimationFrame(focusInitial);

    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldDismissModal(event.key, busyRef.current)) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const currentIndex = focusable.indexOf(
        document.activeElement as HTMLElement
      );
      const nextIndex = getNextFocusIndex(
        currentIndex,
        focusable.length,
        event.shiftKey
      );
      if (
        currentIndex === -1 ||
        nextIndex === 0 ||
        nextIndex === focusable.length - 1
      ) {
        event.preventDefault();
        focusable[nextIndex]?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus();
    };
  }, []);

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !busy) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={closeFromBackdrop}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        tabIndex={-1}
        className={`relative max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl outline-none dark:border-white/10 dark:bg-surface-container-high ${className}`}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-headline text-lg font-bold">
            {title}
          </h2>
          <button
            type="button"
            aria-label="关闭"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

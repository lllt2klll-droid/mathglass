"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "info" | "success" | "warning" | "danger";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; tone?: ToastTone }) => void;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "text-[color:var(--mg-info)]" },
  success: { icon: CheckCircle2, className: "text-[color:var(--mg-success)]" },
  warning: { icon: AlertTriangle, className: "text-[color:var(--mg-warning)]" },
  danger: { icon: XCircle, className: "text-[color:var(--mg-danger)]" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const counter = React.useRef(0);
  const timers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = React.useCallback(
    (input: { title: string; description?: string; tone?: ToastTone }) => {
      counter.current += 1;
      const id = counter.current;
      const item: ToastItem = {
        id,
        title: input.title,
        description: input.description,
        tone: input.tone ?? "info",
      };
      setItems((current) => [...current.slice(-3), item]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), input.tone === "danger" ? 9000 : 5500),
      );
    },
    [dismiss],
  );

  React.useEffect(() => {
    const current = timers.current;
    return () => {
      for (const timer of current.values()) clearTimeout(timer);
      current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((item) => {
          const tone = toneStyles[item.tone];
          const Icon = tone.icon;
          return (
            <div
              key={item.id}
              className={cn(
                "mg-glass-strong mg-fade-in pointer-events-auto flex items-start gap-3 rounded-[16px] p-3.5 shadow-xl",
              )}
            >
              <Icon className={cn("mt-0.5 size-5 shrink-0", tone.className)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                {item.description ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-[color:var(--mg-highlight)] hover:text-foreground"
                aria-label="Đóng thông báo"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

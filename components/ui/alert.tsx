import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  info: {
    wrap: "border-[color:var(--mg-info)]/30 bg-[color:var(--mg-info-soft)]",
    icon: Info,
  },
  success: {
    wrap: "border-[color:var(--mg-success)]/30 bg-[color:var(--mg-success-soft)]",
    icon: CheckCircle2,
  },
  warning: {
    wrap: "border-[color:var(--mg-warning)]/30 bg-[color:var(--mg-warning-soft)]",
    icon: AlertTriangle,
  },
  danger: {
    wrap: "border-[color:var(--mg-danger)]/30 bg-[color:var(--mg-danger-soft)]",
    icon: XCircle,
  },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const item = tones[tone];
  const Icon = item.icon;
  return (
    <div className={cn("flex gap-3 rounded-[14px] border p-3.5 text-sm", item.wrap, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold text-foreground">{title}</p> : null}
        <div className="text-muted-foreground [&_strong]:text-foreground">{children}</div>
      </div>
    </div>
  );
}

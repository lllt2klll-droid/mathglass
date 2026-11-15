import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-5 tracking-[0.01em]",
  {
    variants: {
      tone: {
        neutral:
          "border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)] text-muted-foreground",
        info: "border-transparent bg-[color:var(--mg-info-soft)] text-[color:var(--mg-info)]",
        success:
          "border-transparent bg-[color:var(--mg-success-soft)] text-[color:var(--mg-success)]",
        warning:
          "border-transparent bg-[color:var(--mg-warning-soft)] text-[color:var(--mg-warning)]",
        danger:
          "border-transparent bg-[color:var(--mg-danger-soft)] text-[color:var(--mg-danger)]",
        primary:
          "border-transparent bg-[color:var(--mg-highlight)] text-[color:var(--mg-primary)]",
        outline: "border-[color:var(--mg-border-subtle)] bg-transparent text-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

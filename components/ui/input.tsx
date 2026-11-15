import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "flex h-10 w-full rounded-[12px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-surface)] px-3 py-2 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-[border,box-shadow] duration-150 placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(base, className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(base, "min-h-[96px] resize-y py-2.5 leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

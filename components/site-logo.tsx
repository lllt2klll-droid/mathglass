import { Sigma } from "lucide-react";
import { cn } from "@/lib/utils";

export function SiteLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-gradient-to-br from-[color:var(--mg-primary)] to-[color:var(--mg-secondary)] text-white shadow-[0_8px_18px_-10px_rgba(52,90,196,0.9)]">
        <Sigma className="size-[18px]" strokeWidth={2.2} aria-hidden />
      </span>
      {compact ? null : (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-[-0.02em]">MathGlass</span>
          <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Math → LaTeX Studio
          </span>
        </span>
      )}
    </span>
  );
}

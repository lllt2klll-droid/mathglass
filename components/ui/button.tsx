import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[12px] text-sm font-medium transition-[background,color,border,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-[color:var(--mg-primary)] to-[color:var(--mg-primary-hover)] text-primary-foreground shadow-[0_10px_24px_-14px_rgba(52,90,196,0.8)] hover:brightness-[1.04]",
        secondary:
          "border border-[color:var(--mg-border)] bg-[color:var(--mg-glass-strong)] text-foreground shadow-[0_8px_20px_-16px_rgba(23,43,77,0.4)] backdrop-blur-sm hover:bg-[color:var(--mg-surface)]",
        outline:
          "border border-[color:var(--mg-border-subtle)] bg-transparent text-foreground hover:bg-[color:var(--mg-highlight)]",
        ghost:
          "bg-transparent text-foreground hover:bg-[color:var(--mg-highlight)]",
        subtle:
          "bg-[color:var(--mg-highlight)] text-foreground hover:bg-[color:color-mix(in_srgb,var(--mg-primary)_18%,transparent)]",
        danger:
          "bg-[color:var(--mg-danger)] text-white shadow-[0_10px_24px_-14px_rgba(194,65,75,0.65)] hover:brightness-[1.05]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-5 text-[15px]",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingLabel = "Đang xử lý",
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Comp>
      );
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {loading ? <span>{loadingLabel}</span> : children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };

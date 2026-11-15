"use client";

import * as React from "react";
import katex from "katex";
import type { InlineNode } from "@/types/document";
import { cn } from "@/lib/utils";

interface MathRenderState {
  html: string | null;
  error: string | null;
}

function renderMath(latex: string, displayMode: boolean): MathRenderState {
  const source = latex.trim();
  if (!source) return { html: null, error: "Công thức rỗng." };
  try {
    return {
      html: katex.renderToString(source, {
        displayMode,
        throwOnError: true,
        strict: "ignore",
        trust: false,
        output: "html",
      }),
      error: null,
    };
  } catch (cause) {
    return {
      html: null,
      error: cause instanceof Error ? cause.message : "Không thể hiển thị công thức.",
    };
  }
}

/**
 * Renders a LaTeX expression with KaTeX.
 *
 * This is a semantic preview, not a TeX compilation. Invalid expressions are
 * shown as the original source together with the KaTeX error instead of being
 * silently corrected.
 */
export function KatexMath({
  latex,
  display = false,
  className,
  sourceClassName,
}: {
  latex: string;
  display?: boolean;
  className?: string;
  sourceClassName?: string;
}) {
  const state = React.useMemo(() => renderMath(latex, display), [latex, display]);

  if (state.html) {
    return (
      <span
        className={cn(display ? "block" : "inline-block max-w-full align-middle", className)}
        // KaTeX output is generated locally with trust disabled; user input is escaped.
        dangerouslySetInnerHTML={{ __html: state.html }}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full flex-wrap items-baseline gap-1.5 rounded-md border border-[color:var(--mg-danger)]/30 bg-[color:var(--mg-danger-soft)] px-1.5 py-0.5 font-mono text-[0.82em]",
        sourceClassName,
      )}
      title={state.error ?? undefined}
    >
      <code className="break-all text-foreground">{latex || "(trống)"}</code>
      <span className="text-[0.85em] text-[color:var(--mg-danger)]">Lỗi công thức</span>
    </span>
  );
}

export function AstInlines({
  inlines,
  className,
}: {
  inlines: InlineNode[];
  className?: string;
}) {
  return (
    <span className={className}>
      {inlines.map((inline, index) => {
        switch (inline.type) {
          case "text": {
            let content: React.ReactNode = inline.text;
            if (inline.code) content = <code>{content}</code>;
            if (inline.subscript) content = <sub>{content}</sub>;
            if (inline.superscript) content = <sup>{content}</sup>;
            if (inline.underline) content = <span className="underline">{content}</span>;
            if (inline.italic) content = <em>{content}</em>;
            if (inline.bold) content = <strong>{content}</strong>;
            return <React.Fragment key={index}>{content}</React.Fragment>;
          }
          case "math":
            return (
              <KatexMath
                key={index}
                latex={inline.latex}
                className="mx-0.5"
              />
            );
          case "linebreak":
            return <br key={index} />;
          case "image":
            return (
              // Private assets are served through the owner-checked API route.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={index}
                src={`/api/assets/${inline.assetId}`}
                alt={inline.alt || inline.filename}
                className="my-2 max-h-72 max-w-full rounded-md border border-[color:var(--mg-border-subtle)] object-contain"
              />
            );
          default:
            return null;
        }
      })}
    </span>
  );
}

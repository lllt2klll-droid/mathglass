"use client";

import * as React from "react";
import { ImageIcon, Info } from "lucide-react";
import { KatexMath } from "@/components/math-content";
import { parseLatexPreview, type PreviewInline } from "@/lib/latex-preview-parser";
import { cn } from "@/lib/utils";

function Inlines({ inlines }: { inlines: PreviewInline[] }) {
  return (
    <>
      {inlines.map((inline, index) => {
        switch (inline.type) {
          case "text": {
            let content: React.ReactNode = inline.text;
            if (inline.code) content = <code>{content}</code>;
            if (inline.underline) content = <span className="underline">{content}</span>;
            if (inline.italic) content = <em>{content}</em>;
            if (inline.bold) content = <strong>{content}</strong>;
            return <React.Fragment key={index}>{content}</React.Fragment>;
          }
          case "math":
            return <KatexMath key={index} latex={inline.latex} className="mx-0.5" />;
          case "break":
            return <br key={index} />;
          case "command":
            return (
              <code
                key={index}
                className="mx-0.5 inline-block rounded border border-dashed border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)] px-1 py-0.5 font-mono text-[0.78em] text-muted-foreground"
                title="Lệnh LaTeX chưa được preview ngữ nghĩa. Nội dung gốc vẫn được giữ nguyên trong mã nguồn."
              >
                {inline.command}
              </code>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

/**
 * Semantic preview of MathGlass LaTeX output.
 *
 * This component intentionally does NOT claim to compile LaTeX. It renders the
 * supported semantic subset with KaTeX and makes unsupported commands visible.
 */
export function LatexPreview({
  source,
  className,
  showBanner = true,
}: {
  source: string;
  className?: string;
  showBanner?: boolean;
}) {
  const blocks = React.useMemo(() => parseLatexPreview(source), [source]);

  if (!source.trim()) {
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <Info className="size-5" />
        Chưa có mã LaTeX để xem trước.
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      {showBanner ? (
        <div className="mb-4 flex items-start gap-2 rounded-[12px] border border-[color:var(--mg-info)]/25 bg-[color:var(--mg-info-soft)] px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-[color:var(--mg-info)]" />
          <span>
            Đây là <strong className="text-foreground">preview ngữ nghĩa bằng KaTeX</strong>, không
            phải biên dịch TeX. Các lệnh chưa hỗ trợ được hiển thị rõ thay vì tự loại bỏ.
          </span>
        </div>
      ) : null}
      <div className="mg-prose-preview space-y-1">
        {blocks.map((block, index) => {
          switch (block.type) {
            case "heading": {
              const Tag = (
                block.level <= 1 ? "h2" : block.level === 2 ? "h3" : block.level === 3 ? "h4" : "h5"
              ) as "h2" | "h3" | "h4" | "h5";
              return (
                <Tag key={index}>
                  <Inlines inlines={block.inlines} />
                </Tag>
              );
            }
            case "paragraph":
              return (
                <p key={index}>
                  <Inlines inlines={block.inlines} />
                </p>
              );
            case "math":
              return (
                <div key={index} className="my-3 overflow-x-auto rounded-[10px] bg-[color:var(--mg-bg-soft)]/60 px-3 py-2">
                  <KatexMath latex={block.latex} display />
                </div>
              );
            case "list": {
              const ListTag = block.ordered ? "ol" : "ul";
              return (
                <ListTag key={index}>
                  {block.items.map((item, itemIndex) => (
                    <li key={itemIndex}>
                      <Inlines inlines={item} />
                    </li>
                  ))}
                </ListTag>
              );
            }
            case "table": {
              return (
                <div key={index} className="my-3 overflow-x-auto">
                  <table>
                    <tbody>
                      {block.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {row.map((cell, cellIndex) => {
                            const CellTag = block.hasHeaderRow && rowIndex === 0 ? "th" : "td";
                            return (
                              <CellTag key={cellIndex}>
                                <Inlines inlines={cell} />
                              </CellTag>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            case "image": {
              const target = block.target.replace(/\\detokenize\s*/g, "").replace(/[{}]/g, "");
              return (
                <div
                  key={index}
                  className="my-3 flex items-center gap-3 rounded-[12px] border border-dashed border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)] p-3"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-[color:var(--mg-highlight)] text-primary">
                    <ImageIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">Hình ảnh trong bản xuất</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{target}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Preview không nhúng tài nguyên riêng tư; tệp sẽ có trong bản xuất ZIP.
                    </p>
                  </div>
                </div>
              );
            }
            case "note":
              return (
                <p key={index} className="mg-preview-note flex items-start gap-2">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  {block.text}
                </p>
              );
            case "break":
              return <hr key={index} className="my-5 border-[color:var(--mg-border-subtle)]" />;
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}

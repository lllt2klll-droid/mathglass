"use client";

import * as React from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { BoundingBox } from "@/types/document";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PdfOverlay {
  id: string;
  pageNumber: number;
  bbox: BoundingBox;
  label?: string;
  tone?: "active" | "warning" | "success" | "neutral";
  onClick?: () => void;
}

const TONE_CLASS: Record<NonNullable<PdfOverlay["tone"]>, string> = {
  active:
    "border-[color:var(--mg-primary)] bg-[color:var(--mg-primary)]/14 ring-2 ring-[color:var(--mg-primary)]/35",
  warning:
    "border-[color:var(--mg-warning)] bg-[color:var(--mg-warning)]/14 ring-1 ring-[color:var(--mg-warning)]/30",
  success:
    "border-[color:var(--mg-success)] bg-[color:var(--mg-success)]/12 ring-1 ring-[color:var(--mg-success)]/25",
  neutral: "border-[color:var(--mg-info)] bg-[color:var(--mg-info)]/10",
};

/**
 * PDF source viewer built on PDF.js. It renders real PDF pages in the browser
 * and can overlay parser bounding boxes. It never invents page previews when a
 * source is unavailable.
 */
export function PdfPreview({
  url,
  title,
  pageNumber,
  initialPage = 1,
  onPageChange,
  overlays = [],
  className,
  compact = false,
}: {
  url: string;
  title?: string;
  pageNumber?: number;
  initialPage?: number;
  onPageChange?: (page: number) => void;
  overlays?: PdfOverlay[];
  className?: string;
  compact?: boolean;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const renderTaskRef = React.useRef<{ cancel: () => void } | null>(null);
  const loadingTaskRef = React.useRef<PDFDocumentLoadingTask | null>(null);
  const [document, setDocument] = React.useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = React.useState(initialPage);
  const [numPages, setNumPages] = React.useState(0);
  const [zoom, setZoom] = React.useState(1);
  const [fitWidth, setFitWidth] = React.useState(true);
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [rendering, setRendering] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [revision, setRevision] = React.useState(0);
  const [sizeRevision, setSizeRevision] = React.useState(0);

  const controlledPage = pageNumber !== undefined;
  const currentPage = controlledPage ? pageNumber : page;

  if (controlledPage && pageNumber !== undefined && pageNumber !== page) {
    setPage(pageNumber);
  }

  React.useEffect(() => {
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setDocument(null);
      setNumPages(0);
    });

    import("pdfjs-dist")
      .then(async (pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const loadingTask = pdfjs.getDocument({
          url,
          withCredentials: true,
        });
        loadingTaskRef.current = loadingTask;
        const loaded = await loadingTask.promise;
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }
        setDocument(loaded);
        setNumPages(loaded.numPages);
        setPage((current) => Math.min(Math.max(1, current), loaded.numPages));
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const name =
          cause && typeof cause === "object" && "name" in cause
            ? String((cause as { name?: unknown }).name)
            : "";
        setError(
          name === "PasswordException"
            ? "PDF được bảo vệ bằng mật khẩu nên không thể xem trước."
            : cause instanceof Error
              ? cause.message
              : "Không thể tải PDF nguồn.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      const task = loadingTaskRef.current;
      loadingTaskRef.current = null;
      if (task) void task.destroy();
    };
  }, [url, revision]);

  React.useEffect(() => {
    if (!document) return;
    let cancelled = false;
    const targetPage = Math.min(Math.max(1, currentPage), document.numPages);

    const render = async () => {
      setRendering(true);
      setError(null);
      try {
        const pdfPage = await document.getPage(targetPage);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const available = Math.max(280, (containerRef.current?.clientWidth ?? 720) - 24);
        const scale = fitWidth ? (available / baseViewport.width) * zoom : 1.35 * zoom;
        const viewport = pdfPage.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        setSize({ width: viewport.width, height: viewport.height });

        renderTaskRef.current?.cancel();
        const task = pdfPage.render({
          canvasContext: canvas.getContext("2d") as CanvasRenderingContext2D,
          canvas,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) setRendering(false);
      } catch (cause) {
        if (cancelled) return;
        const name =
          cause && typeof cause === "object" && "name" in cause
            ? String((cause as { name?: unknown }).name)
            : "";
        if (name !== "RenderingCancelledException") {
          setError(cause instanceof Error ? cause.message : "Không thể hiển thị trang PDF.");
        }
        setRendering(false);
      }
    };

    void render();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [document, currentPage, zoom, fitWidth, sizeRevision]);

  React.useEffect(() => {
    if (!fitWidth || !containerRef.current) return;
    const element = containerRef.current;
    const observer = new ResizeObserver(() => {
      setSizeRevision((value) => value + 1);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitWidth]);

  const goToPage = (next: number) => {
    if (!document) return;
    const target = Math.min(Math.max(1, next), document.numPages);
    if (!controlledPage) setPage(target);
    onPageChange?.(target);
  };

  const currentOverlays = overlays.filter((overlay) => overlay.pageNumber === currentPage);

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)]", className)}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-glass-strong)] px-2.5 py-2">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={!document || currentPage <= 1}
          onClick={() => goToPage(currentPage - 1)}
          aria-label="Trang trước"
        >
          <ChevronLeft />
        </Button>
        <div className="flex items-center gap-1 text-xs">
          <input
            type="number"
            min={1}
            max={numPages || 1}
            value={currentPage}
            disabled={!document}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value) && value >= 1) goToPage(value);
            }}
            className="h-7 w-12 rounded-md border border-[color:var(--mg-border-subtle)] bg-surface px-1.5 text-center text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="Số trang"
          />
          <span className="text-muted-foreground">/ {numPages || "—"}</span>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={!document || currentPage >= numPages}
          onClick={() => goToPage(currentPage + 1)}
          aria-label="Trang sau"
        >
          <ChevronRight />
        </Button>
        <span className="mx-1 h-5 w-px bg-[color:var(--mg-border-subtle)]" />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => {
            setFitWidth(false);
            setZoom((value) => Math.max(0.5, Math.round((value - 0.1) * 10) / 10));
          }}
          disabled={!document}
          aria-label="Thu nhỏ"
        >
          <Minus />
        </Button>
        <span className="min-w-10 text-center text-[11px] font-medium tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => {
            setFitWidth(false);
            setZoom((value) => Math.min(2.5, Math.round((value + 0.1) * 10) / 10));
          }}
          disabled={!document}
          aria-label="Phóng to"
        >
          <Plus />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant={fitWidth ? "subtle" : "ghost"}
          onClick={() => {
            setFitWidth(true);
            setZoom(1);
          }}
          disabled={!document}
          aria-label="Vừa chiều rộng"
          title="Vừa chiều rộng"
        >
          <Maximize2 />
        </Button>
        <div className="flex-1" />
        {title ? (
          <span className="hidden max-w-[45%] truncate text-[11px] text-muted-foreground sm:block" title={title}>
            {title}
          </span>
        ) : null}
        {!compact ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => setRevision((value) => value + 1)}
            aria-label="Tải lại PDF"
          >
            <RefreshCw />
          </Button>
        ) : null}
      </div>

      <div ref={containerRef} className="mg-scrollbar relative flex min-h-0 flex-1 justify-center overflow-auto p-3">
        {loading ? (
          <div className="flex min-h-52 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" />
            Đang tải PDF nguồn…
          </div>
        ) : error ? (
          <div className="flex min-h-52 max-w-sm flex-col items-center justify-center gap-2 rounded-[12px] border border-[color:var(--mg-danger)]/30 bg-[color:var(--mg-danger-soft)] p-5 text-center">
            <p className="text-sm font-semibold">Không thể hiển thị PDF</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div className="relative shrink-0" style={size ? { width: size.width, height: size.height } : undefined}>
            <canvas ref={canvasRef} className="block rounded-[6px] bg-white shadow-[0_10px_30px_-18px_rgba(23,43,77,0.45)]" />
            {rendering ? (
              <div className="absolute inset-0 grid place-items-center bg-[color:var(--mg-bg)]/40">
                <Loader2 className="size-5 animate-spin text-primary" />
              </div>
            ) : null}
            {size
              ? currentOverlays.map((overlay) => (
                  <button
                    key={overlay.id}
                    type="button"
                    onClick={overlay.onClick}
                    title={overlay.label}
                    aria-label={overlay.label ?? "Vùng nguồn"}
                    className={cn(
                      "absolute rounded-[3px] border transition-shadow",
                      TONE_CLASS[overlay.tone ?? "neutral"],
                      overlay.onClick ? "cursor-pointer" : "pointer-events-none",
                    )}
                    style={{
                      left: `${overlay.bbox.x * 100}%`,
                      top: `${overlay.bbox.y * 100}%`,
                      width: `${overlay.bbox.width * 100}%`,
                      height: `${overlay.bbox.height * 100}%`,
                    }}
                  />
                ))
              : null}
          </div>
        )}
      </div>
    </div>
  );
}

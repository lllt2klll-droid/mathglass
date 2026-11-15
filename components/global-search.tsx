"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileSearch, Loader2, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { ProjectListItem } from "@/types/project";
import { cn } from "@/lib/utils";

interface SearchResponse {
  query: string;
  projects: ProjectListItem[];
  blocks: Array<{
    projectId: string;
    projectName: string;
    blockId: string;
    blockType: string;
    preview: string;
  }>;
}

export function GlobalSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setResults(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await apiFetch<SearchResponse>(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        setResults(data);
        setActive(0);
      } catch {
        if (!controller.signal.aborted) setResults(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 260);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const items = React.useMemo(
    () => [
      ...(results?.projects.map((project) => ({
        kind: "project" as const,
        id: project.id,
        title: project.name,
        subtitle: project.sourceFilename || "Dự án",
        href: `/studio/${project.id}`,
      })) ?? []),
      ...(results?.blocks.map((block) => ({
        kind: "block" as const,
        id: block.blockId,
        title: block.projectName,
        subtitle: block.preview,
        href: `/accuracy/${block.projectId}?block=${block.blockId}`,
      })) ?? []),
    ],
    [results],
  );

  const navigate = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <div ref={containerRef} className={cn("relative w-full max-w-md", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls="global-search-results"
          aria-label="Tìm kiếm dự án và nội dung"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current) => Math.min(current + 1, Math.max(0, items.length - 1)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => Math.max(0, current - 1));
            } else if (event.key === "Enter" && items[active]) {
              event.preventDefault();
              navigate(items[active].href);
            } else if (event.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Tìm dự án, công thức…  (Ctrl K)"
          className="h-9 w-full rounded-[11px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-surface)]/80 pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground/75 focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Xóa tìm kiếm"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {open && query.trim().length >= 2 ? (
        <div
          id="global-search-results"
          role="listbox"
          className="mg-glass-strong absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[420px] overflow-y-auto rounded-[16px] p-2 shadow-xl"
        >
          {loading ? (
            <p className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Đang tìm…
            </p>
          ) : items.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Không có kết quả cho “{query.trim()}”.
            </p>
          ) : (
            <>
              {results && results.projects.length > 0 ? (
                <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Dự án
                </p>
              ) : null}
              {items.map((item, index) => {
                const firstBlock =
                  item.kind === "project" ? false : index > 0 && items[index - 1].kind === "project";
                return (
                  <React.Fragment key={`${item.kind}-${item.id}`}>
                    {item.kind === "block" && (index === 0 || items[index - 1]?.kind !== "block") ? (
                      <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Nội dung
                      </p>
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={active === index}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => navigate(item.href)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-[10px] px-2 py-2 text-left",
                        active === index ? "bg-[color:var(--mg-highlight)]" : "hover:bg-[color:var(--mg-highlight)]",
                      )}
                    >
                      <FileSearch className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">{item.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {firstBlock && item.subtitle.length > 90
                            ? `${item.subtitle.slice(0, 90)}…`
                            : item.subtitle}
                        </span>
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

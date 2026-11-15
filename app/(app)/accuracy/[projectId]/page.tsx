"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronLeft,
  FileWarning,
  Loader2,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { cn, formatDateTime } from "@/lib/utils";
import { confidenceLabel, getConfidenceBand } from "@/config/site";
import type {
  BlockContent,
  DocumentAst,
  DocumentBlock,
  InlineNode,
} from "@/types/document";
import type { ProjectDetail, ReviewReport } from "@/types/project";
import { AstInlines, KatexMath } from "@/components/math-content";
import { PdfPreview } from "@/components/pdf-preview";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";

interface ReviewResponse {
  report: ReviewReport;
  ast: DocumentAst;
  project: {
    id: string;
    name: string;
    status: string;
    sourceType: string;
    sourceFilename: string;
    pageCount: number | null;
  };
}

interface BlockPatchResponse {
  block: DocumentBlock;
  report: ReviewReport;
  project: ProjectDetail;
  latex: { source: string; valid: boolean; diagnostics: unknown[] } | null;
}

type FilterKey = "attention" | "all" | "math";

function flattenBlocks(ast: DocumentAst): DocumentBlock[] {
  return ast.pages
    .flatMap((page) => page.blocks)
    .sort((left, right) => left.order - right.order);
}

function blockNeedsAttention(block: DocumentBlock): boolean {
  return (
    block.status === "needs_review" ||
    block.status === "unsupported" ||
    block.confidenceBand === "low" ||
    block.confidenceBand === "unknown"
  );
}

function isMathBlock(block: DocumentBlock): boolean {
  return block.type === "display_math";
}

function BlockContentView({ content }: { content: BlockContent }) {
  switch (content.kind) {
    case "heading":
      return (
        <p className="text-sm font-semibold">
          <AstInlines inlines={content.inlines} />
        </p>
      );
    case "paragraph":
      return (
        <p className="text-sm leading-relaxed">
          <AstInlines inlines={content.inlines} />
        </p>
      );
    case "display_math":
      return <KatexMath latex={content.latex} display />;
    case "list":
      return (
        <div className="space-y-1 text-sm">
          {content.items.map((item, index) => (
            <p key={item.id ?? index} className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">
                {content.ordered ? `${(content.start ?? 1) + index}.` : "•"}
              </span>
              <AstInlines inlines={item.inlines} />
            </p>
          ))}
        </div>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {content.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-[color:var(--mg-border-subtle)]">
                  {row.map((cell, cellIndex) => {
                    const CellTag = content.hasHeaderRow && rowIndex === 0 ? "th" : "td";
                    return (
                      <CellTag
                        key={cellIndex}
                        className={cn(
                          "px-2 py-1 text-left align-top",
                          content.hasHeaderRow && rowIndex === 0 && "font-semibold",
                        )}
                      >
                        <AstInlines inlines={cell.inlines} />
                      </CellTag>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/assets/${content.assetId}`}
          alt={content.alt || content.filename}
          className="max-h-64 rounded-md border border-[color:var(--mg-border-subtle)] object-contain"
        />
      );
    case "geometry":
      return (
        <p className="text-sm italic text-muted-foreground">
          Hình học: {content.description}
          {content.assetId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/assets/${content.assetId}`}
              alt={content.description}
              className="mt-2 max-h-56 rounded-md border border-[color:var(--mg-border-subtle)] object-contain"
            />
          ) : null}
        </p>
      );
    case "page_break":
      return <p className="text-xs text-muted-foreground">— Ngắt trang —</p>;
    case "header":
    case "footer":
      return (
        <p className="text-xs text-muted-foreground">
          {content.kind === "header" ? "Đầu trang: " : "Chân trang: "}
          <AstInlines inlines={content.inlines} />
        </p>
      );
    case "unknown":
      return (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[color:var(--mg-warning)]">
            Nội dung chưa hỗ trợ: {content.reason}
          </p>
          {content.rawText ? (
            <pre className="max-h-40 overflow-auto rounded-md bg-[color:var(--mg-bg-soft)] p-2 font-mono text-[11px]">
              {content.rawText}
            </pre>
          ) : null}
        </div>
      );
    default:
      return null;
  }
}

function ConfidenceBadge({ block }: { block: DocumentBlock }) {
  const band = block.confidenceBand ?? getConfidenceBand(block.confidence);
  const percent =
    typeof block.confidence === "number" ? `${Math.round(block.confidence * 100)}%` : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        band === "high" && "bg-[color:var(--mg-success-soft)] text-[color:var(--mg-success)]",
        band === "medium" && "bg-[color:var(--mg-warning-soft)] text-[color:var(--mg-warning)]",
        band === "low" && "bg-[color:var(--mg-danger-soft)] text-[color:var(--mg-danger)]",
        band === "unknown" && "bg-[color:var(--mg-bg-soft)] text-muted-foreground",
      )}
    >
      {confidenceLabel(band)}
      {percent ? ` · ${percent}` : ""}
    </span>
  );
}

function AccuracyProjectInner() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const projectId = params.projectId;
  const { toast } = useToast();

  const review = useApi<ReviewResponse>(`/api/projects/${projectId}/review`);
  const [filter, setFilter] = React.useState<FilterKey>("attention");
  const [selectedId, setSelectedId] = React.useState<string | null>(
    searchParams.get("block"),
  );
  const [editLatex, setEditLatex] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);

  const blocks = React.useMemo(
    () => (review.data ? flattenBlocks(review.data.ast) : []),
    [review.data],
  );

  const visibleBlocks = React.useMemo(() => {
    if (filter === "attention") return blocks.filter(blockNeedsAttention);
    if (filter === "math") return blocks.filter(isMathBlock);
    return blocks;
  }, [blocks, filter]);

  const selected = React.useMemo(
    () => blocks.find((block) => block.id === selectedId) ?? null,
    [blocks, selectedId],
  );

  if (!selectedId && visibleBlocks.length > 0) {
    setSelectedId(visibleBlocks[0].id);
  }

  const act = async (
    action: "accept" | "reject" | "ignore" | "reset" | "edit",
    latex?: string,
  ) => {
    if (!selected) return;
    setActing(action);
    try {
      const result = await apiFetch<BlockPatchResponse>(
        `/api/projects/${projectId}/blocks/${selected.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(action === "edit" ? { action, latex } : { action }),
        },
      );
      setEditLatex(null);
      review.setData((current) =>
        current
          ? {
              ...current,
              report: result.report,
              project: { ...current.project, status: result.project.status },
            }
          : current,
      );
      // Refresh AST so the edited block reflects server state.
      review.refresh();
      toast({
        title:
          action === "accept"
            ? "Đã chấp nhận block"
            : action === "reject"
              ? "Đã từ chối block"
              : action === "ignore"
                ? "Đã bỏ qua block"
                : action === "edit"
                  ? "Đã lưu công thức"
                  : "Đã đặt lại block",
        tone: "success",
      });
    } catch (cause) {
      toast({
        title: "Thao tác thất bại",
        description: cause instanceof Error ? cause.message : "Không thể cập nhật block.",
        tone: "danger",
      });
    } finally {
      setActing(null);
    }
  };

  const submitEdit = () => {
    if (editLatex === null) return;
    void act("edit", editLatex);
  };

  const data = review.data;
  const sourceType = data?.project.sourceType;

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[560px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/accuracy">
            <ChevronLeft className="size-4" /> Accuracy Lab
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">{data?.project.name ?? "Đang tải…"}</h1>
          {data ? (
            <p className="text-[11px] text-muted-foreground">
              {data.project.sourceFilename} · {data.report.totalPages} trang ·{" "}
              {data.report.totalBlocks} block · đo lúc {formatDateTime(data.report.measuredAt)}
            </p>
          ) : null}
        </div>
        {data ? (
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={data.report.needsReview > 0 ? "needs_review" : "ready"} />
            <span className="rounded-full bg-[color:var(--mg-bg-soft)] px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {data.report.mathBlocks} công thức
            </span>
            <span className="rounded-full bg-[color:var(--mg-bg-soft)] px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {data.report.accepted} đã xác nhận
            </span>
            <span className="rounded-full bg-[color:var(--mg-warning-soft)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--mg-warning)]">
              {data.report.needsReview} cần xem
            </span>
          </div>
        ) : null}
      </div>

      {review.loading && !data ? (
        <div className="grid flex-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-full rounded-[18px]" />
          <Skeleton className="h-full rounded-[18px]" />
        </div>
      ) : review.error ? (
        <Card className="p-6">
          <EmptyState
            icon={ShieldAlert}
            title="Không tải được dữ liệu đối chiếu"
            description={review.error}
            action={
              <Button variant="secondary" onClick={() => review.refresh()}>
                Thử lại
              </Button>
            }
          />
        </Card>
      ) : data ? (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* LEFT — source document */}
          <div className="flex min-h-0 flex-col gap-3">
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
              <div className="border-b border-[color:var(--mg-border-subtle)] px-4 py-2.5 text-xs font-semibold">
                Tài liệu gốc
              </div>
              <div className="min-h-0 flex-1">
                {sourceType === "pdf" ? (
                  <PdfPreview
                    url={`/api/projects/${projectId}/source`}
                    title={data.project.sourceFilename}
                    pageNumber={selected?.pageNumber}
                    className="h-full rounded-none border-0"
                  />
                ) : sourceType === "image" ? (
                  <div className="flex h-full items-center justify-center overflow-auto p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/projects/${projectId}/source`}
                      alt={data.project.sourceFilename}
                      className="max-h-full max-w-full rounded-md object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-6">
                    <EmptyState
                      icon={FileWarning}
                      title="Không có xem trước trực quan"
                      description={`Tệp ${data.project.sourceFilename} (${sourceType}) không có preview nhúng. Hãy dùng bản PDF gốc hoặc xem block bên phải.`}
                    />
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* RIGHT — review queue + detail */}
          <div className="flex min-h-0 flex-col gap-3">
            <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterKey)}>
              <TabsList>
                <TabsTrigger value="attention">
                  Cần kiểm tra ({blocks.filter(blockNeedsAttention).length})
                </TabsTrigger>
                <TabsTrigger value="math">Công thức ({blocks.filter(isMathBlock).length})</TabsTrigger>
                <TabsTrigger value="all">Tất cả ({blocks.length})</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              {/* Queue */}
              <Card className="flex min-h-0 flex-col overflow-hidden">
                <div className="mg-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
                  {visibleBlocks.length === 0 ? (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                      Không có block nào trong nhóm này.
                    </p>
                  ) : (
                    visibleBlocks.map((block, index) => (
                      <button
                        key={block.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(block.id);
                          setEditLatex(null);
                        }}
                        className={cn(
                          "mb-1 flex w-full items-start gap-2 rounded-[10px] px-2.5 py-2 text-left transition-colors",
                          selectedId === block.id
                            ? "bg-[color:var(--mg-highlight)] ring-1 ring-primary/20"
                            : "hover:bg-[color:var(--mg-bg-soft)]",
                        )}
                      >
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-[color:var(--mg-bg-soft)] text-[10px] font-bold text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {block.type}
                            </span>
                            <ConfidenceBadge block={block} />
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-foreground/90">
                            {blockPreview(block)}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            Trang {block.pageNumber} · {block.status}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </Card>

              {/* Detail */}
              <Card className="flex min-h-0 flex-col overflow-hidden">
                {!selected ? (
                  <div className="flex flex-1 items-center justify-center p-6">
                    <EmptyState
                      icon={ScanSearch}
                      title="Chọn một block"
                      description="Chọn block ở danh sách bên trái để đối chiếu nội dung gốc và kết quả nhận diện."
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--mg-border-subtle)] px-4 py-2.5">
                      <StatusBadge status={selected.status} />
                      <ConfidenceBadge block={selected} />
                      <span className="text-[11px] text-muted-foreground">
                        Trang {selected.pageNumber} · loại {selected.type}
                      </span>
                      <div className="flex-1" />
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={acting !== null}
                        onClick={() => void act("accept")}
                      >
                        {acting === "accept" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        Chấp nhận
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={acting !== null}
                        onClick={() => void act("ignore")}
                      >
                        Bỏ qua
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-[color:var(--mg-danger)]"
                        disabled={acting !== null}
                        onClick={() => void act("reject")}
                      >
                        <X className="size-3.5" /> Từ chối
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={acting !== null}
                        onClick={() => void act("reset")}
                        aria-label="Đặt lại block"
                      >
                        <RotateCcw className="size-3.5" />
                      </Button>
                    </div>

                    <div className="mg-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                      {selected.warnings.length > 0 ? (
                        <Alert tone="warning" title="Cảnh báo nhận diện">
                          <ul className="list-inside list-disc space-y-0.5">
                            {selected.warnings.map((warning, index) => (
                              <li key={index}>{warning}</li>
                            ))}
                          </ul>
                        </Alert>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[12px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)]/60 p-3">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Nội dung gốc (parser)
                          </p>
                          <BlockContentView content={selected.originalContent} />
                        </div>
                        <div className="rounded-[12px] border border-[color:var(--mg-border-subtle)] bg-surface p-3">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Kết quả hiện tại
                          </p>
                          <BlockContentView content={selected.content} />
                        </div>
                      </div>

                      {selected.content.kind === "display_math" ? (
                        <div className="space-y-2">
                          <Label htmlFor="block-latex">Sửa LaTeX của block này</Label>
                          {editLatex === null ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setEditLatex(selected.content.kind === "display_math" ? selected.content.latex : "")}
                            >
                              Chỉnh sửa công thức
                            </Button>
                          ) : (
                            <div className="space-y-2">
                              <Textarea
                                id="block-latex"
                                value={editLatex}
                                onChange={(event) => setEditLatex(event.target.value)}
                                rows={5}
                                className="font-mono text-xs"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={submitEdit} disabled={acting !== null}>
                                  {acting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                                  Lưu & áp dụng
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditLatex(null)}>
                                  Hủy
                                </Button>
                              </div>
                              <KatexMath latex={editLatex} display />
                            </div>
                          )}
                        </div>
                      ) : null}

                      {selected.content.kind === "unknown" && selected.content.rawText ? (
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Văn bản gốc chưa nhận diện
                          </p>
                          <pre className="max-h-48 overflow-auto rounded-md bg-[color:var(--mg-bg-soft)] p-2 font-mono text-[11px]">
                            {selected.content.rawText}
                          </pre>
                        </div>
                      ) : null}

                      {selected.content.kind === "display_math" && selected.content.provenance ? (
                        <p className="text-[10px] text-muted-foreground">
                          Nguồn nhận diện: {selected.content.provenance.providerId ?? "parser"}
                          {selected.content.provenance.model ? ` · ${selected.content.provenance.model}` : ""}
                          {selected.content.provenance.recognizedAt
                            ? ` · ${formatDateTime(selected.content.provenance.recognizedAt)}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  </>
                )}
              </Card>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function blockPreview(block: DocumentBlock): string {
  const content = block.content;
  switch (content.kind) {
    case "heading":
    case "paragraph":
    case "header":
    case "footer": {
      const text = content.inlines
        .map((inline: InlineNode) => (inline.type === "text" ? inline.text : inline.type === "math" ? inline.latex : " "))
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      return text || `(${content.kind})`;
    }
    case "display_math":
      return content.latex;
    case "list":
      return content.items
        .map((item) =>
          item.inlines
            .map((inline: InlineNode) => (inline.type === "text" ? inline.text : inline.type === "math" ? inline.latex : " "))
            .join("")
            .trim(),
        )
        .join(" · ")
        .slice(0, 160);
    case "table":
      return `${content.rows.length} hàng × ${content.rows[0]?.length ?? 0} cột`;
    case "image":
      return content.alt || content.filename;
    case "geometry":
      return content.description;
    case "unknown":
      return content.rawText?.slice(0, 160) ?? content.reason;
    case "page_break":
      return "Ngắt trang";
    default:
      return block.type;
  }
}

export default function AccuracyProjectPage() {
  return (
    <React.Suspense
      fallback={
        <div className="grid flex-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-[18px]" />
          <Skeleton className="h-96 rounded-[18px]" />
        </div>
      }
    >
      <AccuracyProjectInner />
    </React.Suspense>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownAZ,
  ArrowUpDown,
  ArrowUpAZ,
  Copy,
  FileText,
  FileImage,
  FileType,
  Library as LibraryIcon,
  Loader2,
  Pencil,
  Plus,
  ScanSearch,
  Search,
  Trash2,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";
import type { ProjectListItem, ProjectStatus } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

interface ProjectsResponse {
  items: ProjectListItem[];
  total: number;
  page: number;
  pageSize: number;
}

type SortKey = "updated" | "created" | "name";

const STATUS_OPTIONS: Array<{ value: ProjectStatus | "all"; label: string }> = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "draft", label: "Bản nháp" },
  { value: "processing", label: "Đang xử lý" },
  { value: "needs_review", label: "Cần kiểm tra" },
  { value: "ready", label: "Sẵn sàng" },
  { value: "failed", label: "Thất bại" },
  { value: "archived", label: "Lưu trữ" },
];

function SourceIcon({ type }: { type: ProjectListItem["sourceType"] }) {
  if (type === "pdf") return <FileText className="size-4" />;
  if (type === "image") return <FileImage className="size-4" />;
  if (type === "docx") return <FileType className="size-4" />;
  return <LibraryIcon className="size-4" />;
}

export default function LibraryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [status, setStatus] = React.useState<ProjectStatus | "all">("all");
  const [sort, setSort] = React.useState<SortKey>("updated");
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc");
  const [renameTarget, setRenameTarget] = React.useState<ProjectListItem | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<ProjectListItem | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const params = React.useMemo(() => {
    const search = new URLSearchParams({
      sort,
      direction,
      pageSize: "100",
    });
    if (debouncedQuery) search.set("q", debouncedQuery);
    if (status !== "all") search.set("status", status);
    return search.toString();
  }, [debouncedQuery, status, sort, direction]);

  const projects = useApi<ProjectsResponse>(`/api/projects?${params}`);

  const refresh = () => projects.refresh();

  const openProject = (project: ProjectListItem) => {
    if (project.status === "needs_review" || project.needsReviewCount > 0) {
      router.push(`/accuracy/${project.id}`);
    } else {
      router.push(`/studio/${project.id}`);
    }
  };

  const duplicate = async (project: ProjectListItem) => {
    setBusyId(project.id);
    try {
      await apiFetch(`/api/projects/${project.id}/duplicate`, { method: "POST" });
      toast({ title: "Đã sao chép dự án", description: project.name, tone: "success" });
      refresh();
    } catch (cause) {
      toast({
        title: "Sao chép thất bại",
        description: cause instanceof Error ? cause.message : "Không thể sao chép dự án.",
        tone: "danger",
      });
    } finally {
      setBusyId(null);
    }
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) return;
    setBusyId(renameTarget.id);
    try {
      await apiFetch(`/api/projects/${renameTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      toast({ title: "Đã đổi tên dự án", tone: "success" });
      setRenameTarget(null);
      refresh();
    } catch (cause) {
      toast({
        title: "Đổi tên thất bại",
        description: cause instanceof Error ? cause.message : "Không thể đổi tên dự án.",
        tone: "danger",
      });
    } finally {
      setBusyId(null);
    }
  };

  const items = projects.data?.items ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Thư viện dự án</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý mọi tài liệu đã tải lên, trạng thái chuyển đổi và phiên bản LaTeX.
          </p>
        </div>
        <Button asChild>
          <Link href="/convert">
            <Plus className="size-4" /> Dự án mới
          </Link>
        </Button>
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên dự án hoặc tên tệp gốc…"
            className="pl-9"
            aria-label="Tìm kiếm dự án"
          />
        </div>
        <Select value={status} onValueChange={(value) => setStatus(value as ProjectStatus | "all")}>
          <SelectTrigger className="sm:w-48" aria-label="Lọc theo trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
          <SelectTrigger className="sm:w-44" aria-label="Sắp xếp">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Cập nhật gần nhất</SelectItem>
            <SelectItem value="created">Ngày tạo</SelectItem>
            <SelectItem value="name">Tên A–Z</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={() => setDirection((current) => (current === "asc" ? "desc" : "asc"))}
          aria-label={direction === "asc" ? "Đang tăng dần" : "Đang giảm dần"}
          title={direction === "asc" ? "Tăng dần" : "Giảm dần"}
        >
          {direction === "asc" ? <ArrowUpAZ className="size-4" /> : <ArrowDownAZ className="size-4" />}
        </Button>
      </Card>

      {projects.loading && !projects.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44 rounded-[18px]" />
          ))}
        </div>
      ) : projects.error ? (
        <Card className="p-6">
          <EmptyState
            icon={LibraryIcon}
            title="Không tải được thư viện"
            description={projects.error}
            action={
              <Button variant="secondary" onClick={refresh}>
                Thử lại
              </Button>
            }
          />
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={LibraryIcon}
            title="Chưa có dự án nào"
            description={
              debouncedQuery || status !== "all"
                ? "Không có dự án phù hợp với bộ lọc hiện tại."
                : "Tải lên PDF, DOCX hoặc hình ảnh tài liệu Toán để bắt đầu chuyển đổi sang LaTeX."
            }
            action={
              <Button asChild>
                <Link href="/convert">
                  <Plus className="size-4" /> Tải tài liệu lên
                </Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Hiển thị {items.length} / {projects.data?.total ?? items.length} dự án
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((project) => (
              <Card
                key={project.id}
                className="group flex flex-col p-5 transition-shadow hover:shadow-[0_18px_40px_-24px_rgba(23,43,77,0.4)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-[color:var(--mg-highlight)] text-primary">
                      <SourceIcon type={project.sourceType} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold" title={project.name}>
                        {project.name}
                      </h2>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {project.sourceFilename || "Không có tệp gốc"}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={project.status} />
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-[9px] bg-[color:var(--mg-bg-soft)] px-2 py-1.5">
                    <dt className="text-muted-foreground">Trang</dt>
                    <dd className="font-semibold tabular-nums">{project.pageCount ?? "—"}</dd>
                  </div>
                  <div className="rounded-[9px] bg-[color:var(--mg-bg-soft)] px-2 py-1.5">
                    <dt className="text-muted-foreground">Block</dt>
                    <dd className="font-semibold tabular-nums">{project.blockCount}</dd>
                  </div>
                  <div className="rounded-[9px] bg-[color:var(--mg-bg-soft)] px-2 py-1.5">
                    <dt className="text-muted-foreground">Cần xem</dt>
                    <dd
                      className={cn(
                        "font-semibold tabular-nums",
                        project.needsReviewCount > 0 && "text-[color:var(--mg-warning)]",
                      )}
                    >
                      {project.needsReviewCount}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-[11px] text-muted-foreground">
                  Cập nhật {formatRelative(project.updatedAt)} · {formatDateTime(project.updatedAt)}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-[color:var(--mg-border-subtle)] pt-3">
                  <Button size="sm" variant="secondary" onClick={() => openProject(project)}>
                    {project.needsReviewCount > 0 ? (
                      <ScanSearch className="size-3.5" />
                    ) : (
                      <ArrowUpDown className="size-3.5" />
                    )}
                    {project.needsReviewCount > 0 ? "Đối chiếu" : "Mở Studio"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === project.id}
                    onClick={() => {
                      setRenameTarget(project);
                      setRenameValue(project.name);
                    }}
                    aria-label={`Đổi tên ${project.name}`}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === project.id}
                    onClick={() => void duplicate(project)}
                    aria-label={`Sao chép ${project.name}`}
                  >
                    {busyId === project.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[color:var(--mg-danger)] hover:bg-[color:var(--mg-danger-soft)]"
                    onClick={() => setDeleteTarget(project)}
                    aria-label={`Xóa ${project.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đổi tên dự án</DialogTitle>
            <DialogDescription>
              Tên hiển thị trong thư viện và LaTeX Studio. Không ảnh hưởng nội dung tài liệu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-project">Tên dự án</Label>
            <Input
              id="rename-project"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              maxLength={160}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitRename();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>
              Hủy
            </Button>
            <Button onClick={() => void submitRename()} disabled={!renameValue.trim() || busyId === renameTarget?.id}>
              {busyId === renameTarget?.id ? <Loader2 className="size-4 animate-spin" /> : null}
              Lưu tên
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Xóa dự án?"
        description={`Dự án “${deleteTarget?.name ?? ""}” cùng tài liệu nguồn, block nhận diện và phiên bản LaTeX sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa vĩnh viễn"
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return;
          setBusyId(deleteTarget.id);
          try {
            await apiFetch(`/api/projects/${deleteTarget.id}`, { method: "DELETE" });
            toast({ title: "Đã xóa dự án", tone: "success" });
            setDeleteTarget(null);
            refresh();
          } catch (cause) {
            toast({
              title: "Xóa thất bại",
              description: cause instanceof Error ? cause.message : "Không thể xóa dự án.",
              tone: "danger",
            });
          } finally {
            setBusyId(null);
          }
        }}
      />
    </div>
  );
}


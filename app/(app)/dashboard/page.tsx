"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  FileImage,
  FileText,
  Files,
  HardDrive,
  LayoutTemplate,
  Loader2,
  Plus,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  Wand2,
} from "lucide-react";
import { useApi } from "@/lib/use-api";
import type { ProjectListItem, ProjectStats } from "@/types/project";
import type { ProviderPublicConfig } from "@/types/ai";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { formatBytes, formatRelative, percent } from "@/lib/utils";

interface DashboardData {
  version: string;
  stats: ProjectStats;
  recent: ProjectListItem[];
  notifications: Array<{
    id: string;
    projectId: string;
    projectName: string;
    status: string;
    message: string;
    createdAt: string;
  }>;
  provider: ProviderPublicConfig;
  workspace: { name: string; createdAt: string; projectCount: number; storageBytes: number };
  storage: { ephemeral: boolean; sizeBytes: number; mode: string };
  compiler: { configured: boolean; engine: string | null; reason: string };
  limits: { maxUploadBytes: number; maxPages: number };
  features: { imageOcr: boolean; pdfCompilation: boolean };
}

const quickActions = [
  {
    type: "pdf",
    title: "PDF tài liệu",
    description: "Trích xuất text layer, nhận diện trang scan và công thức.",
    icon: FileText,
    accent: "from-[#4C7BE0]/18 to-[#8FC0FF]/8",
    iconClass: "text-[#3B6BD6]",
  },
  {
    type: "docx",
    title: "Word (.docx)",
    description: "Phân tích OOXML, bảng, hình ảnh và phương trình OMML.",
    icon: Files,
    accent: "from-[#2F8C78]/16 to-[#8FE0CF]/8",
    iconClass: "text-[#227D69]",
  },
  {
    type: "image",
    title: "Ảnh đề bài",
    description: "OCR bằng nhà cung cấp vision đã cấu hình, có đánh dấu kiểm tra.",
    icon: FileImage,
    accent: "from-[#B7791F]/16 to-[#F3D08A]/8",
    iconClass: "text-[#9A6411]",
  },
];

export default function DashboardPage() {
  const { data, error, loading, refresh } = useApi<DashboardData>("/api/dashboard");

  if (loading && !data) return <DashboardSkeleton />;
  if (error && !data) {
    return (
      <div className="mx-auto max-w-7xl">
        <Alert tone="danger" title="Không tải được dashboard">
          {error}
          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={refresh}>
              Thử lại
            </Button>
          </div>
        </Alert>
      </div>
    );
  }
  if (!data) return null;

  const { stats, recent, provider, compiler, storage } = data;

  return (
    <div id="main-content" className="mx-auto max-w-7xl space-y-6">
      <section className="relative overflow-hidden rounded-[24px] border border-[color:var(--mg-border)] bg-[color:var(--mg-glass-strong)] p-6 shadow-[0_24px_60px_-34px_rgba(23,43,77,0.45)] backdrop-blur-xl sm:p-8">
        <div
          className="pointer-events-none absolute -right-16 -top-24 size-[320px] rounded-full bg-[radial-gradient(circle,rgba(108,168,245,0.32),transparent_65%)]"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mg-primary)]/20 bg-[color:var(--mg-highlight)] px-2.5 py-1 text-[11px] font-semibold text-primary">
              <Sparkles className="size-3.5" />
              MathGlass {data.version} · Quy trình có thể đối chiếu
            </p>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
              Chuyển tài liệu Toán thành LaTeX,
              <span className="text-muted-foreground"> không đánh đổi độ chính xác.</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Tải PDF, Word hoặc ảnh đề bài. MathGlass giữ liên kết với trang nguồn, đánh dấu mọi
              nội dung chưa chắc chắn và chỉ tạo PDF khi có dịch vụ biên dịch sandbox thật.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild size="lg">
                <Link href="/convert">
                  <UploadCloud className="size-4" />
                  Chuyển đổi tài liệu
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/library">
                  <Files className="size-4" />
                  Mở thư viện
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="/templates">
                  <LayoutTemplate className="size-4" />
                  Chọn template
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-2 lg:w-[320px]">
            <MiniMetric label="Dự án" value={data.workspace.projectCount} icon={Files} />
            <MiniMetric label="Cần kiểm tra" value={stats.needsReview} icon={ShieldAlert} tone="warning" />
            <MiniMetric label="Sẵn sàng" value={stats.converted} icon={CheckCircle2} tone="success" />
            <MiniMetric
              label="Lưu trữ"
              value={formatBytes(stats.storageBytes)}
              icon={HardDrive}
              tone="info"
            />
          </div>
        </div>
      </section>

      {storage.ephemeral ? (
        <Alert tone="warning" title="Dữ liệu sẽ không tồn tại sau khi máy chủ khởi động lại">
          Môi trường hiện tại dùng lưu trữ tạm thời (ephemeral). Hãy xuất `.tex`/`.zip` cho các dự án
          quan trọng hoặc cấu hình `MATHGLASS_DATA_DIR` / adapter Supabase trước khi dùng thật.
        </Alert>
      ) : null}

      {!provider.enabled || !provider.hasApiKey ? (
        <Alert tone="info" title="Vision AI chưa được cấu hình">
          PDF có text layer và DOCX vẫn chuyển đổi được. Ảnh và PDF scan cần nhà cung cấp vision
          thật để OCR — MathGlass không tạo nội dung giả.{" "}
          <Link href="/settings" className="font-semibold text-primary hover:underline">
            Cấu hình provider
          </Link>
        </Alert>
      ) : null}

      {!compiler.configured ? (
        <Alert tone="warning" title="Biên dịch PDF đang tắt">
          {compiler.reason}{" "}
          <Link href="/settings" className="font-semibold text-primary hover:underline">
            Xem trạng thái compiler
          </Link>
        </Alert>
      ) : null}

      <section aria-labelledby="stats-title">
        <h2 id="stats-title" className="sr-only">
          Thống kê workspace
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Tài liệu đã tải"
            value={stats.totalDocuments}
            hint={`${stats.totalBlocks} block · ${stats.drafts} bản nháp`}
            icon={Files}
            accent="text-[#3B6BD6]"
          />
          <StatCard
            label="Cần giáo viên kiểm tra"
            value={stats.needsReview}
            hint={stats.needsReview > 0 ? "Mở Accuracy Lab để xử lý" : "Không có mục tồn đọng"}
            icon={ShieldAlert}
            accent="text-[#A66A10]"
          />
          <StatCard
            label="Sẵn sàng sử dụng"
            value={stats.converted}
            hint={`${percent(stats.converted, Math.max(1, stats.totalDocuments))}% dự án đã ổn định`}
            icon={CheckCircle2}
            accent="text-[#21865B]"
          />
          <StatCard
            label="Dung lượng workspace"
            value={formatBytes(stats.storageBytes)}
            hint={`${stats.processing} đang xử lý · ${stats.failed} thất bại`}
            icon={HardDrive}
            accent="text-[#5C6E8D]"
          />
        </div>
      </section>

      <section aria-labelledby="quick-title" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="quick-title" className="text-lg font-semibold tracking-[-0.015em]">
              Bắt đầu nhanh
            </h2>
            <p className="text-sm text-muted-foreground">
              Giới hạn hiện tại: {formatBytes(data.limits.maxUploadBytes)} mỗi tệp, tối đa{" "}
              {data.limits.maxPages} trang.
            </p>
          </div>
          <Link href="/convert" className="text-xs font-semibold text-primary hover:underline">
            Mở Import Studio
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.type}
                href={`/convert?type=${action.type}`}
                className={`group relative overflow-hidden rounded-[18px] border border-[color:var(--mg-border)] bg-gradient-to-br ${action.accent} p-5 shadow-[0_14px_36px_-28px_rgba(23,43,77,0.4)] backdrop-blur-md transition-transform duration-150 hover:-translate-y-0.5`}
              >
                <span className={`inline-grid size-10 place-items-center rounded-[12px] bg-white/70 shadow-sm dark:bg-white/10 ${action.iconClass}`}>
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-3 text-sm font-semibold">{action.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-foreground/80 transition-transform group-hover:translate-x-0.5">
                  Tải tệp <ArrowRight className="size-3.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Dự án gần đây</CardTitle>
              <CardDescription>Cập nhật theo lần mở và chỉnh sửa cuối.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/library">
                Xem tất cả <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState
                icon={UploadCloud}
                title="Chưa có dự án nào"
                description="Tải tài liệu Toán đầu tiên để MathGlass phân tích cấu trúc và tạo LaTeX có thể chỉnh sửa."
                action={
                  <Button asChild>
                    <Link href="/convert">
                      <Plus className="size-4" /> Tạo dự án đầu tiên
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-[color:var(--mg-border-subtle)]">
                {recent.map((project) => (
                  <div key={project.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/studio/${project.id}`}
                          className="truncate text-sm font-semibold hover:text-primary"
                        >
                          {project.name}
                        </Link>
                        <StatusBadge status={project.status} />
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {project.sourceFilename || "Chưa có tệp nguồn"} · {project.pageCount ?? "?"} trang ·{" "}
                        {project.blockCount} block · cập nhật {formatRelative(project.updatedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {project.needsReviewCount > 0 ? (
                        <Button asChild size="sm" variant="secondary">
                          <Link href={`/accuracy/${project.id}`}>
                            <ScanSearch className="size-3.5" /> Kiểm tra {project.needsReviewCount}
                          </Link>
                        </Button>
                      ) : null}
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/studio/${project.id}`}>
                          <Code2 className="size-3.5" /> Studio
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hoạt động xử lý</CardTitle>
            <CardDescription>Trạng thái thật từ các tác vụ chuyển đổi.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.notifications.length === 0 ? (
              <p className="rounded-[14px] border border-dashed border-[color:var(--mg-border-subtle)] p-4 text-center text-xs text-muted-foreground">
                Chưa có tác vụ nào. Hoạt động sẽ xuất hiện sau khi bạn bắt đầu chuyển đổi.
              </p>
            ) : (
              <ol className="space-y-3">
                {data.notifications.map((item) => (
                  <li key={item.id} className="flex gap-2.5">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[color:var(--mg-highlight)]">
                      {item.status === "failed" ? (
                        <ShieldAlert className="size-3.5 text-[color:var(--mg-danger)]" />
                      ) : item.status === "processing" || item.status === "queued" ? (
                        <Loader2 className="size-3.5 animate-spin text-[color:var(--mg-info)]" />
                      ) : (
                        <CheckCircle2 className="size-3.5 text-[color:var(--mg-success)]" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/studio/${item.projectId}`}
                        className="truncate text-xs font-semibold hover:text-primary"
                      >
                        {item.projectName}
                      </Link>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {item.message}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/75">
                        {formatRelative(item.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-4 rounded-[12px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)] p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold">
                <Wand2 className="size-3.5 text-primary" />
                Trạng thái dịch vụ
              </div>
              <dl className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
                <div className="flex items-center justify-between gap-2">
                  <dt>Vision OCR</dt>
                  <dd className="font-medium text-foreground">
                    {provider.enabled && provider.hasApiKey ? "Đã cấu hình" : "Chưa cấu hình"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt>Biên dịch PDF</dt>
                  <dd className="font-medium text-foreground">
                    {compiler.configured ? `Sandbox · ${compiler.engine}` : "Chưa cấu hình"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt>Lưu trữ</dt>
                  <dd className="font-medium text-foreground">
                    {storage.ephemeral ? "Tạm thời" : "Cục bộ bền vững"}
                  </dd>
                </div>
              </dl>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  icon: typeof Files;
  tone?: "primary" | "warning" | "success" | "info";
}) {
  const toneClass = {
    primary: "text-primary",
    warning: "text-[color:var(--mg-warning)]",
    success: "text-[color:var(--mg-success)]",
    info: "text-[color:var(--mg-info)]",
  }[tone];
  return (
    <div className="rounded-[15px] border border-[color:var(--mg-border)] bg-[color:var(--mg-glass)] p-3.5 backdrop-blur-md">
      <Icon className={`size-4 ${toneClass}`} />
      <p className="mt-2 text-xl font-semibold tracking-[-0.02em]">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Files;
  accent: string;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.025em]">{value}</p>
        </div>
        <span className="grid size-9 place-items-center rounded-[11px] bg-[color:var(--mg-bg-soft)]">
          <Icon className={`size-4 ${accent}`} />
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Skeleton className="h-[238px] w-full rounded-[24px]" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[116px] rounded-[18px]" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-[164px] rounded-[18px]" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <Skeleton className="h-[320px] rounded-[18px]" />
        <Skeleton className="h-[320px] rounded-[18px]" />
      </div>
    </div>
  );
}

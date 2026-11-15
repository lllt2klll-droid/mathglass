"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ScanSearch, ShieldAlert } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { formatRelative } from "@/lib/utils";
import type { ProjectListItem } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

interface ProjectsResponse {
  items: ProjectListItem[];
  total: number;
}

export default function AccuracyIndexPage() {
  const projects = useApi<ProjectsResponse>("/api/projects?pageSize=100&sort=updated&direction=desc");
  const items = projects.data?.items ?? [];
  const reviewable = items.filter((item) => item.needsReviewCount > 0 || item.status === "needs_review");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Accuracy Lab</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Đối chiếu tài liệu gốc với kết quả nhận diện. Mọi thay đổi đều cần bạn xác nhận — MathGlass
          không tự sửa nội dung Toán học.
        </p>
      </div>

      {projects.loading && !projects.data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 rounded-[16px]" />
          ))}
        </div>
      ) : projects.error ? (
        <Card className="p-6">
          <EmptyState
            icon={ShieldAlert}
            title="Không tải được danh sách dự án"
            description={projects.error}
            action={
              <Button variant="secondary" onClick={() => projects.refresh()}>
                Thử lại
              </Button>
            }
          />
        </Card>
      ) : reviewable.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={ScanSearch}
            title="Không có dự án cần đối chiếu"
            description="Chuyển đổi một tài liệu trước. Các block có độ tin cậy thấp hoặc nội dung chưa hỗ trợ sẽ xuất hiện tại đây."
            action={
              <Button asChild>
                <Link href="/convert">Chuyển đổi tài liệu</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {reviewable.length} dự án có nội dung cần kiểm tra
          </p>
          {reviewable.map((project) => (
            <Link key={project.id} href={`/accuracy/${project.id}`} className="block">
              <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-[0_14px_34px_-22px_rgba(23,43,77,0.45)]">
                <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-[color:var(--mg-warning-soft)] text-[color:var(--mg-warning)]">
                  <ScanSearch className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{project.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {project.sourceFilename || "Không có tệp gốc"} · cập nhật{" "}
                    {formatRelative(project.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={project.status} />
                  <span className="rounded-full bg-[color:var(--mg-warning-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--mg-warning)]">
                    {project.needsReviewCount} cần xem
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

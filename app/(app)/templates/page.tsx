"use client";

import * as React from "react";
import { BookOpenCheck, Check, FileText, GraduationCap, LayoutTemplate, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import type { GradeLevel, TemplateId } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

interface TemplateItem {
  id: TemplateId;
  name: string;
  description: string;
  kind: "document" | "exam" | "worksheet" | "revision";
  grade: GradeLevel | "all";
  packages: string[];
  margin: string;
  numberedHeadings: boolean;
  answerSpaceCommand: boolean;
}

interface TemplatesResponse {
  items: TemplateItem[];
}

const KIND_LABEL: Record<TemplateItem["kind"], string> = {
  document: "Tài liệu",
  exam: "Đề kiểm tra",
  worksheet: "Phiếu học tập",
  revision: "Ôn tập",
};

const GRADE_LABEL: Record<GradeLevel | "all", string> = {
  all: "Mọi cấp",
  primary: "Tiểu học",
  lower_secondary: "THCS",
  upper_secondary: "THPT",
  university: "Đại học",
  other: "Khác",
};

const KIND_ICON: Record<TemplateItem["kind"], typeof FileText> = {
  document: FileText,
  exam: GraduationCap,
  worksheet: BookOpenCheck,
  revision: LayoutTemplate,
};

export default function TemplatesPage() {
  const { toast } = useToast();
  const templates = useApi<TemplatesResponse>("/api/templates");
  const [selected, setSelected] = React.useState<TemplateId | null>(null);
  const [applying, setApplying] = React.useState(false);

  const items = templates.data?.items ?? [];

  const applyToLatest = async () => {
    if (!selected) return;
    setApplying(true);
    try {
      // Find the most recently updated draft/ready project to re-template.
      const list = await apiFetch<{ items: Array<{ id: string; status: string }> }>(
        "/api/projects?pageSize=1&sort=updated&direction=desc",
      );
      const target = list.items[0];
      if (!target) {
        toast({
          title: "Chưa có dự án",
          description: "Hãy chuyển đổi một tài liệu trước, sau đó quay lại áp dụng template.",
          tone: "warning",
        });
        return;
      }
      const detail = await apiFetch<{ settings: { templateId: TemplateId } }>(
        `/api/projects/${target.id}`,
      );
      await apiFetch(`/api/projects/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ settings: { ...detail.settings, templateId: selected } }),
      });
      toast({
        title: "Đã cập nhật template",
        description: "Mở LaTeX Studio và chọn “Tạo lại LaTeX” để áp dụng template mới.",
        tone: "success",
      });
    } catch (cause) {
      toast({
        title: "Không áp dụng được template",
        description: cause instanceof Error ? cause.message : "Đã xảy ra lỗi.",
        tone: "danger",
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Template LaTeX</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chọn bố cục đầu ra cho tài liệu Toán. Template chỉ thay đổi khung trình bày, không sửa nội dung.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={!selected || applying}
          onClick={() => void applyToLatest()}
        >
          {applying ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Áp dụng cho dự án gần nhất
        </Button>
      </div>

      {templates.loading && !templates.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-52 rounded-[18px]" />
          ))}
        </div>
      ) : templates.error ? (
        <Card className="p-6">
          <EmptyState
            icon={LayoutTemplate}
            title="Không tải được template"
            description={templates.error}
            action={
              <Button variant="secondary" onClick={() => templates.refresh()}>
                Thử lại
              </Button>
            }
          />
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={LayoutTemplate}
            title="Chưa có template"
            description="Hệ thống chưa trả về template nào. Kiểm tra lại máy chủ."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((template) => {
            const Icon = KIND_ICON[template.kind];
            const active = selected === template.id;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelected(template.id)}
                className={cn(
                  "rounded-[18px] text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active
                    ? "ring-2 ring-primary shadow-[0_18px_40px_-24px_rgba(65,105,216,0.5)]"
                    : "hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(23,43,77,0.35)]",
                )}
                aria-pressed={active}
              >
                <Card className={cn("flex h-full flex-col p-5", active && "border-primary/50")}>
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        "grid size-10 place-items-center rounded-[11px]",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-[color:var(--mg-highlight)] text-primary",
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    {active ? <Badge tone="primary">Đã chọn</Badge> : null}
                  </div>
                  <h2 className="mt-3 text-sm font-semibold">{template.name}</h2>
                  <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {template.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge tone="outline">{KIND_LABEL[template.kind]}</Badge>
                    <Badge tone="outline">{GRADE_LABEL[template.grade]}</Badge>
                    {template.answerSpaceCommand ? <Badge tone="outline">Dòng trả lời</Badge> : null}
                    {template.numberedHeadings ? <Badge tone="outline">Đánh số mục</Badge> : null}
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Lề {template.margin} · {template.packages.length} gói LaTeX
                  </p>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Mẹo: template được chọn trong phần “Cài đặt chuyển đổi” khi tải tài liệu lên, hoặc áp dụng lại
        cho dự án gần nhất bằng nút phía trên. Đổi template không tự ý sửa công thức hay số liệu.
      </p>
    </div>
  );
}

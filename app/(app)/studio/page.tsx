"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Code2, Loader2 } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectListItem } from "@/types/project";

interface ProjectsPayload {
  items: ProjectListItem[];
  total: number;
}

export default function StudioIndexPage() {
  const router = useRouter();
  const projects = useApi<ProjectsPayload>("/api/projects?sort=updated&pageSize=1");
  const latest = projects.data?.items[0] ?? null;
  const redirected = React.useRef(false);

  React.useEffect(() => {
    if (latest && !redirected.current) {
      redirected.current = true;
      router.replace(`/studio/${latest.id}`);
    }
  }, [latest, router]);

  if (projects.loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-24 rounded-[20px]" />
        <Skeleton className="h-64 rounded-[18px]" />
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={Code2}
          title="Chưa có dự án nào để mở"
          description="LaTeX Studio mở một dự án cụ thể. Hãy chuyển đổi tài liệu trước, sau đó mở Studio từ trang Kết quả hoặc Thư viện."
          action={
            <Button asChild>
              <Link href="/convert">Chuyển đổi tài liệu</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Card className="flex items-center gap-3 p-5">
        <Loader2 className="size-4 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Đang mở LaTeX Studio cho dự án gần nhất…
        </p>
      </Card>
    </div>
  );
}

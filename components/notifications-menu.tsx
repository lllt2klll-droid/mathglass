"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api-client";
import { formatRelative } from "@/lib/utils";

interface NotificationItem {
  id: string;
  projectId: string;
  projectName: string;
  status: string;
  message: string;
  createdAt: string;
}

export function NotificationsMenu() {
  const [items, setItems] = React.useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ notifications: NotificationItem[] }>("/api/dashboard");
      setItems(data.notifications);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Thông báo xử lý"
          className="relative"
        >
          <Bell className="size-4" />
          {items && items.length > 0 ? (
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[color:var(--mg-warning)]" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Hoạt động gần đây</span>
          <button
            type="button"
            className="text-[10px] font-medium text-primary hover:underline"
            onClick={() => void load()}
          >
            Làm mới
          </button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading && !items ? (
          <p className="flex items-center gap-2 px-3 py-5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Đang tải hoạt động…
          </p>
        ) : !items || items.length === 0 ? (
          <p className="px-3 py-5 text-xs text-muted-foreground">
            Chưa có hoạt động xử lý nào trong workspace.
          </p>
        ) : (
          <div className="max-h-[360px] overflow-y-auto">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/studio/${item.projectId}`}
                className="flex gap-2.5 rounded-[9px] px-2.5 py-2.5 transition-colors hover:bg-[color:var(--mg-highlight)]"
              >
                {item.status === "failed" ? (
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[color:var(--mg-danger)]" />
                ) : item.status === "completed" || item.status === "needs_review" ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[color:var(--mg-success)]" />
                ) : (
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-[color:var(--mg-info)]" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{item.projectName}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                    {item.message}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground/80">
                    {formatRelative(item.createdAt)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

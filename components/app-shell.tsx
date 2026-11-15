"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Code2,
  Disc3,
  HardDrive,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  Menu,
  Plus,
  ScanSearch,
  Settings,
  ShieldCheck,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import { NAV_ITEMS, SITE } from "@/config/site";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SiteLogo } from "@/components/site-logo";
import { GlobalSearch } from "@/components/global-search";
import { NotificationsMenu } from "@/components/notifications-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api-client";

const ICONS: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  convert: UploadCloud,
  studio: Code2,
  accuracy: ScanSearch,
  library: Library,
  templates: LayoutTemplate,
  settings: Settings,
};

const TITLES: Record<string, { title: string; description: string }> = {
  "/dashboard": { title: "Dashboard", description: "Tổng quan workspace chuyển đổi Toán học" },
  "/convert": { title: "Chuyển đổi tài liệu", description: "Tải lên, kiểm tra và cấu hình chuyển đổi" },
  "/studio": { title: "LaTeX Studio", description: "Chỉnh sửa mã nguồn và xem trước nội dung" },
  "/accuracy": { title: "Accuracy Lab", description: "Đối chiếu nguồn gốc với kết quả nhận diện" },
  "/library": { title: "Thư viện", description: "Tất cả dự án trong workspace" },
  "/templates": { title: "Template LaTeX", description: "Mẫu tài liệu cho giáo viên Toán" },
  "/settings": { title: "Cài đặt", description: "Nhà cung cấp AI, lưu trữ và giới hạn hệ thống" },
};

function isActiveNav(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [storage, setStorage] = React.useState<{ ephemeral: boolean } | null>(null);

  const [prevPathname, setPrevPathname] = React.useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (window.localStorage.getItem("mg-sidebar-collapsed") === "1") setCollapsed(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  React.useEffect(() => {
    let alive = true;
    apiFetch<{ database: { ephemeral: boolean } }>("/api/health")
      .then((data) => {
        if (alive) setStorage({ ephemeral: data.database.ephemeral });
      })
      .catch(() => {
        if (alive) setStorage(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("mg-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  const section = pathname.split("/")[1] ? `/${pathname.split("/")[1]}` : "/dashboard";
  const meta = TITLES[section] ?? { title: "MathGlass", description: "Workspace Toán học" };
  const isStudioLike = pathname.startsWith("/studio/") || pathname.startsWith("/accuracy/");

  return (
    <div className="min-h-dvh">
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-[color:var(--mg-overlay)] backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Đóng menu điều hướng"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-glass-strong)] backdrop-blur-xl transition-[transform,width] duration-[250ms] ease-out",
          collapsed ? "lg:w-[76px]" : "lg:w-[248px]",
          "max-lg:w-[268px]",
          mobileOpen ? "translate-x-0" : "max-lg:-translate-x-full",
        )}
        aria-label="Điều hướng chính"
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-[color:var(--mg-border-subtle)] px-3.5">
          <Link href="/dashboard" className="min-w-0" aria-label="MathGlass Dashboard">
            <SiteLogo compact={collapsed} />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-[color:var(--mg-highlight)] lg:hidden"
            aria-label="Đóng menu"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-3">
          <Button asChild size="md" className={cn("w-full", collapsed && "px-0")}>
            <Link href="/convert" aria-label="Chuyển đổi tài liệu mới">
              <Plus className="size-4" />
              {collapsed ? null : "Chuyển đổi mới"}
            </Link>
          </Button>
        </div>

        <nav className="mg-scrollbar flex-1 overflow-y-auto px-3 pb-3" aria-label="Các mô-đun">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActiveNav(pathname, item.href);
              const Icon = ICONS[item.key] ?? LayoutDashboard;
              const content = (
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-10 items-center gap-3 rounded-[11px] px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-[color:var(--mg-highlight)] text-primary ring-1 ring-primary/10"
                      : "text-muted-foreground hover:bg-[color:var(--mg-highlight)] hover:text-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <Icon className={cn("size-[18px] shrink-0", active && "text-primary")} />
                  {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
                </Link>
              );
              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{content}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>

          {!collapsed ? (
            <div className="mt-6 rounded-[14px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)]/70 p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
                <ShieldCheck className="size-3.5 text-[color:var(--mg-success)]" />
                Quy trình có kiểm chứng
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Không tự sửa số liệu hay công thức. Mọi nội dung cần kiểm tra đều được đánh dấu.
              </p>
            </div>
          ) : null}
        </nav>

        <div className="border-t border-[color:var(--mg-border-subtle)] p-3">
          <div
            className={cn(
              "flex items-center gap-2 rounded-[11px] px-2 py-2 text-[11px] text-muted-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <HardDrive className="size-3.5 shrink-0" />
            {collapsed ? (
              <span className="sr-only">
                {storage?.ephemeral ? "Lưu trữ tạm thời" : "Lưu trữ cục bộ"}
              </span>
            ) : (
              <span className="truncate">
                {storage === null
                  ? "Đang kiểm tra lưu trữ…"
                  : storage.ephemeral
                    ? "Lưu trữ tạm thời (ephemeral)"
                    : "Local-first · dữ liệu cục bộ"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              "mt-1 flex h-8 w-full items-center gap-2 rounded-[9px] px-2 text-[11px] text-muted-foreground transition-colors hover:bg-[color:var(--mg-highlight)] hover:text-foreground max-lg:hidden",
              collapsed && "justify-center px-0",
            )}
            aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            {collapsed ? null : "Thu gọn sidebar"}
          </button>
        </div>
      </aside>

      <div
        className={cn(
          "flex min-h-dvh flex-col transition-[padding] duration-[250ms] ease-out",
          collapsed ? "lg:pl-[76px]" : "lg:pl-[248px]",
        )}
      >
        <header className="sticky top-0 z-30 border-b border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg)]/80 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="grid size-9 place-items-center rounded-[10px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-surface)] text-muted-foreground lg:hidden"
              aria-label="Mở menu điều hướng"
            >
              <Menu className="size-4" />
            </button>
            <div className="hidden min-w-0 flex-col sm:flex">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                <span>{SITE.name}</span>
                <span aria-hidden>/</span>
                <span className="truncate">{meta.title}</span>
                {isStudioLike ? (
                  <>
                    <span aria-hidden>/</span>
                    <span>Dự án</span>
                  </>
                ) : null}
              </div>
              <p className="truncate text-sm font-semibold leading-tight">{meta.description}</p>
            </div>
            <div className="flex-1" />
            <GlobalSearch className="hidden max-w-sm md:block" />
            <NotificationsMenu />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="Menu workspace">
                  <UserRound className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[220px]">
                <DropdownMenuLabel>
                  <span className="block text-xs font-semibold text-foreground">Workspace cá nhân</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[10px] font-normal text-muted-foreground">
                    <Disc3 className="size-3" />
                    {storage?.ephemeral ? "Lưu trữ tạm thời" : "Local-first"}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/library">
                    <Library /> Thư viện
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings /> Cài đặt
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="px-4 pb-3 md:hidden">
            <GlobalSearch />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>

        <footer className="border-t border-[color:var(--mg-border-subtle)] px-6 py-4 text-[11px] text-muted-foreground">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span>MathGlass {SITE.version} · Chuyển đổi có trách nhiệm, không tự sửa nội dung Toán học.</span>
            <span>PDF/DOCX · OMML · KaTeX preview · XeLaTeX output</span>
          </div>
        </footer>
      </div>

    </div>
  );
}

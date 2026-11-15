import { AlertCircle, CheckCircle2, Clock3, Loader2, MinusCircle, PauseCircle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type KnownStatus =
  | "draft"
  | "processing"
  | "needs_review"
  | "ready"
  | "failed"
  | "archived"
  | "queued"
  | "validating"
  | "parsing"
  | "recognizing"
  | "generating"
  | "validating_output"
  | "completed"
  | "cancelled"
  | "not_configured"
  | "not_tested"
  | "connected"
  | "unsupported"
  | "accepted"
  | "rejected"
  | "ignored"
  | "extracted"
  | "recognized";

const MAP: Record<
  KnownStatus,
  {
    label: string;
    tone: "neutral" | "info" | "success" | "warning" | "danger" | "primary" | "outline";
    icon: typeof Clock3;
    spin?: boolean;
  }
> = {
  draft: { label: "Bản nháp", tone: "neutral", icon: Clock3 },
  processing: { label: "Đang xử lý", tone: "info", icon: Loader2, spin: true },
  needs_review: { label: "Cần kiểm tra", tone: "warning", icon: ShieldAlert },
  ready: { label: "Sẵn sàng", tone: "success", icon: CheckCircle2 },
  failed: { label: "Thất bại", tone: "danger", icon: AlertCircle },
  archived: { label: "Lưu trữ", tone: "neutral", icon: MinusCircle },
  queued: { label: "Đang chờ", tone: "neutral", icon: Clock3 },
  validating: { label: "Đang kiểm tra", tone: "info", icon: Loader2, spin: true },
  parsing: { label: "Đang phân tích", tone: "info", icon: Loader2, spin: true },
  recognizing: { label: "Đang nhận diện", tone: "info", icon: Loader2, spin: true },
  generating: { label: "Đang tạo LaTeX", tone: "info", icon: Loader2, spin: true },
  validating_output: { label: "Đang kiểm tra LaTeX", tone: "info", icon: Loader2, spin: true },
  completed: { label: "Hoàn tất", tone: "success", icon: CheckCircle2 },
  cancelled: { label: "Đã hủy", tone: "neutral", icon: PauseCircle },
  not_configured: { label: "Chưa cấu hình", tone: "neutral", icon: MinusCircle },
  not_tested: { label: "Chưa kiểm tra", tone: "outline", icon: Clock3 },
  connected: { label: "Đã kết nối", tone: "success", icon: CheckCircle2 },
  unsupported: { label: "Chưa hỗ trợ", tone: "danger", icon: AlertCircle },
  accepted: { label: "Đã xác nhận", tone: "success", icon: CheckCircle2 },
  rejected: { label: "Đã từ chối", tone: "danger", icon: MinusCircle },
  ignored: { label: "Đã bỏ qua", tone: "neutral", icon: MinusCircle },
  extracted: { label: "Đã trích xuất", tone: "outline", icon: CheckCircle2 },
  recognized: { label: "Đã nhận diện", tone: "primary", icon: CheckCircle2 },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const item = MAP[status as KnownStatus];
  if (!item) {
    return (
      <Badge tone="outline" className={className}>
        {status}
      </Badge>
    );
  }
  const Icon = item.icon;
  return (
    <Badge tone={item.tone} className={className}>
      <Icon className={item.spin ? "size-3 animate-spin" : "size-3"} aria-hidden />
      {item.label}
    </Badge>
  );
}

export function statusLabel(status: string): string {
  return MAP[status as KnownStatus]?.label ?? status;
}

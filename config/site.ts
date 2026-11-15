import type { ConfidenceBand } from "@/types/document";

export const SITE = {
  name: "MathGlass",
  tagline: "Smart Mathematics Document Converter",
  description:
    "Chuyển đổi PDF, Word và hình ảnh tài liệu Toán học sang LaTeX có thể chỉnh sửa, với quy trình đối chiếu minh bạch.",
  version: "0.1.0",
} as const;

export const NAV_ITEMS = [
  { href: "/dashboard", key: "dashboard", label: "Dashboard" },
  { href: "/convert", key: "convert", label: "Chuyển đổi tài liệu" },
  { href: "/studio", key: "studio", label: "LaTeX Studio" },
  { href: "/accuracy", key: "accuracy", label: "Accuracy Lab" },
  { href: "/library", key: "library", label: "Thư viện" },
  { href: "/templates", key: "templates", label: "Template" },
  { href: "/settings", key: "settings", label: "Cài đặt" },
] as const;

export const COOKIE_NAME = "mg_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function getMaxUploadBytes(): number {
  const mb = Number(process.env.MATHGLASS_MAX_UPLOAD_MB ?? 25);
  return (Number.isFinite(mb) && mb > 0 ? Math.min(mb, 100) : 25) * 1024 * 1024;
}

export function getMaxPages(): number {
  const pages = Number(process.env.MATHGLASS_MAX_PAGES ?? 80);
  return Number.isInteger(pages) && pages > 0 ? Math.min(pages, 500) : 80;
}

export function getConfidenceBand(confidence: number | undefined): ConfidenceBand {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return "unknown";
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
}

export function confidenceLabel(band: ConfidenceBand): string {
  switch (band) {
    case "high":
      return "Tin cậy cao";
    case "medium":
      return "Cần kiểm tra";
    case "low":
      return "Cần giáo viên xác nhận";
    default:
      return "Chưa có confidence";
  }
}

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
] as const;

export const FILE_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "image/png": ".png",
  "image/jpeg": ".jpg",
};

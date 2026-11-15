import { requireOwnerId } from "@/lib/session";
import { apiFailure, handleApiError } from "@/lib/http";
import { fileResponse } from "@/lib/file-response";
import {
  buildTexExport,
  buildZipExport,
  compilePdfExport,
} from "@/services/export/export-project";
import { checkRateLimit } from "@/services/security/rate-limit";
import { AppError } from "@/types/api";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
    const format = new URL(request.url).searchParams.get("format") ?? "tex";
    if (!["tex", "zip", "pdf"].includes(format)) {
      return apiFailure("EXPORT_FORMAT_INVALID", "Định dạng xuất không hợp lệ.", 400);
    }
    if (format === "pdf") {
      const rate = checkRateLimit(`compile:${ownerId}`, 4, 10 * 60 * 1000);
      if (!rate.allowed) {
        throw new AppError(
          "RATE_LIMITED",
          `Bạn đã yêu cầu biên dịch quá nhiều lần. Thử lại sau ${rate.retryAfterSeconds} giây.`,
          429,
        );
      }
      const artifact = await compilePdfExport(ownerId, projectId);
      return fileResponse(artifact);
    }
    const artifact = format === "zip"
      ? await buildZipExport(ownerId, projectId)
      : await buildTexExport(ownerId, projectId);
    return fileResponse(artifact);
  } catch (error) {
    return handleApiError(error);
  }
}

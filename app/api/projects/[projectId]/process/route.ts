import { after } from "next/server";
import { requireOwnerId } from "@/lib/session";
import { apiSuccess, assertSameOrigin, handleApiError, readJson } from "@/lib/http";
import { processProjectSchema } from "@/lib/schemas";
import {
  createJob,
  getProjectDetail,
  getStoredDocumentByProject,
  updateProject,
} from "@/services/db/repository";
import { runConversionJob } from "@/services/jobs/conversion-job";
import { AppError } from "@/types/api";
import { checkRateLimit } from "@/services/security/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
    const rate = checkRateLimit(`process:${ownerId}`, 10, 10 * 60 * 1000);
    if (!rate.allowed) {
      throw new AppError(
        "RATE_LIMITED",
        `Bạn đang chạy chuyển đổi quá thường xuyên. Thử lại sau ${rate.retryAfterSeconds} giây.`,
        429,
      );
    }

    const payload = await readJson(request, processProjectSchema);
    if (payload.settings) {
      await updateProject(ownerId, projectId, { settings: payload.settings });
    }
    const { document } = await getStoredDocumentByProject(ownerId, projectId);
    if (!document.storageKey) {
      throw new AppError(
        "DOCUMENT_REQUIRED",
        "Dự án chưa có tệp nguồn. Hãy tải tài liệu lên trước.",
        409,
      );
    }
    const job = await createJob({
      ownerId,
      projectId,
      documentId: document.id,
      jobType: "parse",
    });
    after(async () => {
      await runConversionJob(ownerId, projectId, job.id);
    });
    const project = await getProjectDetail(ownerId, projectId);
    return apiSuccess({ job, project }, { status: 202 });
  } catch (error) {
    return handleApiError(error);
  }
}

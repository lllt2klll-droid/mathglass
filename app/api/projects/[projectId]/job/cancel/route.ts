import { requireOwnerId } from "@/lib/session";
import { apiSuccess, assertSameOrigin, handleApiError } from "@/lib/http";
import { getJob, requestCancelJob } from "@/services/db/repository";
import { AppError } from "@/types/api";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
    const job = await getJob(ownerId, projectId);
    if (!job) throw new AppError("JOB_NOT_FOUND", "Dự án chưa có tác vụ nào.", 404);
    const cancelled = await requestCancelJob(ownerId, projectId, job.id);
    return apiSuccess(cancelled);
  } catch (error) {
    return handleApiError(error);
  }
}

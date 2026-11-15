import { requireOwnerId } from "@/lib/session";
import { apiSuccess, handleApiError } from "@/lib/http";
import { listVersions } from "@/services/db/repository";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
    const result = await listVersions(ownerId, projectId);
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

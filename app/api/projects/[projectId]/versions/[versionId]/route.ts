import { requireOwnerId } from "@/lib/session";
import { apiSuccess, assertSameOrigin, handleApiError } from "@/lib/http";
import { getVersion, restoreVersion } from "@/services/db/repository";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; versionId: string }> },
) {
  try {
    const ownerId = await requireOwnerId();
    const { projectId, versionId } = await context.params;
    const version = await getVersion(ownerId, projectId, versionId);
    return apiSuccess(version);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; versionId: string }> },
) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    const { projectId, versionId } = await context.params;
    const restored = await restoreVersion(ownerId, projectId, versionId);
    return apiSuccess(restored);
  } catch (error) {
    return handleApiError(error);
  }
}

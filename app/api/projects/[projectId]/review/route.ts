import { requireOwnerId } from "@/lib/session";
import { apiSuccess, handleApiError } from "@/lib/http";
import { getDocumentStructure, getReviewReport } from "@/services/db/repository";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
    const [structure, report] = await Promise.all([
      getDocumentStructure(ownerId, projectId),
      getReviewReport(ownerId, projectId),
    ]);
    return apiSuccess({ report, ast: structure.ast, project: structure.project });
  } catch (error) {
    return handleApiError(error);
  }
}

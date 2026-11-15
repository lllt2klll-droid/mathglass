import { requireOwnerId } from "@/lib/session";
import { apiSuccess, handleApiError } from "@/lib/http";
import {
  getDocumentStructure,
  getJob,
  getProjectDetail,
} from "@/services/db/repository";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
    const [job, project] = await Promise.all([
      getJob(ownerId, projectId),
      getProjectDetail(ownerId, projectId),
    ]);
    const url = new URL(request.url);
    let structure: { pageCount: number; blockCount: number; mathBlockCount: number } | null = null;
    if (url.searchParams.get("includeStructure") === "true") {
      try {
        const result = await getDocumentStructure(ownerId, projectId);
        structure = {
          pageCount: result.ast.metadata.pageCount,
          blockCount: result.ast.metadata.blockCount,
          mathBlockCount: result.ast.metadata.mathBlockCount,
        };
      } catch {
        structure = null;
      }
    }
    return apiSuccess({ job, project, structure });
  } catch (error) {
    return handleApiError(error);
  }
}

import { requireOwnerId } from "@/lib/session";
import { apiSuccess, handleApiError } from "@/lib/http";
import { getDocumentStructure } from "@/services/db/repository";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
    const { project, document, ast } = await getDocumentStructure(ownerId, projectId);
    return apiSuccess({
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        settings: project.settings,
        latexSource: project.latexSource,
        latexLineMap: project.latexLineMap,
        blockCount: project.blockCount,
        mathBlockCount: project.mathBlockCount,
        needsReviewCount: project.needsReviewCount,
        pageCount: project.pageCount,
      },
      document: {
        id: document.id,
        originalFilename: document.originalFilename,
        mimeType: document.mimeType,
        detectedType: document.detectedType,
        pageCount: document.pageCount,
        status: document.status,
        diagnostics: document.diagnostics,
      },
      ast,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

import { requireOwnerId } from "@/lib/session";
import { apiSuccess, assertSameOrigin, handleApiError, readJson } from "@/lib/http";
import { processProjectSchema } from "@/lib/schemas";
import { getProjectDetail } from "@/services/db/repository";
import { regenerateProjectLatex } from "@/services/latex/regenerate";
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
    const payload = await readJson(request, processProjectSchema);
    const project = await getProjectDetail(ownerId, projectId);
    if (project.blockCount === 0) {
      throw new AppError(
        "DOCUMENT_REQUIRED",
        "Dự án chưa có cấu trúc tài liệu. Hãy chuyển đổi tài liệu trước khi tạo LaTeX.",
        409,
      );
    }
    const regenerated = await regenerateProjectLatex(ownerId, projectId, {
      settings: payload.settings,
      snapshot: true,
      summary: payload.settings ? "Tạo lại LaTeX với cấu hình mới" : "Tạo lại LaTeX từ cấu trúc",
    });
    return apiSuccess({
      project: regenerated.project,
      source: regenerated.generated.source,
      lineMap: regenerated.generated.lineMap,
      stats: regenerated.generated.stats,
      diagnostics: regenerated.generated.diagnostics,
      validation: regenerated.validation,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

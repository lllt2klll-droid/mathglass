import { requireOwnerId } from "@/lib/session";
import { apiSuccess, assertSameOrigin, handleApiError, readJson } from "@/lib/http";
import { reviewBlockSchema } from "@/lib/schemas";
import {
  getBlock,
  getProjectDetail,
  getReviewReport,
  reviewBlock,
} from "@/services/db/repository";
import { parseEditedBlockContent } from "@/lib/block-validation";
import { regenerateProjectLatex } from "@/services/latex/regenerate";
import { AppError } from "@/types/api";
import type { ReviewAction } from "@/services/db/repository";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; blockId: string }> },
) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    const { projectId, blockId } = await context.params;
    const payload = await readJson(request, reviewBlockSchema);

    const existing = await getBlock(ownerId, projectId, blockId);
    let content;
    if (payload.action === "edit" && payload.content !== undefined) {
      content = parseEditedBlockContent(existing.type, payload.content);
    }
    if (payload.action === "edit" && payload.latex !== undefined && existing.type !== "display_math") {
      throw new AppError(
        "INLINE_EDIT_UNSUPPORTED",
        "Chỉ block công thức hiển thị mới sửa trực tiếp bằng LaTeX. Hãy chỉnh block văn bản trong LaTeX Studio.",
        400,
      );
    }

    const result = await reviewBlock({
      ownerId,
      projectId,
      blockId,
      action: payload.action as ReviewAction,
      latex: payload.latex,
      content,
    });

    const shouldRegenerate = ["edit", "reject", "ignore", "reset"].includes(payload.action);
    let latex: { source: string; valid: boolean; diagnostics: unknown[] } | null = null;
    if (shouldRegenerate && result.project.blockCount > 0) {
      const regenerated = await regenerateProjectLatex(ownerId, projectId, {
        snapshot: false,
      });
      latex = {
        source: regenerated.generated.source,
        valid: regenerated.validation.valid,
        diagnostics: regenerated.validation.diagnostics,
      };
    }

    const [report, project] = await Promise.all([
      getReviewReport(ownerId, projectId),
      getProjectDetail(ownerId, projectId),
    ]);
    return apiSuccess({ block: result.block, report, project, latex });
  } catch (error) {
    return handleApiError(error);
  }
}

import { requireOwnerId } from "@/lib/session";
import { apiSuccess, assertSameOrigin, handleApiError } from "@/lib/http";
import { duplicateProject } from "@/services/db/repository";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
    const project = await duplicateProject(ownerId, projectId);
    return apiSuccess(project, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

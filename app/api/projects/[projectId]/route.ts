import { requireOwnerId } from "@/lib/session";
import { apiSuccess, assertSameOrigin, handleApiError, readJson } from "@/lib/http";
import { updateProjectSchema } from "@/lib/schemas";
import {
  deleteProject,
  getProjectDetail,
  touchProject,
  updateProject,
} from "@/services/db/repository";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, context: Context) {
  try {
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
    const project = await getProjectDetail(ownerId, projectId);
    await touchProject(ownerId, projectId);
    return apiSuccess(project);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
    const payload = await readJson(request, updateProjectSchema);
    const project = await updateProject(ownerId, projectId, payload);
    return apiSuccess(project);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
    await deleteProject(ownerId, projectId);
    return apiSuccess({ deleted: true, projectId });
  } catch (error) {
    return handleApiError(error);
  }
}

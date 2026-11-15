import type { ProjectStatus } from "@/types/project";
import { requireOwnerId } from "@/lib/session";
import { apiSuccess, handleApiError } from "@/lib/http";
import { listProjects } from "@/services/db/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ownerId = await requireOwnerId();
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const allowed: ProjectStatus[] = [
      "draft",
      "processing",
      "needs_review",
      "ready",
      "failed",
      "archived",
    ];
    const result = await listProjects(ownerId, {
      query: url.searchParams.get("q") ?? undefined,
      status: status && allowed.includes(status as ProjectStatus) ? (status as ProjectStatus) : "all",
      sort:
        url.searchParams.get("sort") === "name"
          ? "name"
          : url.searchParams.get("sort") === "created"
            ? "created"
            : "updated",
      direction: url.searchParams.get("direction") === "asc" ? "asc" : "desc",
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 50),
    });
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

import { requireOwnerId } from "@/lib/session";
import { apiSuccess, handleApiError } from "@/lib/http";
import { searchWorkspace } from "@/services/db/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ownerId = await requireOwnerId();
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const result = await searchWorkspace(ownerId, query);
    return apiSuccess({ query, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}

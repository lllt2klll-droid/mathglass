import { requireOwnerId } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { fileResponse } from "@/lib/file-response";
import { getStoredDocumentByProject } from "@/services/db/repository";
import { readStoredFile } from "@/services/storage/local-files";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
    const { document } = await getStoredDocumentByProject(ownerId, projectId);
    if (!document.storageKey) {
      return new Response("No source file", { status: 404 });
    }
    const bytes = await readStoredFile(document.storageKey);
    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "true";
    return fileResponse({
      bytes,
      mimeType: document.mimeType || "application/octet-stream",
      filename: document.originalFilename,
      disposition: download ? "attachment" : "inline",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

import { requireOwnerId } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { fileResponse } from "@/lib/file-response";
import { getStoredAsset } from "@/services/db/repository";
import { readStoredFile } from "@/services/storage/local-files";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  try {
    const ownerId = await requireOwnerId();
    const { assetId } = await context.params;
    const asset = await getStoredAsset(ownerId, assetId);
    const bytes = await readStoredFile(asset.storageKey);
    const url = new URL(request.url);
    return fileResponse({
      bytes,
      mimeType: asset.mimeType || "application/octet-stream",
      filename: asset.filename,
      disposition: url.searchParams.get("download") === "true" ? "attachment" : "inline",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

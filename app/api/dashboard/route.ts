import { requireOwnerId } from "@/lib/session";
import { apiSuccess, handleApiError } from "@/lib/http";
import {
  getDashboardStats,
  getRecentNotifications,
  getProvider,
  getWorkspaceInfo,
  listProjects,
} from "@/services/db/repository";
import { publicProviderConfig } from "@/services/ai/provider";
import { isCompilerConfigured, compilerStatus } from "@/services/export/export-project";
import { databaseInfo } from "@/services/db/local-store";
import { getMaxPages, getMaxUploadBytes, SITE } from "@/config/site";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const [stats, recent, notifications, provider, workspace, database] =
      await Promise.all([
        getDashboardStats(ownerId),
        listProjects(ownerId, { page: 1, pageSize: 6, sort: "updated", direction: "desc" }),
        getRecentNotifications(ownerId, 6),
        getProvider(ownerId),
        getWorkspaceInfo(ownerId),
        databaseInfo(),
      ]);
    return apiSuccess({
      version: SITE.version,
      stats,
      recent: recent.items,
      notifications,
      provider: publicProviderConfig(provider),
      workspace,
      storage: {
        ephemeral: database.ephemeral,
        sizeBytes: database.sizeBytes,
        mode: database.ephemeral ? "ephemeral" : "local-persistent",
      },
      compiler: compilerStatus(),
      limits: {
        maxUploadBytes: getMaxUploadBytes(),
        maxPages: getMaxPages(),
      },
      features: {
        pdfParsing: true,
        docxParsing: true,
        imageOcr: Boolean(provider?.encryptedApiKey && provider.enabled),
        pdfCompilation: isCompilerConfigured(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

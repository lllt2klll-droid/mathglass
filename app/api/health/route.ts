import { requireOwnerId } from "@/lib/session";
import { apiSuccess, handleApiError } from "@/lib/http";
import { databaseInfo, isEphemeralStorage } from "@/services/db/local-store";
import { getProvider } from "@/services/db/repository";
import { publicProviderConfig } from "@/services/ai/provider";
import { compilerStatus } from "@/services/export/export-project";
import { getMaxPages, getMaxUploadBytes, SITE } from "@/config/site";

export const runtime = "nodejs";

function secretConfigured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const [database, provider] = await Promise.all([
      databaseInfo(),
      getProvider(ownerId),
    ]);
    return apiSuccess({
      ok: true,
      app: SITE.name,
      version: SITE.version,
      time: new Date().toISOString(),
      database: {
        mode: database.ephemeral ? "ephemeral-local" : "local-persistent",
        ephemeral: database.ephemeral,
        sizeBytes: database.sizeBytes,
      },
      runtime: {
        node: process.version,
        platform: process.platform,
        vercel: Boolean(process.env.VERCEL),
        ephemeral: isEphemeralStorage(),
      },
      security: {
        sessionSecretConfigured: secretConfigured("MATHGLASS_SESSION_SECRET"),
        encryptionSecretConfigured: secretConfigured("MATHGLASS_ENCRYPTION_SECRET"),
      },
      provider: publicProviderConfig(provider),
      compiler: compilerStatus(),
      limits: {
        maxUploadBytes: getMaxUploadBytes(),
        maxPages: getMaxPages(),
      },
      capabilities: {
        pdfTextExtraction: true,
        docxOmml: true,
        imageOcrRequiresProvider: true,
        mathPreview: "katex-semantic-preview",
        pdfCompilationRequiresCompilerService: true,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

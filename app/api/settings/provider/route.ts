import { requireOwnerId } from "@/lib/session";
import { apiSuccess, assertSameOrigin, handleApiError, readJson } from "@/lib/http";
import { providerSettingsSchema } from "@/lib/schemas";
import {
  deleteProvider,
  getProvider,
  saveProvider,
} from "@/services/db/repository";
import { encryptSecret } from "@/services/ai/crypto";
import { publicProviderConfig } from "@/services/ai/provider";
import { AppError } from "@/types/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const provider = await getProvider(ownerId);
    return apiSuccess({
      provider: publicProviderConfig(provider),
      envFallbackAvailable: Boolean(process.env.MATHGLASS_AI_BASE_URL || process.env.OPENAI_API_KEY),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    const payload = await readJson(request, providerSettingsSchema);
    const existing = await getProvider(ownerId);

    const encryptedApiKey = payload.clearApiKey
      ? null
      : payload.apiKey
        ? encryptSecret(payload.apiKey)
        : existing?.encryptedApiKey ?? null;

    if (payload.enabled && !encryptedApiKey) {
      throw new AppError(
        "AI_API_KEY_MISSING",
        "Không thể bật nhà cung cấp khi chưa có API key. Hãy nhập key hoặc lưu cấu hình ở trạng thái tắt.",
        400,
      );
    }

    const configChanged =
      !existing ||
      existing.baseUrl !== payload.baseUrl ||
      existing.model !== payload.model ||
      Boolean(payload.apiKey) ||
      payload.clearApiKey === true;

    const status = !payload.enabled
      ? "not_configured"
      : encryptedApiKey
        ? configChanged
          ? "not_tested"
          : existing?.status ?? "not_tested"
        : "not_configured";

    const saved = await saveProvider(ownerId, {
      providerId: "openai-compatible",
      displayName: existing?.displayName ?? "OpenAI-compatible Vision",
      baseUrl: payload.baseUrl,
      model: payload.model,
      encryptedApiKey,
      enabled: payload.enabled,
      status,
      lastCheckedAt: configChanged ? null : existing?.lastCheckedAt ?? null,
      lastError: configChanged ? null : existing?.lastError ?? null,
    });
    return apiSuccess(publicProviderConfig(saved));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    await deleteProvider(ownerId);
    return apiSuccess({ provider: publicProviderConfig(null) });
  } catch (error) {
    return handleApiError(error);
  }
}

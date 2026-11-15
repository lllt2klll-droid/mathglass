import { requireOwnerId } from "@/lib/session";
import { apiSuccess, assertSameOrigin, handleApiError } from "@/lib/http";
import { getProvider, updateProviderCheck } from "@/services/db/repository";
import { publicProviderConfig, testProvider } from "@/services/ai/provider";
import { checkRateLimit } from "@/services/security/rate-limit";
import { AppError } from "@/types/api";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    const rate = checkRateLimit(`provider-test:${ownerId}`, 5, 60_000);
    if (!rate.allowed) {
      throw new AppError(
        "RATE_LIMITED",
        `Bạn đã kiểm tra kết nối quá nhiều lần. Thử lại sau ${rate.retryAfterSeconds} giây.`,
        429,
      );
    }
    const provider = await getProvider(ownerId);
    if (!provider) {
      throw new AppError(
        "AI_NOT_CONFIGURED",
        "Chưa lưu cấu hình nhà cung cấp AI. Hãy lưu Base URL, model và API key trước.",
        409,
      );
    }
    const result = await testProvider(provider);
    await updateProviderCheck(
      ownerId,
      result.ok ? "connected" : "failed",
      result.ok ? null : result.message,
    );
    const updated = await getProvider(ownerId);
    return apiSuccess({ result, provider: publicProviderConfig(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}

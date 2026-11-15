import { requireOwnerId } from "@/lib/session";
import { apiSuccess, assertSameOrigin, handleApiError, readJson } from "@/lib/http";
import { assistantRequestSchema } from "@/lib/schemas";
import { getProjectDetail, getProvider } from "@/services/db/repository";
import { providerRuntime, runAssistant } from "@/services/ai/provider";
import { checkRateLimit } from "@/services/security/rate-limit";
import { AppError } from "@/types/api";

export const runtime = "nodejs";
export const maxDuration = 100;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    const rate = checkRateLimit(`assistant:${ownerId}`, 20, 10 * 60 * 1000);
    if (!rate.allowed) {
      throw new AppError(
        "RATE_LIMITED",
        `Bạn đã gọi trợ lý quá nhiều lần. Thử lại sau ${rate.retryAfterSeconds} giây.`,
        429,
      );
    }
    const payload = await readJson(request, assistantRequestSchema);
    if (payload.projectId) {
      await getProjectDetail(ownerId, payload.projectId);
    }
    const provider = await getProvider(ownerId);
    if (!provider) {
      throw new AppError(
        "AI_NOT_CONFIGURED",
        "Chưa cấu hình nhà cung cấp AI. Không có kết quả nào được tạo. Hãy cấu hình trong Cài đặt.",
        409,
      );
    }
    const runtime = providerRuntime(provider);
    const result = await runAssistant(runtime, {
      action: payload.action,
      input: payload.input,
      source: payload.source,
      selection: payload.selection,
    });
    return apiSuccess({
      action: payload.action,
      kind: result.kind,
      message: result.message,
      proposal: result.proposal,
      provider: runtime.displayName,
      model: runtime.model,
      usage: result.usage,
      applied: false,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

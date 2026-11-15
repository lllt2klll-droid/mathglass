import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, type ApiResponse } from "@/types/api";

export function apiSuccess<T>(data: T, init?: ResponseInit): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ ok: true, data }, init);
}

export function apiFailure(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    { ok: false, error: { code, message, details } },
    { status },
  );
}

export function handleApiError(error: unknown): NextResponse<ApiResponse<never>> {
  if (error instanceof AppError) {
    return apiFailure(error.code, error.message, error.status, error.details);
  }
  if (error instanceof ZodError) {
    return apiFailure(
      "VALIDATION_ERROR",
      "Dữ liệu gửi lên không hợp lệ.",
      422,
      error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  const message = error instanceof Error ? error.message : "Lỗi không xác định.";
  // Never include request bodies, document text or secrets in logs.
  console.error("[mathglass] API error:", message);
  return apiFailure("INTERNAL_ERROR", "Đã xảy ra lỗi xử lý. Vui lòng thử lại.", 500);
}

export async function readJson<T>(request: Request, parser: { parse: (value: unknown) => T }): Promise<T> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new AppError("INVALID_JSON", "Nội dung yêu cầu không phải JSON hợp lệ.", 400);
  }
  return parser.parse(payload);
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin) {
    const requestUrl = new URL(request.url);
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      throw new AppError("INVALID_ORIGIN", "Origin không hợp lệ.", 403);
    }
    if (originUrl.host !== requestUrl.host) {
      throw new AppError("CSRF_BLOCKED", "Yêu cầu từ origin khác đã bị chặn.", 403);
    }
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new AppError("CSRF_BLOCKED", "Yêu cầu cross-site đã bị chặn.", 403);
  }
}

export function assertMethod(request: Request, method: string): void {
  if (request.method !== method) {
    throw new AppError("METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ.", 405);
  }
}

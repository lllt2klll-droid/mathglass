import type { ApiResponse } from "@/types/api";

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function apiFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiClientError(
      "INVALID_RESPONSE",
      "Máy chủ trả về dữ liệu không hợp lệ.",
      response.status,
    );
  }
  if (!response.ok || !payload || payload.ok === false) {
    const error = payload && payload.ok === false ? payload.error : null;
    throw new ApiClientError(
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "Yêu cầu thất bại.",
      response.status,
      error?.details,
    );
  }
  return payload.data;
}

export async function fetchBlob(input: string): Promise<Blob> {
  const response = await fetch(input);
  if (!response.ok) {
    let message = "Không thể tải tệp.";
    try {
      const payload = (await response.json()) as ApiResponse<unknown>;
      if (payload.ok === false) message = payload.error.message;
    } catch {
      // binary error body
    }
    throw new ApiClientError("DOWNLOAD_FAILED", message, response.status);
  }
  return response.blob();
}

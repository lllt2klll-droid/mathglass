import { cookies } from "next/headers";
import { AppError } from "@/types/api";
import { COOKIE_NAME } from "@/config/site";
import { parseSessionValue } from "@/lib/session-token";

/**
 * Returns the signed browser-workspace owner id. The proxy establishes the
 * cookie before application code runs. Every project/file lookup re-checks
 * ownership against this id, regardless of client-supplied identifiers.
 */
export async function requireOwnerId(): Promise<string> {
  const store = await cookies();
  const parsed = await parseSessionValue(store.get(COOKIE_NAME)?.value);
  if (!parsed.valid || !parsed.ownerId) {
    throw new AppError(
      "SESSION_REQUIRED",
      "Phiên làm việc không hợp lệ. Hãy tải lại trang để tạo phiên mới.",
      401,
    );
  }
  return parsed.ownerId;
}

export async function optionalOwnerId(): Promise<string | null> {
  const store = await cookies();
  const parsed = await parseSessionValue(store.get(COOKIE_NAME)?.value);
  return parsed.valid ? parsed.ownerId : null;
}

import { requireOwnerId } from "@/lib/session";
import { apiSuccess, assertSameOrigin, handleApiError } from "@/lib/http";
import { deleteWorkspaceData, getWorkspaceInfo } from "@/services/db/repository";
import { databaseInfo } from "@/services/db/local-store";
import { AppError } from "@/types/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const [workspace, database] = await Promise.all([
      getWorkspaceInfo(ownerId),
      databaseInfo(),
    ]);
    return apiSuccess({ workspace, database });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    let payload: unknown = null;
    try {
      payload = await request.json();
    } catch {
      payload = null;
    }
    const confirmation =
      payload && typeof payload === "object" && "confirm" in payload
        ? String((payload as { confirm?: unknown }).confirm ?? "")
        : "";
    if (confirmation !== "XOA TOAN BO") {
      throw new AppError(
        "CONFIRMATION_REQUIRED",
        'Nhập chính xác "XOA TOAN BO" để xác nhận xóa toàn bộ dữ liệu workspace.',
        400,
      );
    }
    await deleteWorkspaceData(ownerId);
    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}

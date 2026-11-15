import { createHash } from "node:crypto";
import { after } from "next/server";
import { PDFDocument } from "pdf-lib";
import { DEFAULT_CONVERSION_SETTINGS, type ConversionSettings } from "@/types/project";
import { AppError } from "@/types/api";
import { requireOwnerId } from "@/lib/session";
import { apiSuccess, assertSameOrigin, handleApiError } from "@/lib/http";
import {
  conversionSettingsSchema,
} from "@/lib/schemas";
import {
  detectFile,
  readImageDimensions,
} from "@/modules/document-parser/file-type";
import { getMaxUploadBytes } from "@/config/site";
import {
  createJob,
  createUploadedProject,
} from "@/services/db/repository";
import {
  deleteProjectFiles,
  extensionForMime,
  originalFileKey,
  saveStoredFile,
} from "@/services/storage/local-files";
import { checkRateLimit } from "@/services/security/rate-limit";
import { runConversionJob } from "@/services/jobs/conversion-job";
import { newId } from "@/lib/ids";

export const runtime = "nodejs";
export const maxDuration = 60;

async function inspectPdf(bytes: Uint8Array): Promise<{ pageCount: number | null; metadata: Record<string, unknown> }> {
  try {
    const document = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
    return {
      pageCount: document.getPageCount(),
      metadata: {
        title: document.getTitle() ?? null,
        author: document.getAuthor() ?? null,
        creator: document.getCreator() ?? null,
      },
    };
  } catch {
    throw new AppError(
      "PDF_UNREADABLE",
      "Không thể đọc cấu trúc PDF. Tệp có thể bị mã hóa, hỏng hoặc không phải PDF hợp lệ.",
      400,
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    const rate = checkRateLimit(`upload:${ownerId}`, 20, 60 * 60 * 1000);
    if (!rate.allowed) {
      throw new AppError(
        "RATE_LIMITED",
        `Bạn đã tải lên quá nhiều tệp. Thử lại sau ${rate.retryAfterSeconds} giây.`,
        429,
      );
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > getMaxUploadBytes() + 2 * 1024 * 1024) {
      throw new AppError(
        "FILE_TOO_LARGE",
        `Tệp vượt quá giới hạn ${Math.round(getMaxUploadBytes() / (1024 * 1024))} MB.`,
        413,
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError("INVALID_FORM_DATA", "Không đọc được dữ liệu tải lên.", 400);
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("FILE_REQUIRED", "Hãy chọn một tệp PDF, DOCX, PNG hoặc JPG.", 400);
    }
    if (file.size <= 0) throw new AppError("EMPTY_FILE", "Tệp rỗng.", 400);
    if (file.size > getMaxUploadBytes()) {
      throw new AppError(
        "FILE_TOO_LARGE",
        `Tệp vượt quá giới hạn ${Math.round(getMaxUploadBytes() / (1024 * 1024))} MB.`,
        413,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = await detectFile(bytes, file.name);

    let settings: ConversionSettings = DEFAULT_CONVERSION_SETTINGS;
    const rawSettings = form.get("settings");
    if (typeof rawSettings === "string" && rawSettings.trim()) {
      try {
        settings = conversionSettingsSchema.parse(JSON.parse(rawSettings));
      } catch {
        throw new AppError("INVALID_SETTINGS", "Cấu hình chuyển đổi không hợp lệ.", 422);
      }
    }
    const requestedName = String(form.get("name") ?? "").trim().slice(0, 160);

    let pageCount: number | null = null;
    let metadata: Record<string, unknown> = {};
    if (detected.type === "pdf") {
      const inspection = await inspectPdf(bytes);
      pageCount = inspection.pageCount;
      metadata = inspection.metadata;
    } else if (detected.type === "image") {
      const dimensions = readImageDimensions(bytes, detected.mimeType);
      pageCount = 1;
      if (dimensions) {
        metadata = { width: dimensions.width, height: dimensions.height };
      }
    }

    const projectId = newId();
    const documentId = newId();
    const storageKey = originalFileKey({
      ownerId,
      projectId,
      documentId,
      extension: detected.extension || extensionForMime(detected.mimeType),
    });
    await saveStoredFile(storageKey, bytes);

    let project;
    try {
      project = await createUploadedProject(ownerId, {
        projectId,
        documentId,
        name: requestedName,
        originalFilename: file.name.slice(0, 255),
        mimeType: detected.mimeType,
        detectedType: detected.type,
        fileSizeBytes: bytes.byteLength,
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
        pageCount,
        metadata,
        settings,
        storageKey,
      });
    } catch (error) {
      await deleteProjectFiles(ownerId, projectId);
      throw error;
    }

    if (form.get("autostart") === "true") {
      const job = await createJob({
        ownerId,
        projectId: project.id,
        documentId,
        jobType: "parse",
      });
      after(async () => {
        await runConversionJob(ownerId, project.id, job.id);
      });
      return apiSuccess(
        {
          project,
          job,
          detected: { type: detected.type, mimeType: detected.mimeType, pageCount },
        },
        { status: 201 },
      );
    }

    return apiSuccess(
      {
        project,
        job: null,
        detected: { type: detected.type, mimeType: detected.mimeType, pageCount },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}


import { createHash } from "node:crypto";
import type { ConversionSettings } from "@/types/project";
import type { DocumentDiagnostic, ParsedAssetInput, ParseResult } from "@/types/document";
import { getMaxPages } from "@/config/site";
import { AppError } from "@/types/api";
import { newId } from "@/lib/ids";
import {
  getDocumentStructure,
  getStoredDocumentByProject,
  getJobById,
  isJobCancelRequested,
  saveParsedDocument,
  saveProjectLatex,
  updateJob,
  updateProject,
  appendDocumentDiagnostics,
} from "@/services/db/repository";
import type { StoredAsset } from "@/services/db/types";
import {
  readStoredFile,
  saveAssetFile,
} from "@/services/storage/local-files";
import { parsePdf } from "@/modules/document-parser/pdf-parser";
import { parseDocx } from "@/modules/document-parser/docx-parser";
import { parseImage } from "@/modules/document-parser/image-parser";
import { generateLatex } from "@/modules/latex-generator";
import { validateLatex } from "@/modules/latex-generator/validate";

class JobCancelledError extends Error {
  constructor() {
    super("Tác vụ đã bị hủy bởi người dùng.");
    this.name = "JobCancelledError";
  }
}

function checksum(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export interface RunJobResult {
  status: "completed" | "needs_review" | "cancelled" | "failed";
  projectId: string;
  jobId: string;
}

export async function runConversionJob(
  ownerId: string,
  projectId: string,
  jobId: string,
): Promise<RunJobResult> {
  const previous = await getStoredDocumentByProject(ownerId, projectId);
  const previousStatus = previous.project.status;
  const settings: ConversionSettings = previous.project.settings;
  let lastProgress = -1;

  const checkCancelled = async () => {
    if (await isJobCancelRequested(jobId, ownerId)) throw new JobCancelledError();
  };

  const progress = async (value: number, stage: string, detail = "") => {
    await checkCancelled();
    if (value <= lastProgress) return;
    lastProgress = value;
    await updateJob(ownerId, jobId, {
      status: "parsing",
      progressPercent: Math.max(0, Math.min(99, value)),
      stage,
      stageDetail: detail,
    });
  };

  try {
    await updateJob(ownerId, jobId, {
      status: "validating",
      stage: "Đang kiểm tra tệp nguồn",
      startedAt: new Date().toISOString(),
      attemptCount: 1,
      progressPercent: 2,
    });
    await updateProject(ownerId, projectId, { status: "processing" });

    const { document } = previous;
    const buffer = await readStoredFile(document.storageKey);
    if (buffer.byteLength === 0) {
      throw new AppError("EMPTY_FILE", "Tệp nguồn rỗng.", 400);
    }

    const assets: StoredAsset[] = [];
    const timestamp = new Date().toISOString();
    const assetSink = async (input: ParsedAssetInput) => {
      await checkCancelled();
      const assetId = newId();
      const saved = await saveAssetFile({
        ownerId,
        projectId,
        assetId,
        input,
      });
      assets.push({
        id: assetId,
        ownerId,
        projectId,
        filename: input.filename,
        mimeType: input.mimeType,
        storageKey: saved.storageKey,
        sizeBytes: saved.sizeBytes,
        width: input.width ?? null,
        height: input.height ?? null,
        createdAt: timestamp,
      });
      return { assetId };
    };

    await progress(5, "Đang phân tích cấu trúc tài liệu");
    let parsed: ParseResult;
    const baseOptions = {
      documentId: document.id,
      filename: document.originalFilename,
      settings,
      onProgress: progress,
    };
    if (document.detectedType === "pdf") {
      parsed = await parsePdf(buffer, baseOptions);
    } else if (document.detectedType === "docx") {
      parsed = await parseDocx(buffer, { ...baseOptions, assetSink });
    } else if (document.detectedType === "image") {
      const metadata = document.metadata as { width?: number; height?: number };
      const width = Number(metadata.width ?? 0);
      const height = Number(metadata.height ?? 0);
      parsed = await parseImage(buffer, {
        ...baseOptions,
        mimeType: document.mimeType,
        width: width > 0 ? width : 1000,
        height: height > 0 ? height : 1000,
        assetSink,
      });
    } else {
      throw new AppError("UNSUPPORTED_FILE_TYPE", "Loại tài liệu chưa được hỗ trợ.", 415);
    }

    await checkCancelled();
    const pageLimitDiagnostics: DocumentDiagnostic[] = [];
    if (parsed.ast.pages.length > getMaxPages()) {
      parsed.ast.pages = parsed.ast.pages.slice(0, getMaxPages());
      pageLimitDiagnostics.push({
        code: "PAGE_LIMIT_TRUNCATED",
        severity: "warning",
        message: `Chỉ ${getMaxPages()} trang đầu tiên được chuyển đổi theo giới hạn cấu hình.`,
      });
    }
    const diagnostics = [...parsed.ast.diagnostics, ...pageLimitDiagnostics];

    await updateJob(ownerId, jobId, {
      status: "parsing",
      progressPercent: 78,
      stage: "Đang lưu cấu trúc tài liệu",
    });
    await saveParsedDocument({
      ownerId,
      projectId,
      documentId: document.id,
      ast: parsed.ast,
      assets,
      diagnostics,
    });

    await checkCancelled();
    await updateJob(ownerId, jobId, {
      status: "generating",
      progressPercent: 84,
      stage: "Đang tạo mã LaTeX",
    });
    const structure = await getDocumentStructure(ownerId, projectId);
    const generated = generateLatex({
      ast: structure.ast,
      settings,
      projectName: structure.project.name,
      sourceFilename: document.originalFilename,
      assets: assets.map((asset) => ({
        id: asset.id,
        filename: asset.filename,
        mimeType: asset.mimeType,
      })),
    });
    const validation = validateLatex(generated.source, {
      knownAssets: Object.values(generated.assetPaths),
    });

    await updateJob(ownerId, jobId, {
      status: "validating_output",
      progressPercent: 92,
      stage: "Đang kiểm tra cú pháp LaTeX",
      stageDetail: validation.valid ? "" : `${validation.diagnostics.filter((item) => item.severity === "error").length} lỗi cú pháp`,
    });

    await saveProjectLatex({
      ownerId,
      projectId,
      source: generated.source,
      lineMap: generated.lineMap,
      snapshot: true,
      summary: "Khởi tạo từ chuyển đổi tài liệu",
    });

    if (generated.diagnostics.length > 0) {
      await appendDocumentDiagnostics(
        ownerId,
        projectId,
        generated.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          severity: diagnostic.severity === "error" ? "error" : diagnostic.severity,
          message: diagnostic.message,
          blockId: diagnostic.blockId,
          source: "latex-generator",
        })),
      );
    }

    const latest = await getDocumentStructure(ownerId, projectId);
    const needsReview =
      latest.project.needsReviewCount > 0 ||
      !validation.valid ||
      generated.diagnostics.some((diagnostic) => diagnostic.severity === "error");

    await updateJob(ownerId, jobId, {
      status: needsReview ? "needs_review" : "completed",
      progressPercent: 100,
      stage: needsReview ? "Hoàn tất — cần giáo viên kiểm tra" : "Hoàn tất",
      stageDetail: `${latest.project.blockCount} block · ${latest.project.mathBlockCount} công thức · ${latest.project.needsReviewCount} mục cần kiểm tra`,
      finishedAt: new Date().toISOString(),
    });
    return {
      status: needsReview ? "needs_review" : "completed",
      projectId,
      jobId,
    };
  } catch (error) {
    if (error instanceof JobCancelledError) {
      await updateJob(ownerId, jobId, {
        status: "cancelled",
        stage: "Đã hủy",
        stageDetail: "Tác vụ bị hủy theo yêu cầu.",
        finishedAt: new Date().toISOString(),
      });
      await updateProject(ownerId, projectId, {
        status: previous.project.blockCount > 0 ? previousStatus : "draft",
      });
      return { status: "cancelled", projectId, jobId };
    }
    const message =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Lỗi không xác định khi xử lý tài liệu.";
    await updateJob(ownerId, jobId, {
      status: "failed",
      stage: "Xử lý thất bại",
      errorCode: error instanceof AppError ? error.code : "CONVERSION_FAILED",
      errorMessage: message.slice(0, 1000),
      stageDetail: message.slice(0, 1000),
      finishedAt: new Date().toISOString(),
    });
    await updateProject(ownerId, projectId, {
      status: previous.project.blockCount > 0 ? previousStatus : "failed",
    });
    return { status: "failed", projectId, jobId };
  }
}

export async function retryJobFromHistory(ownerId: string, projectId: string, jobId: string) {
  const job = await getJobById(ownerId, jobId);
  if (job.status !== "failed" && job.status !== "cancelled") {
    throw new AppError("JOB_RETRY_NOT_ALLOWED", "Chỉ có thể chạy lại tác vụ thất bại hoặc đã hủy.", 409);
  }
  return job;
}

export async function recomputeSourceHash(source: string): Promise<string> {
  return checksum(Buffer.from(source, "utf8"));
}

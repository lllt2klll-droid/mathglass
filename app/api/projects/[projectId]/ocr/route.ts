import { requireOwnerId } from "@/lib/session";
import { apiSuccess, assertSameOrigin, handleApiError, readJson } from "@/lib/http";
import { ocrRequestSchema } from "@/lib/schemas";
import {
  getDocumentStructure,
  getProvider,
  getReviewReport,
  recordRecognition,
  replacePageBlocks,
} from "@/services/db/repository";
import { providerRuntime, recognizePageImage } from "@/services/ai/provider";
import { regenerateProjectLatex } from "@/services/latex/regenerate";
import { getConfidenceBand } from "@/config/site";
import { AppError } from "@/types/api";
import { newId } from "@/lib/ids";
import type {
  BlockContent,
  DocumentBlock,
  InlineNode,
  MathProvenance,
  TableCell,
} from "@/types/document";

export const runtime = "nodejs";
export const maxDuration = 150;

function textInlines(text: string | undefined): InlineNode[] {
  const clean = (text ?? "").trim();
  return clean ? [{ type: "text", text: clean }] : [];
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
    const payload = await readJson(request, ocrRequestSchema);

    const provider = await getProvider(ownerId);
    if (!provider) {
      throw new AppError(
        "AI_NOT_CONFIGURED",
        "Chưa cấu hình nhà cung cấp vision. MathGlass không tạo nội dung OCR khi chưa có provider thật. Hãy cấu hình trong Cài đặt.",
        409,
      );
    }
    const runtime = providerRuntime(provider);

    let bytes: Buffer;
    try {
      bytes = Buffer.from(payload.imageBase64, "base64");
    } catch {
      throw new AppError("INVALID_IMAGE", "Dữ liệu hình ảnh không phải base64 hợp lệ.", 400);
    }
    if (bytes.byteLength === 0) {
      throw new AppError("INVALID_IMAGE", "Hình ảnh rỗng.", 400);
    }
    if (bytes.byteLength > 10 * 1024 * 1024) {
      throw new AppError(
        "IMAGE_TOO_LARGE",
        "Ảnh trang vượt quá 10 MB. Hãy giảm độ phân giải trước khi OCR.",
        413,
      );
    }
    if (payload.mimeType === "image/png" && bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new AppError("IMAGE_MIME_MISMATCH", "Dữ liệu không phải PNG hợp lệ.", 400);
    }
    if (payload.mimeType === "image/jpeg" && bytes.subarray(0, 3).toString("hex") !== "ffd8ff") {
      throw new AppError("IMAGE_MIME_MISMATCH", "Dữ liệu không phải JPEG hợp lệ.", 400);
    }

    const structure = await getDocumentStructure(ownerId, projectId);
    const pageNumber =
      payload.pageNumber ??
      structure.ast.pages.find((page) => page.textLayerStatus !== "available")?.pageNumber ??
      1;
    const page = structure.ast.pages.find((item) => item.pageNumber === pageNumber);
    if (!page) {
      throw new AppError("PAGE_NOT_FOUND", `Không tìm thấy trang ${pageNumber}.`, 404);
    }

    const recognized = await recognizePageImage(runtime, {
      imageBase64: payload.imageBase64,
      mimeType: payload.mimeType,
    });
    if (recognized.blocks.length === 0) {
      throw new AppError(
        "AI_EMPTY_RECOGNITION",
        "Nhà cung cấp không trả về nội dung nào. Trang nguồn không bị thay đổi.",
        422,
      );
    }

    if (!payload.replacePage) {
      return apiSuccess({
        recognized,
        applied: false,
        pageNumber,
      });
    }

    const receivedAt = recognized.receivedAt;
    const provenance: MathProvenance = {
      providerId: recognized.providerId,
      model: recognized.model,
      recognizedAt: receivedAt,
    };

    const blocks: DocumentBlock[] = [];
    recognized.blocks.forEach((recognizedBlock, index) => {
      const confidence = recognizedBlock.confidence;
      const band = getConfidenceBand(confidence);
      const warnings: string[] = [];
      if (recognizedBlock.warning) warnings.push(recognizedBlock.warning);
      if (band === "low" || band === "unknown") {
        warnings.push("Độ tin cậy OCR thấp hoặc chưa có confidence. Cần đối chiếu ảnh gốc trước khi dùng.");
      }
      if (recognized.warnings.length > 0) {
        warnings.push(...recognized.warnings.slice(0, 3));
      }
      const status = band === "high" ? "recognized" : "needs_review";

      let content: BlockContent;
      let type: DocumentBlock["type"];
      switch (recognizedBlock.type) {
        case "display_math":
          if (!recognizedBlock.latex?.trim()) return;
          type = "display_math";
          content = {
            kind: "display_math",
            latex: recognizedBlock.latex.trim(),
            originalText: recognizedBlock.text,
            provenance: { ...provenance, originalText: recognizedBlock.text },
          };
          break;
        case "heading":
          if (!recognizedBlock.text?.trim()) return;
          type = "heading";
          content = { kind: "heading", level: 2, inlines: textInlines(recognizedBlock.text) };
          break;
        case "table": {
          if (!recognizedBlock.rows || recognizedBlock.rows.length === 0) return;
          const rows: TableCell[][] = recognizedBlock.rows.map((row, rowIndex) =>
            row.map((cell) => ({
              inlines: textInlines(cell),
              header: rowIndex === 0,
            })),
          );
          type = "table";
          content = { kind: "table", rows, hasHeaderRow: true };
          break;
        }
        case "unknown":
          type = "unknown";
          content = {
            kind: "unknown",
            reason: "AI không nhận diện chắc chắn vùng này. Nội dung thô được giữ lại để giáo viên kiểm tra.",
            rawText: recognizedBlock.text,
          };
          break;
        default:
          if (!recognizedBlock.text?.trim()) return;
          type = "paragraph";
          content = { kind: "paragraph", inlines: textInlines(recognizedBlock.text) };
          break;
      }

      blocks.push({
        id: newId(),
        type,
        order: index,
        pageNumber,
        source: {
          documentId: structure.document.id,
          pageNumber,
          sourceElementPath: "ai-ocr",
        },
        status,
        confidence,
        confidenceBand: band,
        warnings,
        content,
        originalContent: structuredClone(content),
      } as DocumentBlock);
    });

    if (blocks.length === 0) {
      throw new AppError(
        "AI_USABLE_BLOCKS_EMPTY",
        "Không có block nào đủ dữ liệu để áp dụng. Trang nguồn không bị thay đổi.",
        422,
      );
    }

    const replaced = await replacePageBlocks({
      ownerId,
      projectId,
      pageNumber,
      blocks,
      textLayerStatus: "partial",
      pageMetadata: {
        ocrProvider: recognized.providerId,
        ocrModel: recognized.model,
        ocrAt: receivedAt,
      },
    });

    await recordRecognition({
      ownerId,
      projectId,
      documentId: structure.document.id,
      pageId: replaced.page.id,
      blockId: null,
      providerId: recognized.providerId,
      modelName: recognized.model,
      confidence: recognized.blocks.reduce((total, block) => total + (block.confidence ?? 0), 0) /
        Math.max(1, recognized.blocks.filter((block) => typeof block.confidence === "number").length),
      normalizedResult: recognized,
      warnings: recognized.warnings,
    });

    const regenerated = await regenerateProjectLatex(ownerId, projectId, {
      snapshot: true,
      summary: `OCR trang ${pageNumber}`,
    });
    const report = await getReviewReport(ownerId, projectId);
    return apiSuccess({
      applied: true,
      pageNumber,
      recognized,
      appliedBlocks: blocks.length,
      report,
      project: regenerated.project,
      latex: {
        source: regenerated.generated.source,
        valid: regenerated.validation.valid,
        diagnostics: regenerated.validation.diagnostics,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

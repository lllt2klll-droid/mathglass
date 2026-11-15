import type {
  DocumentAst,
  DocumentBlock,
  DocumentPage,
  ImageContent,
  ParseResult,
  ParsedAssetInput,
} from "@/types/document";
import { AST_SCHEMA_VERSION } from "@/types/document";
import { getConfidenceBand } from "@/config/site";
import type { ConversionSettings } from "@/types/project";
import { newId } from "@/lib/ids";

export interface ImageParseOptions {
  documentId: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  settings: ConversionSettings;
  assetSink?: (asset: ParsedAssetInput) => Promise<{ assetId: string }>;
  onProgress?: (progress: number, stage: string) => Promise<void> | void;
}

export async function parseImage(
  buffer: Uint8Array,
  options: ImageParseOptions,
): Promise<ParseResult> {
  await options.onProgress?.(20, "Đang kiểm tra hình ảnh");
  const assetInput: ParsedAssetInput = {
    filename: options.filename,
    mimeType: options.mimeType,
    data: buffer,
    width: options.width,
    height: options.height,
  };
  const assetId = options.assetSink
    ? (await options.assetSink(assetInput)).assetId
    : newId();

  const imageContent: ImageContent = {
    kind: "image",
    assetId,
    filename: options.filename,
    alt: options.filename,
    mimeType: options.mimeType,
    width: options.width,
    height: options.height,
    placement: "block",
  };
  const imageBlock: DocumentBlock = {
    id: newId(),
    type: "image",
    content: imageContent,
    originalContent: structuredClone(imageContent),
    order: 0,
    pageNumber: 1,
    source: {
      documentId: options.documentId,
      pageNumber: 1,
      boundingBox: { x: 0, y: 0, width: 1, height: 1, coordinateSpace: "page_normalized" },
      sourceElementPath: "image",
    },
    status: "recognized",
    confidence: 0.99,
    confidenceBand: getConfidenceBand(0.99),
    warnings: [],
  };

  const ocrBlock: DocumentBlock = {
    id: newId(),
    type: "unknown",
    content: {
      kind: "unknown",
      reason:
        "Hình ảnh chưa được OCR. Cấu hình nhà cung cấp vision trong Cài đặt, sau đó chạy nhận diện tại Accuracy Lab.",
    },
    originalContent: {
      kind: "unknown",
      reason:
        "Hình ảnh chưa được OCR. Cấu hình nhà cung cấp vision trong Cài đặt, sau đó chạy nhận diện tại Accuracy Lab.",
    },
    order: 1,
    pageNumber: 1,
    source: {
      documentId: options.documentId,
      pageNumber: 1,
      boundingBox: { x: 0, y: 0, width: 1, height: 1, coordinateSpace: "page_normalized" },
      sourceElementPath: "image:ocr-required",
    },
    status: "needs_review",
    confidence: 0,
    confidenceBand: "unknown",
    warnings: [
      "Không có nội dung văn bản nào được tạo tự động. Cần OCR bằng nhà cung cấp hình ảnh.",
    ],
  };

  const page: DocumentPage = {
    id: newId(),
    documentId: options.documentId,
    pageNumber: 1,
    width: options.width,
    height: options.height,
    rotation: 0,
    textLayerStatus: "unavailable",
    blocks: [imageBlock, ocrBlock],
    metadata: { source: "image", width: options.width, height: options.height },
  };

  const warnings = [];
  if (options.width < 600 || options.height < 600) {
    warnings.push(
      "Độ phân giải hình ảnh thấp; nhận diện công thức có thể kém chính xác. Nên dùng ảnh tối thiểu 1200 px chiều rộng.",
    );
  }
  if (options.width > 10000 || options.height > 10000) {
    warnings.push("Hình ảnh có kích thước rất lớn; quá trình OCR có thể chậm hoặc vượt giới hạn nhà cung cấp.");
  }

  const ast: DocumentAst = {
    schemaVersion: AST_SCHEMA_VERSION,
    documentId: options.documentId,
    title: options.filename,
    language: options.settings.language,
    sourceType: "image",
    pages: [page],
    diagnostics: [
      {
        code: "IMAGE_OCR_REQUIRED",
        severity: "warning",
        message:
          "Tài liệu hình ảnh cần OCR để có nội dung LaTeX. MathGlass không tự tạo nội dung khi chưa có nhà cung cấp nhận diện.",
      },
      ...warnings.map((message) => ({
        code: "IMAGE_QUALITY",
        severity: "warning" as const,
        message,
      })),
    ],
    metadata: {
      pageCount: 1,
      textLayerPages: 0,
      scannedPages: 1,
      blockCount: 2,
      mathBlockCount: 0,
      parser: "mathglass-image",
      parsedAt: new Date().toISOString(),
    },
  };

  await options.onProgress?.(70, "Đã chuẩn bị hình ảnh cho OCR");
  return { ast, assets: [assetInput] };
}

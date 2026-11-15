import type {
  DocumentAst,
  DocumentBlock,
  DocumentDiagnostic,
  DocumentPage,
  InlineNode,
  ParseResult,
} from "@/types/document";
import { AST_SCHEMA_VERSION } from "@/types/document";
import { getConfidenceBand, getMaxPages } from "@/config/site";
import type { ConversionSettings } from "@/types/project";
import { newId } from "@/lib/ids";
import { detectEquation } from "./math-text";

interface ViewportLike {
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): [number, number];
}

interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
}

interface PdfPageLike {
  rotate: number;
  getViewport(params: { scale: number }): ViewportLike;
  getTextContent(params?: { includeMarkedContent?: boolean }): Promise<{
    items: Array<TextItemLike | { type?: string }>;
  }>;
}

interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
  getMetadata(): Promise<{
    info?: Record<string, unknown>;
    metadata?: { get(name: string): unknown } | null;
  }>;
  destroy(): Promise<void>;
}

interface PdfModuleLike {
  getDocument(params: Record<string, unknown>): {
    promise: Promise<PdfDocumentLike>;
    destroy(): Promise<void>;
  };
  version: string;
}

export interface PdfParseOptions {
  documentId: string;
  filename: string;
  settings: ConversionSettings;
  onProgress?: (progress: number, stage: string) => Promise<void> | void;
}

interface Line {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bbox: { x: number; y: number; width: number; height: number };
}

function cleanText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeBox(
  x: number,
  y: number,
  width: number,
  height: number,
  pageWidth: number,
  pageHeight: number,
): Line["bbox"] {
  return {
    x: Math.max(0, Math.min(1, x / pageWidth)),
    y: Math.max(0, Math.min(1, y / pageHeight)),
    width: Math.max(0, Math.min(1, width / pageWidth)),
    height: Math.max(0, Math.min(1, height / pageHeight)),
  };
}

function itemsToLines(items: TextItemLike[], viewport: ViewportLike): Line[] {
  const converted = items
    .filter((item) => typeof item.str === "string" && item.str.trim().length > 0)
    .map((item) => {
      const [screenX, screenY] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      const scale = Math.abs(item.transform[0]) || 1;
      const fontSize = Math.abs(item.transform[3]) || item.height || 10;
      return {
        text: cleanText(item.str),
        x: screenX,
        y: screenY,
        width: Math.max(item.width * scale, 1),
        height: Math.max(Math.abs(item.height) || fontSize, 1),
        fontSize: Math.max(Math.abs(fontSize), 1),
      };
    })
    .filter((item) => item.text.length > 0);

  converted.sort((left, right) => right.y - left.y || left.x - right.x);
  const lines: Line[] = [];
  let current: typeof converted = [];

  const flush = () => {
    if (current.length === 0) return;
    current.sort((left, right) => left.x - right.x);
    let text = "";
    let previousEnd: number | null = null;
    for (const item of current) {
      if (previousEnd !== null) {
        const gap = item.x - previousEnd;
        if (gap > Math.max(1.2, item.fontSize * 0.16) && !text.endsWith(" ") && !item.text.startsWith(" ")) {
          text += " ";
        }
      }
      text += item.text;
      previousEnd = item.x + item.width;
    }
    const cleaned = cleanText(text);
    if (cleaned) {
      const minX = Math.min(...current.map((item) => item.x));
      const maxX = Math.max(...current.map((item) => item.x + item.width));
      const avgY = current.reduce((sum, item) => sum + item.y, 0) / current.length;
      const maxFont = Math.max(...current.map((item) => item.fontSize));
      const height = Math.max(...current.map((item) => item.height));
      lines.push({
        text: cleaned,
        x: minX,
        y: avgY,
        width: maxX - minX,
        height,
        fontSize: maxFont,
        bbox: normalizeBox(minX, avgY - height, maxX - minX, height, viewport.width, viewport.height),
      });
    }
    current = [];
  };

  for (const item of converted) {
    if (current.length === 0) {
      current.push(item);
      continue;
    }
    const reference = current[0];
    const tolerance = Math.max(3, Math.min(reference.fontSize, item.fontSize) * 0.38);
    if (Math.abs(item.y - reference.y) <= tolerance) {
      current.push(item);
    } else {
      flush();
      current.push(item);
    }
  }
  flush();
  return lines;
}

function unionBox(lines: Line[], pageWidth: number, pageHeight: number) {
  const minX = Math.min(...lines.map((line) => line.bbox.x * pageWidth));
  const minY = Math.min(...lines.map((line) => (line.bbox.y) * pageHeight));
  const maxX = Math.max(...lines.map((line) => (line.bbox.x + line.bbox.width) * pageWidth));
  const maxY = Math.max(...lines.map((line) => (line.bbox.y + line.bbox.height) * pageHeight));
  return normalizeBox(minX, minY, maxX - minX, maxY - minY, pageWidth, pageHeight);
}

function makeBlock(
  content: DocumentBlock["content"],
  type: DocumentBlock["type"],
  pageNumber: number,
  sourcePath: string,
  bbox: Line["bbox"],
  options: {
    status?: DocumentBlock["status"];
    confidence?: number;
    warnings?: string[];
    documentId: string;
    order: number;
  },
): DocumentBlock {
  return {
    id: newId(),
    type,
    content,
    originalContent: structuredClone(content),
    order: options.order,
    pageNumber,
    source: {
      documentId: options.documentId,
      pageNumber,
      boundingBox: { ...bbox, coordinateSpace: "page_normalized" },
      sourceElementPath: sourcePath,
    },
    status: options.status ?? "extracted",
    confidence: options.confidence,
    confidenceBand: getConfidenceBand(options.confidence),
    warnings: options.warnings ?? [],
  } as DocumentBlock;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function buildPageBlocks(
  lines: Line[],
  pageNumber: number,
  documentId: string,
  viewport: ViewportLike,
  diagnostics: DocumentDiagnostic[],
): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  let order = 0;
  const fontMedian = median(lines.map((line) => line.fontSize));
  let paragraph: Line[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.map((line) => line.text).join(" ");
    const inlines: InlineNode[] = [{ type: "text", text }];
    const content: DocumentBlock["content"] = {
      kind: "paragraph",
      inlines,
    };
    blocks.push(
      makeBlock(
        content,
        "paragraph",
        pageNumber,
        `page[${pageNumber}]:text`,
        unionBox(paragraph, viewport.width, viewport.height),
        {
          documentId,
          order,
          status: "extracted",
          confidence: 0.97,
        },
      ),
    );
    order += 1;
    paragraph = [];
  };

  for (const line of lines) {
    const equation = detectEquation(line.text);
    if (equation) {
      flushParagraph();
      const content: DocumentBlock["content"] = {
        kind: "display_math",
        latex: equation.latex,
        originalText: line.text,
        provenance: {
          providerId: "pdf-text-layer",
          recognizedAt: new Date().toISOString(),
          originalText: line.text,
        },
      };
      blocks.push(
        makeBlock(content, "display_math", pageNumber, `page[${pageNumber}]:equation`, line.bbox, {
          documentId,
          order,
          status: "needs_review",
          confidence: equation.confidence,
          warnings: [
            "Công thức được nhận diện từ lớp văn bản PDF; cấu trúc phân số/số mũ có thể chưa chính xác. Hãy đối chiếu ảnh gốc.",
          ],
        }),
      );
      order += 1;
      continue;
    }

    const previous = paragraph[paragraph.length - 1];
    const isHeading =
      fontMedian > 0 &&
      line.fontSize >= fontMedian * 1.28 &&
      line.text.length <= 140 &&
      !/[=<>≤≥≈≠]/.test(line.text) &&
      !/[.!?;:]$/.test(line.text);

    if (isHeading) {
      flushParagraph();
      const content: DocumentBlock["content"] = {
        kind: "heading",
        level: 2,
        inlines: [{ type: "text", text: line.text }],
      };
      blocks.push(
        makeBlock(content, "heading", pageNumber, `page[${pageNumber}]:heading`, line.bbox, {
          documentId,
          order,
          status: "needs_review",
          confidence: 0.68,
          warnings: ["Tiêu đề được suy đoán từ cỡ chữ trong lớp văn bản PDF; hãy kiểm tra lại cấp tiêu đề."],
        }),
      );
      order += 1;
      continue;
    }

    if (previous) {
      const verticalGap = previous.y - line.y;
      const indentDifference = Math.abs(previous.x - line.x);
      const paragraphBreak =
        verticalGap > Math.max(previous.fontSize, line.fontSize) * 1.85 ||
        indentDifference > Math.max(24, line.fontSize * 2.2) ||
        (previous.text.length < 48 && /[.!?]$/.test(previous.text) && verticalGap > line.fontSize * 1.2);
      if (paragraphBreak) flushParagraph();
    }

    if (paragraph.length === 0) {
      const firstLine = line;
      if (/^[•▪◦]\s+/.test(line.text)) {
        diagnostics.push({
          code: "PDF_BULLET_AS_TEXT",
          severity: "info",
          message: `Trang ${pageNumber}: ký hiệu đầu dòng được giữ dưới dạng văn bản thay vì danh sách LaTeX.`,
        });
      }
      paragraph.push(firstLine);
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return blocks;
}

export async function parsePdf(
  buffer: Uint8Array,
  options: PdfParseOptions,
): Promise<ParseResult> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfModuleLike;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  });
  let document: PdfDocumentLike | null = null;
  try {
    document = await loadingTask.promise;
    const pageLimit = Math.min(document.numPages, getMaxPages());
    const diagnostics: DocumentDiagnostic[] = [];
    if (document.numPages > pageLimit) {
      diagnostics.push({
        code: "PDF_PAGE_LIMIT",
        severity: "warning",
        message: `PDF có ${document.numPages} trang; cấu hình hiện tại chỉ xử lý ${pageLimit} trang.`,
      });
    }

    const pages: DocumentPage[] = [];
    let blockCount = 0;
    let mathCount = 0;
    let scannedPages = 0;

    for (let pageIndex = 1; pageIndex <= pageLimit; pageIndex += 1) {
      await options.onProgress?.(
        10 + Math.round((pageIndex / pageLimit) * 60),
        `Đang phân tích trang ${pageIndex}/${pageLimit}`,
      );
      const page = await document.getPage(pageIndex);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent({ includeMarkedContent: true });
      const textItems = textContent.items.filter(
        (item): item is TextItemLike =>
          "str" in item && typeof item.str === "string" && Array.isArray(item.transform),
      );
      const totalText = textItems.map((item) => item.str).join("").trim();
      const lines = itemsToLines(textItems, viewport);
      let blocks = buildPageBlocks(lines, pageIndex, options.documentId, viewport, diagnostics);
      let textLayerStatus: DocumentPage["textLayerStatus"] = "available";

      if (totalText.length < 12 || blocks.length === 0) {
        textLayerStatus = "unavailable";
        scannedPages += 1;
        const content: DocumentBlock["content"] = {
          kind: "unknown",
          reason:
            "Trang không có lớp văn bản đủ để trích xuất. Cần OCR bằng nhà cung cấp hình ảnh đã cấu hình hoặc nhập lại nội dung.",
        };
        blocks = [
          makeBlock(
            content,
            "unknown",
            pageIndex,
            `page[${pageIndex}]:scan`,
            { x: 0, y: 0, width: 1, height: 1 },
            {
              documentId: options.documentId,
              order: 0,
              status: "needs_review",
              confidence: 0,
              warnings: ["Trang có thể là bản scan hoặc không có text layer."],
            },
          ),
        ];
        diagnostics.push({
          code: "PDF_SCANNED_PAGE",
          severity: "warning",
          message: `Trang ${pageIndex} không có lớp văn bản. Cần OCR và đối chiếu ảnh gốc.`,
          pageNumber: pageIndex,
        });
      }

      blocks = blocks.map((block, index) => ({ ...block, order: index }));
      blockCount += blocks.length;
      mathCount += blocks.filter((block) => block.type === "display_math").length;
      pages.push({
        id: newId(),
        documentId: options.documentId,
        pageNumber: pageIndex,
        width: Math.round(viewport.width * 100) / 100,
        height: Math.round(viewport.height * 100) / 100,
        rotation: page.rotate,
        textLayerStatus,
        blocks,
        metadata: {
          source: "pdf",
          textItems: textItems.length,
        },
      });
    }

    let sourceMetadata: Record<string, unknown> = {};
    try {
      const metadata = await document.getMetadata();
      const info = metadata.info ?? {};
      sourceMetadata = {
        pdfTitle: typeof info.Title === "string" ? info.Title : undefined,
        pdfAuthor: typeof info.Author === "string" ? info.Author : undefined,
        pdfProducer: typeof info.Producer === "string" ? info.Producer : undefined,
        pdfCreator: typeof info.Creator === "string" ? info.Creator : undefined,
      };
    } catch {
      sourceMetadata = {};
    }

    const ast: DocumentAst = {
      schemaVersion: AST_SCHEMA_VERSION,
      documentId: options.documentId,
      title:
        typeof sourceMetadata.pdfTitle === "string" && sourceMetadata.pdfTitle.trim()
          ? sourceMetadata.pdfTitle
          : options.filename,
      language: options.settings.language,
      sourceType: "pdf",
      pages,
      diagnostics,
      metadata: {
        pageCount: pages.length,
        textLayerPages: pages.length - scannedPages,
        scannedPages,
        blockCount,
        mathBlockCount: mathCount,
        parser: `pdfjs-${pdfjs.version}`,
        parsedAt: new Date().toISOString(),
        sourceMetadata,
      },
    };
    await options.onProgress?.(75, "Đã trích xuất cấu trúc PDF");
    return { ast, assets: [] };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") {
      throw new Error("PDF được bảo vệ bằng mật khẩu. Hãy mở khóa tệp trước khi tải lên.");
    }
    if (name === "InvalidPDFException") {
      throw new Error("PDF không hợp lệ hoặc đã bị hỏng.");
    }
    throw error;
  } finally {
    try {
      await document?.destroy();
    } catch {
      // ignore cleanup errors
    }
    try {
      await loadingTask.destroy();
    } catch {
      // ignore cleanup errors
    }
  }
}

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { mammothRawTextFallback } from "./docx/fallback";
import {
  childrenNamed,
  firstChild,
  getAttribute,
  nodeChildren,
  nodeText,
  tagName,
  type OrderedNode,
} from "./docx/xml";
import { ommlNodesToLatex } from "./docx/omml";
import type {
  BlockContent,
  DocumentAst,
  DocumentBlock,
  DocumentDiagnostic,
  DocumentPage,
  ImageInline,
  InlineNode,
  MathInline,
  ParsedAssetInput,
  ParseResult,
  SourceType,
  TableCell,
} from "@/types/document";
import { AST_SCHEMA_VERSION } from "@/types/document";
import { getConfidenceBand, getMaxPages } from "@/config/site";
import type { ConversionSettings } from "@/types/project";
import { newId } from "@/lib/ids";
import { getMaxUploadBytes } from "@/config/site";

const MAX_BLOCKS = 6000;

interface Relationship {
  id: string;
  target: string;
  type: string;
  targetMode: string | null;
}

interface NumberingLevel {
  format: string;
  start: number;
}

interface DocxContext {
  zip: JSZip;
  documentId: string;
  data: OrderedNode;
  relations: Map<string, Relationship>;
  styles: Map<string, string>;
  numbering: Map<string, Map<number, NumberingLevel>>;
  settings: ConversionSettings;
  assetSink?: (asset: ParsedAssetInput) => Promise<{ assetId: string }>;
  assets: ParsedAssetInput[];
  imageCache: Map<string, ImageInline>;
  diagnostics: DocumentDiagnostic[];
  blockWarnings: string[];
  counter: number;
}

interface ParsedParagraph {
  styleId: string | null;
  headingLevel: number | null;
  numId: string | null;
  ilvl: number;
  align: "left" | "center" | "right" | "justify" | undefined;
  inlines: Array<InlineNode | { type: "pagebreak" }>;
  displayMath: { latex: string; warnings: string[] } | null;
  warnings: string[];
  sourcePath: string;
}

export interface DocxParseOptions {
  documentId: string;
  filename: string;
  settings: ConversionSettings;
  assetSink?: (asset: ParsedAssetInput) => Promise<{ assetId: string }>;
  onProgress?: (progress: number, stage: string) => Promise<void> | void;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
});

function parseXml(xml: string): OrderedNode[] {
  return xmlParser.parse(xml) as OrderedNode[];
}

function rootNode(tree: OrderedNode[], name: string): OrderedNode | null {
  return tree.find((node) => tagName(node) === name) ?? null;
}

function val(node: OrderedNode | null): string | null {
  return getAttribute(node, "val");
}

function normalizeTarget(target: string): string {
  const clean = target.replace(/\\/g, "/").replace(/^\/+/, "");
  if (clean.startsWith("word/")) return clean;
  if (clean.startsWith("media/") || clean.startsWith("embedding/")) return `word/${clean}`;
  if (clean.startsWith("../")) return clean.replace(/^\.\.\//, "");
  return `word/${clean}`;
}

function imageMimeType(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".emf")) return "image/emf";
  if (lower.endsWith(".wmf")) return "image/wmf";
  return null;
}

async function parseRelationships(zip: JSZip): Promise<Map<string, Relationship>> {
  const relationships = new Map<string, Relationship>();
  const file = zip.file("word/_rels/document.xml.rels");
  if (!file) return relationships;
  const tree = parseXml(await file.async("text"));
  const root = rootNode(tree, "Relationships");
  if (!root) return relationships;
  for (const node of childrenNamed(root, "Relationship")) {
    const id = getAttribute(node, "Id");
    const target = getAttribute(node, "Target");
    const type = getAttribute(node, "Type");
    if (!id || !target || !type) continue;
    relationships.set(id, {
      id,
      target,
      type,
      targetMode: getAttribute(node, "TargetMode"),
    });
  }
  return relationships;
}

async function parseStyles(zip: JSZip): Promise<Map<string, string>> {
  const styles = new Map<string, string>();
  const file = zip.file("word/styles.xml");
  if (!file) return styles;
  try {
    const tree = parseXml(await file.async("text"));
    const root = rootNode(tree, "styles");
    if (!root) return styles;
    for (const style of childrenNamed(root, "style")) {
      const id = getAttribute(style, "styleId");
      const name = val(firstChild(style, "name"));
      if (id && name) styles.set(id, name);
    }
  } catch {
    // Style metadata is optional; body content still parses.
  }
  return styles;
}

async function parseNumbering(
  zip: JSZip,
): Promise<Map<string, Map<number, NumberingLevel>>> {
  const numbering = new Map<string, Map<number, NumberingLevel>>();
  const file = zip.file("word/numbering.xml");
  if (!file) return numbering;
  try {
    const tree = parseXml(await file.async("text"));
    const root = rootNode(tree, "numbering");
    if (!root) return numbering;
    const abstract = new Map<string, Map<number, NumberingLevel>>();
    for (const node of childrenNamed(root, "abstractNum")) {
      const id = getAttribute(node, "abstractNumId");
      if (!id) continue;
      const levels = new Map<number, NumberingLevel>();
      for (const level of childrenNamed(node, "lvl")) {
        const levelIndex = Number(val(firstChild(level, "ilvl")) ?? "0");
        const format = val(firstChild(level, "numFmt")) ?? "decimal";
        const start = Number(val(firstChild(level, "start")) ?? "1");
        levels.set(Number.isFinite(levelIndex) ? levelIndex : 0, {
          format,
          start: Number.isFinite(start) ? start : 1,
        });
      }
      abstract.set(id, levels);
    }
    for (const node of childrenNamed(root, "num")) {
      const numId = getAttribute(node, "numId");
      const abstractId = val(firstChild(node, "abstractNumId"));
      if (!numId || !abstractId) continue;
      numbering.set(numId, abstract.get(abstractId) ?? new Map());
    }
  } catch {
    // Numbering is optional; paragraphs still parse as plain text.
  }
  return numbering;
}

function headingLevel(styleId: string | null, styles: Map<string, string>): number | null {
  if (!styleId) return null;
  const name = styles.get(styleId) ?? styleId;
  if (/^title$/i.test(name)) return 1;
  if (/^subtitle$/i.test(name)) return 2;
  const match = /heading\s*([1-9])/i.exec(name);
  if (match) return Number(match[1]);
  return null;
}

function runFormat(node: OrderedNode): {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  superscript: boolean;
  subscript: boolean;
} {
  const rPr = firstChild(node, "rPr");
  if (!rPr) {
    return { bold: false, italic: false, underline: false, superscript: false, subscript: false };
  }
  const flag = (tag: string) => {
    const child = firstChild(rPr, tag);
    if (!child) return false;
    const value = getAttribute(child, "val");
    return value !== "0" && value !== "false" && value !== "none";
  };
  const vertAlign = val(firstChild(rPr, "vertAlign"));
  return {
    bold: flag("b"),
    italic: flag("i"),
    underline: flag("u"),
    superscript: vertAlign === "superscript",
    subscript: vertAlign === "subscript",
  };
}

function mergeTextFormat(
  existing: InlineNode,
  incoming: InlineNode,
): boolean {
  if (existing.type !== "text" || incoming.type !== "text") return false;
  return (
    existing.bold === incoming.bold &&
    existing.italic === incoming.italic &&
    existing.underline === incoming.underline &&
    existing.superscript === incoming.superscript &&
    existing.subscript === incoming.subscript
  );
}

function pushInline(inlines: Array<InlineNode | { type: "pagebreak" }>, node: InlineNode) {
  if (node.type === "text" && !node.text) return;
  const last = inlines[inlines.length - 1];
  if (
    last &&
    last.type === "text" &&
    node.type === "text" &&
    mergeTextFormat(last, node)
  ) {
    last.text += node.text;
    return;
  }
  inlines.push(node);
}

function isWhitespaceOnly(inlines: Array<InlineNode | { type: "pagebreak" }>): boolean {
  return inlines.every(
    (inline) => inline.type === "pagebreak" || (inline.type === "text" && inline.text.trim() === ""),
  );
}

async function imageFromDrawing(
  drawing: OrderedNode,
  ctx: DocxContext,
): Promise<{ image: ImageInline | null; warnings: string[] }> {
  const blip = findBlip(drawing);
  if (!blip) return { image: null, warnings: ["Đối tượng hình ảnh không có tham chiếu media."] };
  const embedId = getAttribute(blip, "embed") ?? getAttribute(blip, "link");
  if (!embedId) return { image: null, warnings: ["Hình ảnh thiếu quan hệ media (r:embed)."] };
  const cached = ctx.imageCache.get(embedId);
  if (cached) return { image: cached, warnings: [] };
  const relationship = ctx.relations.get(embedId);
  if (!relationship || relationship.targetMode === "External") {
    return {
      image: null,
      warnings: ["Hình ảnh liên kết ngoài không được tải vì lý do bảo mật."],
    };
  }
  const target = normalizeTarget(relationship.target);
  const file = ctx.zip.file(target);
  if (!file) return { image: null, warnings: [`Không tìm thấy media ${target} trong gói DOCX.`] };
  const mimeType = imageMimeType(target);
  const filename = target.split("/").pop() ?? `image-${ctx.imageCache.size + 1}`;
  if (!mimeType) {
    ctx.diagnostics.push({
      code: "DOCX_IMAGE_UNSUPPORTED",
      severity: "warning",
      message: `Định dạng hình ảnh ${filename} chưa được hỗ trợ để xuất LaTeX. Hình ảnh được giữ lại trong gói gốc nhưng chưa đưa vào AST.`,
    });
    return { image: null, warnings: [`Định dạng ${filename} chưa hỗ trợ xuất LaTeX.`] };
  }
  if (mimeType === "image/svg+xml" || mimeType === "image/emf" || mimeType === "image/wmf" || mimeType === "image/gif" || mimeType === "image/bmp") {
    ctx.diagnostics.push({
      code: "DOCX_IMAGE_FORMAT",
      severity: "warning",
      message: `Hình ảnh ${filename} (${mimeType}) cần chuyển đổi sang PNG trước khi biên dịch LaTeX.`,
    });
    return { image: null, warnings: [`${filename} cần được chuyển sang PNG.`] };
  }
  const data = await file.async("uint8array");
  if (data.byteLength > getMaxUploadBytes()) {
    return { image: null, warnings: [`Hình ảnh ${filename} vượt quá giới hạn kích thước.`] };
  }
  const extent = findDescendant([drawing], "extent");
  const cx = Number(getAttribute(extent, "cx") ?? "0");
  const cy = Number(getAttribute(extent, "cy") ?? "0");
  const docPr = findDescendant([drawing], "docPr");
  const alt = getAttribute(docPr, "descr") ?? getAttribute(docPr, "name") ?? filename;
  const assetInput: ParsedAssetInput = {
    filename,
    mimeType,
    data,
    width: cx > 0 ? Math.round(cx / 9525) : undefined,
    height: cy > 0 ? Math.round(cy / 9525) : undefined,
  };
  const assetId = ctx.assetSink
    ? (await ctx.assetSink(assetInput)).assetId
    : newId();
  ctx.assets.push(assetInput);
  const image: ImageInline = {
    type: "image",
    assetId,
    filename,
    alt,
    mimeType,
    width: assetInput.width,
    height: assetInput.height,
  };
  ctx.imageCache.set(embedId, image);
  return { image, warnings: [] };
}

function findBlip(node: OrderedNode): OrderedNode | null {
  const tag = tagName(node);
  if (tag === "blip") return node;
  if (!tag) return null;
  for (const child of nodeChildren(node, tag)) {
    const found = findBlip(child);
    if (found) return found;
  }
  return null;
}

function findDescendant(nodes: OrderedNode[], target: string): OrderedNode | null {
  for (const node of nodes) {
    if (tagName(node) === target) return node;
    const tag = tagName(node);
    if (!tag) continue;
    const found = findDescendant(nodeChildren(node, tag), target);
    if (found) return found;
  }
  return null;
}

async function walkInlineNodes(
  nodes: OrderedNode[],
  ctx: DocxContext,
  format: ReturnType<typeof runFormat>,
  inlines: Array<InlineNode | { type: "pagebreak" }>,
  warnings: string[],
): Promise<{ hasMath: boolean; displayMath: string | null; displayWarnings: string[] }> {
  let hasMath = false;
  const displayWarnings: string[] = [];
  let displayMath: string | null = null;

  for (const node of nodes) {
    const tag = tagName(node);
    if (!tag) continue;
    if (tag === "r") {
      const runFormatValue = { ...format, ...runFormat(node) };
      for (const child of nodeChildren(node, "r")) {
        const childTag = tagName(child);
        if (!childTag) continue;
        if (childTag === "t") {
          pushInline(inlines, {
            type: "text",
            text: nodeText(child),
            ...runFormatValue,
          });
        } else if (childTag === "tab") {
          pushInline(inlines, { type: "text", text: " ", ...runFormatValue });
        } else if (childTag === "br") {
          if (getAttribute(child, "type") === "page") {
            inlines.push({ type: "pagebreak" });
          } else {
            pushInline(inlines, { type: "linebreak" } as InlineNode);
          }
        } else if (childTag === "lastRenderedPageBreak") {
          inlines.push({ type: "pagebreak" });
        } else if (childTag === "noBreakHyphen") {
          pushInline(inlines, { type: "text", text: "-", ...runFormatValue });
        } else if (childTag === "softHyphen") {
          // Soft hyphens are not rendered unless needed; keep the word intact.
        } else if (childTag === "sym") {
          const char = getAttribute(child, "char");
          if (char) {
            const code = Number.parseInt(char, 16);
            if (Number.isFinite(code)) {
              pushInline(inlines, {
                type: "text",
                text: String.fromCodePoint(code),
                ...runFormatValue,
              });
            }
          }
        } else if (childTag === "drawing") {
          const imageResult = await imageFromDrawing(child, ctx);
          if (imageResult.image) pushInline(inlines, imageResult.image);
          warnings.push(...imageResult.warnings);
        } else if (childTag === "pict" || childTag === "object") {
          warnings.push("Đối tượng VML/OLE chưa được hỗ trợ và không thể chuyển thành LaTeX.");
          ctx.diagnostics.push({
            code: "DOCX_OBJECT_UNSUPPORTED",
            severity: "warning",
            message: "Tài liệu chứa đối tượng VML/OLE; nội dung này chưa được chuyển đổi.",
          });
        } else if (childTag === "delText" || childTag === "instrText") {
          // Tracked deletions and field instructions are not visible content.
        }
      }
    } else if (tag === "oMath" || tag === "oMathPara") {
      const result = ommlNodesToLatex([node]);
      if (result.latex) {
        hasMath = true;
        const math: MathInline = {
          type: "math",
          latex: result.latex,
          confidence: result.warnings.length > 0 ? 0.72 : 0.96,
          provenance: { providerId: "docx-omml", originalText: nodeText(node) },
        };
        if (tag === "oMathPara") {
          displayMath = result.latex;
          displayWarnings.push(...result.warnings);
        } else {
          pushInline(inlines, math);
        }
        warnings.push(...result.warnings);
        if (result.unsupportedTags.length > 0) {
          ctx.diagnostics.push({
            code: "OMML_PARTIAL",
            severity: "warning",
            message: `Công thức Word chứa cấu trúc OMML chưa hỗ trợ đầy đủ: ${result.unsupportedTags.join(", ")}. Nội dung đã được giữ ở mức tốt nhất.`,
          });
        }
      } else {
        warnings.push("Không trích xuất được LaTeX từ công thức OMML.");
      }
    } else if (tag === "hyperlink" || tag === "smartTag" || tag === "ins" || tag === "sdt") {
      const container = tag === "sdt" ? firstChild(node, "sdtContent") : node;
      const childTag = container ? tagName(container) : null;
      if (container && childTag) {
        const nested = await walkInlineNodes(
          nodeChildren(container, childTag),
          ctx,
          format,
          inlines,
          warnings,
        );
        hasMath = hasMath || nested.hasMath;
        if (nested.displayMath) {
          displayMath = nested.displayMath;
          displayWarnings.push(...nested.displayWarnings);
        }
      }
    } else if (tag === "del") {
      warnings.push("Đã bỏ qua nội dung đã bị xóa theo dõi (tracked deletion).");
    } else if (tag === "fldSimple" || tag === "bookmarkStart" || tag === "bookmarkEnd") {
      if (tag === "fldSimple") {
        const nested = await walkInlineNodes(
          nodeChildren(node, "fldSimple"),
          ctx,
          format,
          inlines,
          warnings,
        );
        hasMath = hasMath || nested.hasMath;
      }
    } else if (tag === "pPr" || tag === "rPr") {
      // handled by the caller
    } else if (tag === "commentReference" || tag === "footnoteReference" || tag === "endnoteReference") {
      warnings.push(`Chú thích/Footnote (${tag}) chưa được chuyển thành LaTeX.`);
    }
  }
  return { hasMath, displayMath, displayWarnings };
}

async function parseParagraph(
  node: OrderedNode,
  ctx: DocxContext,
  index: number,
): Promise<ParsedParagraph> {
  const pPr = firstChild(node, "pPr");
  const styleId = pPr ? val(firstChild(pPr, "pStyle")) : null;
  const alignValue = pPr ? val(firstChild(pPr, "jc")) : null;
  const align =
    alignValue === "center"
      ? "center"
      : alignValue === "right" || alignValue === "end"
        ? "right"
        : alignValue === "both"
          ? "justify"
          : alignValue === "left" || alignValue === "start"
            ? "left"
            : undefined;

  let numId: string | null = null;
  let ilvl = 0;
  if (pPr) {
    const numPr = firstChild(pPr, "numPr");
    if (numPr) {
      numId = val(firstChild(numPr, "numId"));
      const level = val(firstChild(numPr, "ilvl"));
      ilvl = level ? Number(level) : 0;
      if (!Number.isFinite(ilvl)) ilvl = 0;
    }
  }

  const inlines: Array<InlineNode | { type: "pagebreak" }> = [];
  const warnings: string[] = [];
  const children = nodeChildren(node, "p").filter((child) => tagName(child) !== "pPr");
  const result = await walkInlineNodes(
    children,
    ctx,
    { bold: false, italic: false, underline: false, superscript: false, subscript: false },
    inlines,
    warnings,
  );

  return {
    styleId,
    headingLevel: headingLevel(styleId, ctx.styles),
    numId,
    ilvl,
    align,
    inlines,
    displayMath:
      result.displayMath && isWhitespaceOnly(inlines)
        ? { latex: result.displayMath, warnings: result.displayWarnings }
        : null,
    warnings,
    sourcePath: `word/document.xml:body[${index}]`,
  };
}

function makeBlock(
  type: DocumentBlock["type"],
  content: BlockContent,
  pageNumber: number,
  sourcePath: string,
  options: {
    status?: DocumentBlock["status"];
    confidence?: number;
    warnings?: string[];
  } = {},
): DocumentBlock {
  const confidence = options.confidence;
  return {
    id: newId(),
    type,
    content,
    originalContent: structuredClone(content),
    order: 0,
    pageNumber,
    source: { documentId: "", pageNumber, sourceElementPath: sourcePath },
    status: options.status ?? "extracted",
    confidence,
    confidenceBand: getConfidenceBand(confidence),
    warnings: options.warnings ?? [],
  } as DocumentBlock;
}

async function parseTable(
  node: OrderedNode,
  ctx: DocxContext,
  pageNumber: number,
  sourcePath: string,
): Promise<DocumentBlock> {
  const rows: TableCell[][] = [];
  let hasHeaderRow = false;
  let mergedWarning = false;
  for (const row of childrenNamed(node, "tr")) {
    const trPr = firstChild(row, "trPr");
    if (trPr && firstChild(trPr, "tblHeader")) hasHeaderRow = true;
    const cells: TableCell[] = [];
    for (const cell of childrenNamed(row, "tc")) {
      const tcPr = firstChild(cell, "tcPr");
      const gridSpan = Number(val(firstChild(tcPr ?? cell, "gridSpan")) ?? "1");
      if (firstChild(tcPr ?? cell, "vMerge")) mergedWarning = true;
      const inlines: InlineNode[] = [];
      for (const paragraph of childrenNamed(cell, "p")) {
        const parsed = await parseParagraph(paragraph, ctx, ctx.counter);
        for (const inline of parsed.inlines) {
          if (inline.type === "pagebreak") continue;
          inlines.push(inline);
        }
        if (parsed.displayMath) {
          const math: MathInline = {
            type: "math",
            latex: parsed.displayMath.latex,
            confidence: 0.9,
          };
          inlines.push(math);
        }
        if (inlines.length > 0) inlines.push({ type: "linebreak" });
      }
      while (inlines.length > 0 && inlines[inlines.length - 1].type === "linebreak") inlines.pop();
      cells.push({
        inlines,
        header: hasHeaderRow,
        colspan: Number.isFinite(gridSpan) && gridSpan > 1 ? gridSpan : undefined,
      });
    }
    if (cells.length > 0) rows.push(cells);
  }
  const content: BlockContent = {
    kind: "table",
    rows,
    hasHeaderRow,
    caption: nodeText(node).trim().slice(0, 80) || undefined,
  };
  const warnings: string[] = [];
  if (mergedWarning) {
    warnings.push("Bảng có ô gộp dọc; cấu trúc ô có thể cần chỉnh trong LaTeX.");
    ctx.diagnostics.push({
      code: "DOCX_TABLE_MERGE",
      severity: "warning",
      message: "Bảng Word chứa ô gộp dọc (vMerge). LaTeX chỉ giữ nội dung, không dựng lại chính xác ô gộp.",
    });
  }
  if (rows.length === 0) warnings.push("Bảng không có dữ liệu.");
  return makeBlock("table", content, pageNumber, sourcePath, {
    status: warnings.length > 0 ? "needs_review" : "extracted",
    confidence: warnings.length > 0 ? 0.7 : 0.92,
    warnings,
  });
}

function extractHeaderFooterInlines(node: OrderedNode): InlineNode[] {
  const inlines: InlineNode[] = [];
  const paragraphs = childrenNamed(node, "p");
  for (const paragraph of paragraphs) {
    const children = nodeChildren(paragraph, "p").filter((child) => tagName(child) !== "pPr");
    for (const child of children) {
      const tag = tagName(child);
      if (tag === "r") {
        for (const runChild of nodeChildren(child, "r")) {
          const runTag = tagName(runChild);
          if (runTag === "t") inlines.push({ type: "text", text: nodeText(runChild) });
          if (runTag === "tab") inlines.push({ type: "text", text: " " });
        }
      } else if (tag === "hyperlink") {
        for (const run of childrenNamed(child, "r")) {
          for (const runChild of nodeChildren(run, "r")) {
            if (tagName(runChild) === "t") inlines.push({ type: "text", text: nodeText(runChild) });
          }
        }
      }
    }
    inlines.push({ type: "linebreak" });
  }
  while (inlines.length > 0 && inlines[inlines.length - 1].type === "linebreak") inlines.pop();
  return inlines;
}

async function parseHeaderFooterFile(
  ctx: DocxContext,
  filename: string,
  kind: "header" | "footer",
): Promise<DocumentBlock | null> {
  const file = ctx.zip.file(filename);
  if (!file) return null;
  try {
    const tree = parseXml(await file.async("text"));
    const rootTag = kind === "header" ? "hdr" : "ftr";
    const root = rootNode(tree, rootTag);
    if (!root) return null;
    const inlines = extractHeaderFooterInlines(root);
    if (inlines.length === 0) return null;
    const content: BlockContent = { kind, inlines };
    return makeBlock(kind, content, 1, filename, {
      status: "extracted",
      confidence: 0.95,
    });
  } catch {
    return null;
  }
}

function flattenSdt(nodes: OrderedNode[], diagnostics: DocumentDiagnostic[]): OrderedNode[] {
  const output: OrderedNode[] = [];
  for (const node of nodes) {
    const tag = tagName(node);
    if (!tag) continue;
    if (tag === "sdt") {
      const content = firstChild(node, "sdtContent");
      const contentTag = content ? tagName(content) : null;
      if (content && contentTag) {
        output.push(...flattenSdt(nodeChildren(content, contentTag), diagnostics));
      }
    } else if (tag === "AlternateContent") {
      const firstChoice = firstChild(node, "Choice") ?? firstChild(node, "Fallback");
      const choiceTag = firstChoice ? tagName(firstChoice) : null;
      if (firstChoice && choiceTag) {
        output.push(...flattenSdt(nodeChildren(firstChoice, choiceTag), diagnostics));
      }
      diagnostics.push({
        code: "DOCX_ALTERNATE_CONTENT",
        severity: "info",
        message: "Đã chọn một biến thể nội dung AlternateContent của Word.",
      });
    } else {
      output.push(node);
    }
  }
  return output;
}

async function parseCoreProperties(zip: JSZip): Promise<Record<string, unknown>> {
  const file = zip.file("docProps/core.xml");
  if (!file) return {};
  try {
    const tree = parseXml(await file.async("text"));
    const root = rootNode(tree, "coreProperties");
    if (!root) return {};
    return {
      docxTitle: nodeText(firstChild(root, "title") ?? root).trim() || undefined,
      docxCreator: nodeText(firstChild(root, "creator") ?? root).trim() || undefined,
      docxSubject: nodeText(firstChild(root, "subject") ?? root).trim() || undefined,
    };
  } catch {
    return {};
  }
}

export async function parseDocx(
  buffer: Uint8Array,
  options: DocxParseOptions,
): Promise<ParseResult> {
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) {
    throw new Error("Gói DOCX thiếu word/document.xml.");
  }
  options.onProgress?.(8, "Đang đọc gói OOXML");
  const [relationships, styles, numbering, coreProperties] = await Promise.all([
    parseRelationships(zip),
    parseStyles(zip),
    parseNumbering(zip),
    parseCoreProperties(zip),
  ]);

  const tree = parseXml(await documentFile.async("text"));
  const documentRoot = rootNode(tree, "document");
  const body = documentRoot ? firstChild(documentRoot, "body") : null;
  if (!body) {
    const fallback = await mammothRawTextFallback(buffer);
    const ast = fallbackAst(options, fallback);
    return { ast, assets: [] };
  }

  const ctx: DocxContext = {
    zip,
    documentId: options.documentId,
    data: tree[0],
    relations: relationships,
    styles,
    numbering,
    settings: options.settings,
    assetSink: options.assetSink,
    assets: [],
    imageCache: new Map(),
    diagnostics: [
      {
        code: "DOCX_PAGE_COUNT_ESTIMATE",
        severity: "info",
        message:
          "Số trang của DOCX được xác định từ ngắt trang và có thể khác bố cục in thực tế. Hãy kiểm tra bản xem trước.",
      },
    ],
    blockWarnings: [],
    counter: 0,
  };

  const blocks: DocumentBlock[] = [];
  const bodyChildren = flattenSdt(nodeChildren(body, "body"), ctx.diagnostics);
  let pageNumber = 1;
  let pendingList: {
    numId: string;
    ordered: boolean;
    items: { id: string; inlines: InlineNode[] }[];
    pageNumber: number;
    warnings: string[];
  } | null = null;

  const addBlock = (block: DocumentBlock) => {
    if (blocks.length >= MAX_BLOCKS) return;
    block.pageNumber = pageNumber;
    block.source.pageNumber = pageNumber;
    blocks.push(block);
  };

  const flushList = () => {
    if (!pendingList) return;
    if (pendingList.items.length > 0) {
      const content: BlockContent = {
        kind: "list",
        ordered: pendingList.ordered,
        items: pendingList.items,
        sourceNumberingId: pendingList.numId,
      };
      blocks.push(
        makeBlock("list", content, pendingList.pageNumber, "word/document.xml:numbering", {
          status: "extracted",
          confidence: 0.95,
          warnings: pendingList.warnings,
        }),
      );
    }
    pendingList = null;
  };

  for (const node of bodyChildren) {
    if (blocks.length >= MAX_BLOCKS) {
      ctx.diagnostics.push({
        code: "DOCX_BLOCK_LIMIT",
        severity: "error",
        message: `Tài liệu vượt quá giới hạn ${MAX_BLOCKS} block. Chỉ phần đầu được xử lý.`,
      });
      break;
    }
    const tag = tagName(node);
    ctx.counter += 1;
    if (tag === "sectPr") continue;
    if (tag === "tbl") {
      flushList();
      addBlock(
        await parseTable(
          node,
          ctx,
          pageNumber,
          `word/document.xml:body[${ctx.counter}]`,
        ),
      );
      continue;
    }
    if (tag === "bookmarkStart" || tag === "bookmarkEnd" || tag === "proofErr") continue;
    if (tag !== "p") {
      if (tag === "customXml" || tag === "altChunk") {
        ctx.diagnostics.push({
          code: "DOCX_BODY_UNSUPPORTED",
          severity: "warning",
          message: `Cấu trúc ${tag} trong DOCX chưa được hỗ trợ và có thể chứa nội dung chưa chuyển đổi.`,
        });
      }
      continue;
    }

    const parsed = await parseParagraph(node, ctx, ctx.counter);
    const pPr = firstChild(node, "pPr");
    const beforeBreak = Boolean(pPr && firstChild(pPr, "pageBreakBefore"));
    if (beforeBreak && blocks.length > 0) {
      flushList();
      addBlock(makeBlock("page_break", { kind: "page_break" }, pageNumber, parsed.sourcePath, { confidence: 1 }));
      pageNumber += 1;
    }

    if (parsed.displayMath && isWhitespaceOnly(parsed.inlines)) {
      flushList();
      const warnings = [...parsed.displayMath.warnings, ...parsed.warnings];
      const content: BlockContent = {
        kind: "display_math",
        latex: parsed.displayMath.latex,
        originalText: nodeText(node).trim(),
        provenance: { providerId: "docx-omml", recognizedAt: new Date().toISOString() },
      };
      addBlock(
        makeBlock("display_math", content, pageNumber, parsed.sourcePath, {
          status: warnings.length > 0 ? "needs_review" : "recognized",
          confidence: warnings.length > 0 ? 0.78 : 0.96,
          warnings,
        }),
      );
      continue;
    }

    if (parsed.headingLevel !== null) flushList();

    const segments: Array<Array<InlineNode | { type: "pagebreak" }>> = [[]];
    for (const inline of parsed.inlines) {
      if (inline.type === "pagebreak") segments.push([]);
      else segments[segments.length - 1].push(inline);
    }

    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
      const segment = segments[segmentIndex];
      if (segmentIndex > 0) {
        flushList();
        addBlock(makeBlock("page_break", { kind: "page_break" }, pageNumber, parsed.sourcePath, { confidence: 1 }));
        pageNumber += 1;
      }
      if (segment.length === 0 || isWhitespaceOnly(segment)) continue;

      const warnings = [...parsed.warnings];
      const onlyImages = segment.every((inline) => inline.type === "image");
      if (onlyImages) {
        flushList();
        for (const inline of segment) {
          if (inline.type !== "image") continue;
          const content: BlockContent = {
            kind: "image",
            assetId: inline.assetId,
            filename: inline.filename,
            alt: inline.alt,
            mimeType: inline.mimeType,
            width: inline.width,
            height: inline.height,
            placement: "block",
          };
          addBlock(
            makeBlock("image", content, pageNumber, parsed.sourcePath, {
              status: "recognized",
              confidence: 0.9,
              warnings,
            }),
          );
        }
        continue;
      }

      if (parsed.numId && parsed.headingLevel === null) {
        const numbering = ctx.numbering.get(parsed.numId);
        const level = numbering?.get(parsed.ilvl);
        const ordered = level ? level.format !== "bullet" : true;
        const listWarnings: string[] = [];
        if (!level) listWarnings.push("Không đọc được định nghĩa numbering; danh sách được coi là có thứ tự.");
        if (parsed.ilvl > 0) listWarnings.push("Danh sách nhiều cấp được làm phẳng trong block này.");
        if (!pendingList || pendingList.numId !== parsed.numId) {
          flushList();
          pendingList = {
            numId: parsed.numId,
            ordered,
            items: [],
            pageNumber,
            warnings: listWarnings,
          };
        }
        pendingList.items.push({ id: newId(), inlines: segment as InlineNode[] });
        continue;
      }

      flushList();
      if (parsed.headingLevel !== null) {
        const content: BlockContent = {
          kind: "heading",
          level: parsed.headingLevel,
          inlines: segment as InlineNode[],
        };
        addBlock(
          makeBlock("heading", content, pageNumber, parsed.sourcePath, {
            status: "extracted",
            confidence: 0.98,
            warnings,
          }),
        );
      } else {
        const content: BlockContent = {
          kind: "paragraph",
          inlines: segment as InlineNode[],
          align: parsed.align,
          sourceStyle: parsed.styleId ?? undefined,
        };
        addBlock(
          makeBlock("paragraph", content, pageNumber, parsed.sourcePath, {
            status: "extracted",
            confidence: 0.98,
            warnings,
          }),
        );
      }
    }
  }
  flushList();

  // Headers and footers
  const headerBlocks: DocumentBlock[] = [];
  const footerBlocks: DocumentBlock[] = [];
  for (const relationship of relationships.values()) {
    if (relationship.targetMode === "External") continue;
    const isHeader = relationship.type.endsWith("/header");
    const isFooter = relationship.type.endsWith("/footer");
    if (!isHeader && !isFooter) continue;
    const target = normalizeTarget(relationship.target);
    const block = await parseHeaderFooterFile(ctx, target, isHeader ? "header" : "footer");
    if (!block) continue;
    if (isHeader) headerBlocks.push(block);
    else footerBlocks.push(block);
  }
  if (headerBlocks.length > 1) {
    ctx.diagnostics.push({
      code: "DOCX_MULTIPLE_HEADERS",
      severity: "info",
      message: "Tài liệu có nhiều header; chỉ header đầu tiên được dùng trong LaTeX mặc định.",
    });
  }
  const prefixedBlocks = [...headerBlocks.slice(0, 1), ...blocks, ...footerBlocks.slice(0, 1)];
  prefixedBlocks.forEach((block, index) => {
    block.order = index;
    block.source = {
      ...block.source,
      documentId: options.documentId,
      pageNumber: block.pageNumber || 1,
    };
  });

  const maxPage = Math.max(
    1,
    ...prefixedBlocks.map((block) => block.pageNumber),
  );
  if (maxPage > getMaxPages()) {
    ctx.diagnostics.push({
      code: "DOCX_PAGE_LIMIT",
      severity: "warning",
      message: `Tài liệu có ${maxPage} trang ước tính, vượt giới hạn ${getMaxPages()} trang của cấu hình hiện tại.`,
    });
  }
  const pages: DocumentPage[] = [];
  for (let index = 1; index <= Math.min(maxPage, getMaxPages()); index += 1) {
    const pageBlocks = prefixedBlocks.filter((block) => block.pageNumber === index);
    pages.push({
      id: newId(),
      documentId: options.documentId,
      pageNumber: index,
      rotation: 0,
      textLayerStatus: "available",
      blocks: pageBlocks.map((block) => ({
        ...block,
        source: { ...block.source, pageNumber: index },
      })),
      metadata: { source: "docx", estimated: true },
    });
  }

  if (prefixedBlocks.length === 0) {
    ctx.diagnostics.push({
      code: "DOCX_EMPTY",
      severity: "warning",
      message: "Không tìm thấy nội dung văn bản hoặc công thức trong DOCX.",
    });
  }

  options.onProgress?.(70, "Đã trích xuất cấu trúc DOCX");
  const mathBlockCount = prefixedBlocks.filter((block) => block.type === "display_math").length;
  const ast: DocumentAst = {
    schemaVersion: AST_SCHEMA_VERSION,
    documentId: options.documentId,
    title: String(coreProperties.docxTitle ?? options.filename),
    language: options.settings.language,
    sourceType: "docx",
    pages,
    diagnostics: ctx.diagnostics,
    metadata: {
      pageCount: pages.length,
      textLayerPages: pages.length,
      scannedPages: 0,
      blockCount: prefixedBlocks.length,
      mathBlockCount,
      parser: "mathglass-docx-omml",
      parsedAt: new Date().toISOString(),
      sourceMetadata: coreProperties,
    },
  };
  return { ast, assets: ctx.assets };
}

function fallbackAst(options: DocxParseOptions, text: string): DocumentAst {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const blocks: DocumentBlock[] = lines.map((line, index) => {
    const content: BlockContent = {
      kind: "paragraph",
      inlines: [{ type: "text", text: line }],
    };
    return {
      ...makeBlock("paragraph", content, 1, `fallback:line[${index}]`, {
        status: "needs_review",
        confidence: 0.4,
        warnings: ["Trích xuất bằng Mammoth fallback; định dạng và công thức có thể bị mất."],
      }),
    } as DocumentBlock;
  });
  const page: DocumentPage = {
    id: newId(),
    documentId: options.documentId,
    pageNumber: 1,
    rotation: 0,
    textLayerStatus: "partial",
    blocks,
    metadata: { source: "docx-fallback" },
  };
  return {
    schemaVersion: AST_SCHEMA_VERSION,
    documentId: options.documentId,
    title: options.filename,
    language: options.settings.language,
    sourceType: "docx" satisfies SourceType,
    pages: [page],
    diagnostics: [
      {
        code: "DOCX_FALLBACK",
        severity: "warning",
        message:
          "Không thể phân tích đầy đủ OOXML. Văn bản được trích xuất bằng Mammoth; công thức và bảng cần kiểm tra lại.",
      },
    ],
    metadata: {
      pageCount: 1,
      textLayerPages: 0,
      scannedPages: 0,
      blockCount: blocks.length,
      mathBlockCount: 0,
      parser: "mammoth-fallback",
      parsedAt: new Date().toISOString(),
    },
  };
}

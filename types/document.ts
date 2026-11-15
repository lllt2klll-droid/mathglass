/**
 * Shared, versioned document contracts.
 *
 * These types are the single source of truth for the intermediate document
 * representation (Document AST). Parsers produce them, the LaTeX generator
 * consumes them, and the review UI edits them.
 */

export const AST_SCHEMA_VERSION = "1.0.0" as const;

export type SourceType = "pdf" | "docx" | "image";

export type BlockType =
  | "heading"
  | "paragraph"
  | "display_math"
  | "table"
  | "image"
  | "geometry"
  | "list"
  | "page_break"
  | "header"
  | "footer"
  | "unknown";

export type RecognitionStatus =
  | "extracted"
  | "recognized"
  | "needs_review"
  | "accepted"
  | "rejected"
  | "ignored"
  | "unsupported";

export type ConfidenceBand = "high" | "medium" | "low" | "unknown";

export interface BoundingBox {
  /** Normalized 0..1 values relative to the source page. */
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: "page_normalized";
}

export interface SourceReference {
  documentId: string;
  pageNumber: number;
  boundingBox?: BoundingBox;
  sourceElementPath?: string;
}

export interface MathProvenance {
  providerId?: string;
  model?: string;
  recognizedAt?: string;
  originalText?: string;
}

export interface MathInline {
  type: "math";
  latex: string;
  confidence?: number;
  provenance?: MathProvenance;
}

export interface TextInline {
  type: "text";
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  code?: boolean;
}

export interface BreakInline {
  type: "linebreak";
}

export interface ImageInline {
  type: "image";
  assetId: string;
  filename: string;
  alt: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export type InlineNode = TextInline | MathInline | BreakInline | ImageInline;

export interface HeadingContent {
  kind: "heading";
  level: number;
  inlines: InlineNode[];
}

export interface ParagraphContent {
  kind: "paragraph";
  inlines: InlineNode[];
  align?: "left" | "center" | "right" | "justify";
  sourceStyle?: string;
}

export interface DisplayMathContent {
  kind: "display_math";
  latex: string;
  originalText?: string;
  provenance?: MathProvenance;
}

export interface ListItem {
  id: string;
  inlines: InlineNode[];
}

export interface ListContent {
  kind: "list";
  ordered: boolean;
  items: ListItem[];
  start?: number;
  sourceNumberingId?: string;
}

export interface TableCell {
  inlines: InlineNode[];
  header?: boolean;
  colspan?: number;
  rowspan?: number;
}

export interface TableContent {
  kind: "table";
  rows: TableCell[][];
  hasHeaderRow: boolean;
  caption?: string;
}

export interface ImageContent {
  kind: "image";
  assetId: string;
  filename: string;
  alt: string;
  mimeType: string;
  width?: number;
  height?: number;
  placement?: "block" | "inline";
}

export interface PageBreakContent {
  kind: "page_break";
}

export interface HeaderFooterContent {
  kind: "header" | "footer";
  inlines: InlineNode[];
}

export interface UnknownContent {
  kind: "unknown";
  reason: string;
  rawText?: string;
  rawXml?: string;
}

export interface GeometryContent {
  kind: "geometry";
  description: string;
  assetId?: string;
  rawText?: string;
}

export type BlockContent =
  | HeadingContent
  | ParagraphContent
  | DisplayMathContent
  | ListContent
  | TableContent
  | ImageContent
  | PageBreakContent
  | HeaderFooterContent
  | UnknownContent
  | GeometryContent;

interface BlockBase {
  id: string;
  order: number;
  pageNumber: number;
  source: SourceReference;
  status: RecognitionStatus;
  confidence?: number;
  confidenceBand: ConfidenceBand;
  warnings: string[];
  /** Immutable snapshot of the parser output, retained separately from edits. */
  originalContent: BlockContent;
  reviewedAt?: string;
}

export type DocumentBlock =
  | (BlockBase & { type: "heading"; content: HeadingContent })
  | (BlockBase & { type: "paragraph"; content: ParagraphContent })
  | (BlockBase & { type: "display_math"; content: DisplayMathContent })
  | (BlockBase & { type: "list"; content: ListContent })
  | (BlockBase & { type: "table"; content: TableContent })
  | (BlockBase & { type: "image"; content: ImageContent })
  | (BlockBase & { type: "geometry"; content: GeometryContent })
  | (BlockBase & { type: "page_break"; content: PageBreakContent })
  | (BlockBase & { type: "header"; content: HeaderFooterContent })
  | (BlockBase & { type: "footer"; content: HeaderFooterContent })
  | (BlockBase & { type: "unknown"; content: UnknownContent });

export type TextLayerStatus = "available" | "unavailable" | "partial" | "failed";

export interface DocumentPage {
  id: string;
  documentId: string;
  pageNumber: number;
  width?: number;
  height?: number;
  rotation: number;
  textLayerStatus: TextLayerStatus;
  blocks: DocumentBlock[];
  metadata: Record<string, unknown>;
}

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface DocumentDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  pageNumber?: number;
  blockId?: string;
  source?: string;
}

export interface DocumentAst {
  schemaVersion: typeof AST_SCHEMA_VERSION;
  documentId: string;
  title: string;
  language: string;
  sourceType: SourceType;
  pages: DocumentPage[];
  diagnostics: DocumentDiagnostic[];
  metadata: {
    pageCount: number;
    textLayerPages: number;
    scannedPages: number;
    blockCount: number;
    mathBlockCount: number;
    parser: string;
    parsedAt: string;
    sourceMetadata?: Record<string, unknown>;
  };
}

export interface DocumentSummary {
  id: string;
  projectId: string;
  originalFilename: string;
  mimeType: string;
  detectedType: SourceType | "unknown";
  fileSizeBytes: number;
  pageCount: number | null;
  status: "uploaded" | "inspecting" | "parsed" | "failed";
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ParsedAssetInput {
  filename: string;
  mimeType: string;
  data: Uint8Array;
  width?: number;
  height?: number;
}

export type AssetSink = (asset: ParsedAssetInput) => Promise<{ assetId: string }>;

export interface ParseResult {
  ast: DocumentAst;
  assets: ParsedAssetInput[];
}

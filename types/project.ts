import type { DocumentSummary } from "./document";

export type ProjectStatus =
  | "draft"
  | "processing"
  | "needs_review"
  | "ready"
  | "failed"
  | "archived";

export type ConversionMode =
  | "preserve_layout"
  | "math_accuracy"
  | "exam"
  | "worksheet"
  | "formulas_only";

export type GradeLevel =
  | "primary"
  | "lower_secondary"
  | "upper_secondary"
  | "university"
  | "other";

export type DocumentLanguage = "vi" | "en" | "auto";
export type PageSelectionMode = "all" | "selected" | "range";

export type TemplateId =
  | "math-basic"
  | "primary-exam"
  | "lower-secondary-exam"
  | "upper-secondary-exam"
  | "worksheet"
  | "multiple-choice"
  | "essay"
  | "revision";

export interface PageSelection {
  mode: PageSelectionMode;
  pages: number[];
  rangeStart: number | null;
  rangeEnd: number | null;
}

export interface ConversionOptions {
  recognizeImages: boolean;
  recognizeTables: boolean;
  recognizeFormulas: boolean;
  keepQuestionNumbering: boolean;
  keepStructure: boolean;
}

export interface ConversionSettings {
  mode: ConversionMode;
  grade: GradeLevel;
  language: DocumentLanguage;
  pageSelection: PageSelection;
  options: ConversionOptions;
  templateId: TemplateId;
}

export const DEFAULT_CONVERSION_SETTINGS: ConversionSettings = {
  mode: "math_accuracy",
  grade: "upper_secondary",
  language: "auto",
  pageSelection: { mode: "all", pages: [], rangeStart: null, rangeEnd: null },
  options: {
    recognizeImages: true,
    recognizeTables: true,
    recognizeFormulas: true,
    keepQuestionNumbering: true,
    keepStructure: true,
  },
  templateId: "math-basic",
};

export interface ProjectRecord {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  settings: ConversionSettings;
  sourceType: "pdf" | "docx" | "image" | "unknown";
  sourceFilename: string;
  documentId: string | null;
  pageCount: number | null;
  blockCount: number;
  mathBlockCount: number;
  needsReviewCount: number;
  latexSource: string;
  latexLineMap: Record<string, [number, number]>;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface ProjectStats {
  totalDocuments: number;
  converted: number;
  processing: number;
  needsReview: number;
  drafts: number;
  failed: number;
  totalBlocks: number;
  storageBytes: number;
}

export interface ProjectListItem {
  id: string;
  name: string;
  status: ProjectStatus;
  sourceType: ProjectRecord["sourceType"];
  sourceFilename: string;
  pageCount: number | null;
  blockCount: number;
  needsReviewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail extends ProjectRecord {
  document: DocumentSummary | null;
}

export type JobType = "parse" | "recognize" | "generate" | "compile" | "export";
export type JobStatus =
  | "queued"
  | "validating"
  | "parsing"
  | "recognizing"
  | "generating"
  | "validating_output"
  | "needs_review"
  | "completed"
  | "failed"
  | "cancelled";

export interface ConversionJob {
  id: string;
  projectId: string;
  documentId: string;
  ownerId: string;
  jobType: JobType;
  status: JobStatus;
  progressPercent: number;
  stage: string;
  attemptCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LatexVersionSummary {
  id: string;
  projectId: string;
  versionNumber: number;
  sourceHash: string;
  changeSummary: string;
  createdAt: string;
  sourceSize: number;
  isCurrent: boolean;
}

export interface LatexVersionDetail extends LatexVersionSummary {
  source: string;
}

export type ExportFormat = "tex" | "zip" | "pdf";

export interface ExportResult {
  projectId: string;
  format: ExportFormat;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AssemblyAsset {
  id: string;
  projectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface ReviewReport {
  totalPages: number;
  totalBlocks: number;
  mathBlocks: number;
  warnings: number;
  needsReview: number;
  accepted: number;
  rejected: number;
  unsupported: number;
  scannedPages: number;
  unsupportedConstructs: number;
  byStatus: Record<string, number>;
  measuredAt: string;
}

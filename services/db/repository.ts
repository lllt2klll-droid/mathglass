import { createHash } from "node:crypto";
import {
  DEFAULT_CONVERSION_SETTINGS,
  type AssemblyAsset,
  type ConversionJob,
  type ConversionSettings,
  type LatexVersionDetail,
  type LatexVersionSummary,
  type ProjectDetail,
  type ProjectListItem,
  type ProjectRecord,
  type ProjectStats,
  type ProjectStatus,
  type ReviewReport,
} from "@/types/project";
import {
  AST_SCHEMA_VERSION,
  type BlockContent,
  type DocumentAst,
  type DocumentBlock,
  type DocumentDiagnostic,
  type DocumentPage,
  type DocumentSummary,
  type SourceType,
} from "@/types/document";
import { AppError } from "@/types/api";
import { newId } from "@/lib/ids";
import { getConfidenceBand } from "@/config/site";
import { mutateDb, readDb } from "./local-store";
import type {
  DbFile,
  StoredAsset,
  StoredBlock,
  StoredDocument,
  StoredJob,
  StoredPage,
  StoredProvider,
  StoredVersion,
} from "./types";
import {
  originalFileKey,
  readStoredFile,
  saveAssetFile,
  saveStoredFile,
  deleteProjectFiles,
  ownerStorageUsage,
} from "@/services/storage/local-files";
import { stripExtension } from "@/lib/utils";

const MAX_PROJECT_NAME = 160;

function hashSource(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function now(): string {
  return new Date().toISOString();
}

function projectOrThrow(data: DbFile, ownerId: string, projectId: string): ProjectRecord {
  const project = data.projects.find((item) => item.id === projectId && item.ownerId === ownerId);
  if (!project) {
    throw new AppError("PROJECT_NOT_FOUND", "Không tìm thấy dự án hoặc bạn không có quyền truy cập.", 404);
  }
  return project;
}

function documentOrThrow(
  data: DbFile,
  ownerId: string,
  documentId: string,
): StoredDocument {
  const document = data.documents.find(
    (item) => item.id === documentId && item.ownerId === ownerId,
  );
  if (!document) {
    throw new AppError("DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu gốc.", 404);
  }
  return document;
}

function documentForProject(
  data: DbFile,
  ownerId: string,
  projectId: string,
): StoredDocument | null {
  const project = projectOrThrow(data, ownerId, projectId);
  if (!project.documentId) return null;
  return data.documents.find(
    (item) => item.id === project.documentId && item.ownerId === ownerId && item.projectId === projectId,
  ) ?? null;
}

export function documentSummary(document: StoredDocument): DocumentSummary {
  return {
    id: document.id,
    projectId: document.projectId,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    detectedType: document.detectedType,
    fileSizeBytes: document.fileSizeBytes,
    pageCount: document.pageCount,
    status: document.status,
    metadata: document.metadata,
    createdAt: document.createdAt,
  };
}

function projectListItem(project: ProjectRecord): ProjectListItem {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    sourceType: project.sourceType,
    sourceFilename: project.sourceFilename,
    pageCount: project.pageCount,
    blockCount: project.blockCount,
    needsReviewCount: project.needsReviewCount,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function countMath(blocks: StoredBlock[]): number {
  let count = 0;
  for (const block of blocks) {
    if (block.content.kind === "display_math") {
      count += 1;
      continue;
    }
    if (
      (block.content.kind === "paragraph" || block.content.kind === "heading") &&
      block.content.inlines.some((inline) => inline.type === "math")
    ) {
      count += 1;
    }
  }
  return count;
}

function needsReviewStatus(blocks: Pick<DocumentBlock, "status">[]): number {
  return blocks.filter((block) => block.status === "needs_review" || block.status === "unsupported").length;
}

function recalculateProject(data: DbFile, ownerId: string, projectId: string): ProjectRecord {
  const project = projectOrThrow(data, ownerId, projectId);
  const blocks = data.blocks.filter(
    (block) => block.ownerId === ownerId && block.projectId === projectId,
  );
  const pages = data.pages.filter(
    (page) => page.ownerId === ownerId && page.projectId === projectId,
  );
  project.blockCount = blocks.length;
  project.mathBlockCount = countMath(blocks);
  project.needsReviewCount = needsReviewStatus(blocks);
  project.pageCount = pages.length || project.pageCount;
  if (project.status !== "processing" && project.status !== "archived" && project.status !== "failed") {
    project.status = project.blockCount > 0
      ? project.needsReviewCount > 0
        ? "needs_review"
        : "ready"
      : "needs_review";
  }
  project.updatedAt = now();
  return project;
}

export interface CreateUploadedProjectInput {
  name: string;
  originalFilename: string;
  mimeType: string;
  detectedType: SourceType | "unknown";
  fileSizeBytes: number;
  checksumSha256: string;
  pageCount: number | null;
  metadata: Record<string, unknown>;
  settings?: ConversionSettings;
  storageKey: string;
  /** Pre-generated ids allow the upload handler to write the private file first. */
  projectId?: string;
  documentId?: string;
}

export async function createUploadedProject(
  ownerId: string,
  input: CreateUploadedProjectInput,
): Promise<ProjectDetail> {
  const projectId = input.projectId ?? newId();
  const documentId = input.documentId ?? newId();
  const timestamp = now();
  const name = (input.name.trim() || stripExtension(input.originalFilename)).slice(0, MAX_PROJECT_NAME);

  const project: ProjectRecord = {
    id: projectId,
    ownerId,
    name,
    description: "",
    status: "draft",
    settings: input.settings ?? DEFAULT_CONVERSION_SETTINGS,
    sourceType: input.detectedType,
    sourceFilename: input.originalFilename,
    documentId,
    pageCount: input.pageCount,
    blockCount: 0,
    mathBlockCount: 0,
    needsReviewCount: 0,
    latexSource: "",
    latexLineMap: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  };

  const document: StoredDocument = {
    id: documentId,
    ownerId,
    projectId,
    originalFilename: input.originalFilename,
    storageKey: input.storageKey,
    mimeType: input.mimeType,
    detectedType: input.detectedType,
    fileSizeBytes: input.fileSizeBytes,
    checksumSha256: input.checksumSha256,
    pageCount: input.pageCount,
    status: "uploaded",
    metadata: input.metadata,
    diagnostics: [],
    createdAt: timestamp,
  };

  const detail = await mutateDb((data) => {
    data.projects.push(project);
    data.documents.push(document);
    return { ...project, document: documentSummary(document) };
  });
  return detail;
}

export interface ListProjectsOptions {
  query?: string;
  status?: ProjectStatus | "all";
  sort?: "updated" | "created" | "name";
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export async function listProjects(
  ownerId: string,
  options: ListProjectsOptions = {},
): Promise<{ items: ProjectListItem[]; total: number; page: number; pageSize: number }> {
  const data = await readDb();
  const query = options.query?.trim().toLocaleLowerCase("vi") ?? "";
  let items = data.projects.filter((project) => project.ownerId === ownerId);

  if (options.status && options.status !== "all") {
    items = items.filter((project) => project.status === options.status);
  }
  if (query) {
    items = items.filter(
      (project) =>
        project.name.toLocaleLowerCase("vi").includes(query) ||
        project.sourceFilename.toLocaleLowerCase("vi").includes(query) ||
        project.description.toLocaleLowerCase("vi").includes(query),
    );
  }

  const sort = options.sort ?? "updated";
  const direction = options.direction ?? "desc";
  items.sort((left, right) => {
    let result = 0;
    if (sort === "name") result = left.name.localeCompare(right.name, "vi");
    else if (sort === "created") result = left.createdAt.localeCompare(right.createdAt);
    else result = left.updatedAt.localeCompare(right.updatedAt);
    return direction === "asc" ? result : -result;
  });

  const total = items.length;
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize).map(projectListItem),
    total,
    page,
    pageSize,
  };
}

export async function getProjectDetail(ownerId: string, projectId: string): Promise<ProjectDetail> {
  const data = await readDb();
  const project = projectOrThrow(data, ownerId, projectId);
  const document = documentForProject(data, ownerId, projectId);
  return { ...project, document: document ? documentSummary(document) : null };
}

export async function touchProject(ownerId: string, projectId: string): Promise<void> {
  await mutateDb((data) => {
    const project = projectOrThrow(data, ownerId, projectId);
    project.lastOpenedAt = now();
  });
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  settings?: ConversionSettings;
}

export async function updateProject(
  ownerId: string,
  projectId: string,
  patch: UpdateProjectInput,
): Promise<ProjectDetail> {
  return mutateDb((data) => {
    const project = projectOrThrow(data, ownerId, projectId);
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new AppError("INVALID_PROJECT_NAME", "Tên dự án không được để trống.", 400);
      project.name = name.slice(0, MAX_PROJECT_NAME);
    }
    if (patch.description !== undefined) project.description = patch.description.slice(0, 2000);
    if (patch.status !== undefined) project.status = patch.status;
    if (patch.settings !== undefined) project.settings = patch.settings;
    project.updatedAt = now();
    const document = documentForProject(data, ownerId, projectId);
    return { ...project, document: document ? documentSummary(document) : null };
  });
}

export async function deleteProject(ownerId: string, projectId: string): Promise<void> {
  await mutateDb((data) => {
    projectOrThrow(data, ownerId, projectId);
    data.projects = data.projects.filter((item) => !(item.id === projectId && item.ownerId === ownerId));
    data.documents = data.documents.filter(
      (item) => !(item.projectId === projectId && item.ownerId === ownerId),
    );
    data.pages = data.pages.filter((item) => !(item.projectId === projectId && item.ownerId === ownerId));
    data.blocks = data.blocks.filter((item) => !(item.projectId === projectId && item.ownerId === ownerId));
    data.jobs = data.jobs.filter((item) => !(item.projectId === projectId && item.ownerId === ownerId));
    data.versions = data.versions.filter(
      (item) => !(item.projectId === projectId && item.ownerId === ownerId),
    );
    data.assets = data.assets.filter((item) => !(item.projectId === projectId && item.ownerId === ownerId));
    data.recognitions = data.recognitions.filter(
      (item) => !(item.projectId === projectId && item.ownerId === ownerId),
    );
  });
  await deleteProjectFiles(ownerId, projectId);
}

export async function duplicateProject(ownerId: string, projectId: string): Promise<ProjectDetail> {
  const data = await readDb();
  const project = projectOrThrow(data, ownerId, projectId);
  const document = documentForProject(data, ownerId, projectId);
  const pages = data.pages.filter((item) => item.projectId === projectId && item.ownerId === ownerId);
  const blocks = data.blocks.filter((item) => item.projectId === projectId && item.ownerId === ownerId);
  const assets = data.assets.filter((item) => item.projectId === projectId && item.ownerId === ownerId);

  const newProjectId = newId();
  const newDocumentId = newId();
  const timestamp = now();
  const assetIdMap = new Map<string, string>();
  const newAssets: StoredAsset[] = [];

  for (const asset of assets) {
    try {
      const bytes = await readStoredFile(asset.storageKey);
      const assetId = newId();
      const saved = await saveAssetFile({
        ownerId,
        projectId: newProjectId,
        assetId,
        input: {
          filename: asset.filename,
          mimeType: asset.mimeType,
          data: bytes,
          width: asset.width ?? undefined,
          height: asset.height ?? undefined,
        },
      });
      assetIdMap.set(asset.id, assetId);
      newAssets.push({
        ...asset,
        id: assetId,
        projectId: newProjectId,
        storageKey: saved.storageKey,
        sizeBytes: saved.sizeBytes,
        createdAt: timestamp,
      });
    } catch {
      // Missing optional assets should not block duplicating the source project.
    }
  }

  let newStorageKey: string | null = null;
  if (document) {
    const bytes = await readStoredFile(document.storageKey);
    newStorageKey = originalFileKey({
      ownerId,
      projectId: newProjectId,
      documentId: newDocumentId,
      extension: document.storageKey.slice(document.storageKey.lastIndexOf(".")),
    });
    await saveStoredFile(newStorageKey, bytes);
  }

  const newProject: ProjectRecord = {
    ...project,
    id: newProjectId,
    name: `${project.name} (bản sao)`.slice(0, MAX_PROJECT_NAME),
    documentId: document ? newDocumentId : null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  };

  const newDocument: StoredDocument | null = document
    ? {
        ...document,
        id: newDocumentId,
        projectId: newProjectId,
        storageKey: newStorageKey ?? document.storageKey,
        createdAt: timestamp,
      }
    : null;

  const pageIdMap = new Map<string, string>();
  for (const page of pages) pageIdMap.set(page.id, newId());
  const blockIdMap = new Map<string, string>();
  for (const block of blocks) blockIdMap.set(block.id, newId());

  const newPages: StoredPage[] = pages.map((page) => ({
    ...page,
    id: pageIdMap.get(page.id) ?? newId(),
    projectId: newProjectId,
    documentId: newDocumentId,
  }));

  const newBlocks: StoredBlock[] = blocks.map((block) => {
    const content: BlockContent = structuredClone(block.content);
    if (content.kind === "image") {
      const mapped = assetIdMap.get(content.assetId);
      if (mapped) content.assetId = mapped;
    }
    const originalContent: BlockContent = structuredClone(block.originalContent);
    if (originalContent.kind === "image") {
      const mapped = assetIdMap.get(originalContent.assetId);
      if (mapped) originalContent.assetId = mapped;
    }
    return {
      ...block,
      id: blockIdMap.get(block.id) ?? newId(),
      projectId: newProjectId,
      documentId: newDocumentId,
      pageId: pageIdMap.get(block.pageId) ?? block.pageId,
      source: { ...block.source, documentId: newDocumentId },
      content,
      originalContent,
    } as StoredBlock;
  });

  const currentVersion = data.versions
    .filter((version) => version.projectId === projectId && version.ownerId === ownerId)
    .sort((left, right) => right.versionNumber - left.versionNumber)[0];

  const detail = await mutateDb((db) => {
    db.projects.push(newProject);
    if (newDocument) db.documents.push(newDocument);
    db.pages.push(...newPages);
    db.blocks.push(...newBlocks);
    db.assets.push(...newAssets);
    if (currentVersion && project.latexSource) {
      db.versions.push({
        ...currentVersion,
        id: newId(),
        ownerId,
        projectId: newProjectId,
        versionNumber: 1,
        createdAt: timestamp,
        isCurrent: true,
        source: project.latexSource,
      });
    }
    return {
      ...newProject,
      document: newDocument ? documentSummary(newDocument) : null,
    };
  });
  return detail;
}

export async function getDashboardStats(ownerId: string): Promise<ProjectStats> {
  const data = await readDb();
  const projects = data.projects.filter((project) => project.ownerId === ownerId);
  const storageBytes = await ownerStorageUsage(ownerId);
  return {
    totalDocuments: projects.filter((project) => project.documentId).length,
    converted: projects.filter((project) => project.status === "ready").length,
    processing: projects.filter((project) => project.status === "processing").length,
    needsReview: projects.filter((project) => project.status === "needs_review").length,
    drafts: projects.filter((project) => project.status === "draft").length,
    failed: projects.filter((project) => project.status === "failed").length,
    totalBlocks: projects.reduce((total, project) => total + project.blockCount, 0),
    storageBytes,
  };
}

export async function markProjectProcessing(ownerId: string, projectId: string): Promise<void> {
  await mutateDb((data) => {
    const project = projectOrThrow(data, ownerId, projectId);
    project.status = "processing";
    project.updatedAt = now();
  });
}

export interface SaveParsedDocumentInput {
  ownerId: string;
  projectId: string;
  documentId: string;
  ast: DocumentAst;
  assets: StoredAsset[];
  diagnostics: DocumentDiagnostic[];
}

export async function saveParsedDocument(input: SaveParsedDocumentInput): Promise<ProjectRecord> {
  const { ownerId, projectId, documentId, ast, assets } = input;
  return mutateDb((data) => {
    const project = projectOrThrow(data, ownerId, projectId);
    const document = documentOrThrow(data, ownerId, documentId);
    if (document.projectId !== projectId) {
      throw new AppError("DOCUMENT_PROJECT_MISMATCH", "Tài liệu không thuộc dự án này.", 400);
    }

    data.pages = data.pages.filter(
      (page) => !(page.documentId === documentId && page.ownerId === ownerId),
    );
    data.blocks = data.blocks.filter(
      (block) => !(block.documentId === documentId && block.ownerId === ownerId),
    );
    data.assets = data.assets.filter(
      (asset) => !(asset.projectId === projectId && asset.ownerId === ownerId),
    );

    for (const parsedPage of ast.pages) {
      const pageId = parsedPage.id || newId();
      const page: StoredPage = {
        id: pageId,
        ownerId,
        projectId,
        documentId,
        pageNumber: parsedPage.pageNumber,
        width: parsedPage.width,
        height: parsedPage.height,
        rotation: parsedPage.rotation,
        textLayerStatus: parsedPage.textLayerStatus,
        metadata: parsedPage.metadata ?? {},
      };
      data.pages.push(page);
      for (const block of parsedPage.blocks) {
        data.blocks.push({
          ...block,
          ownerId,
          projectId,
          documentId,
          pageId,
          source: { ...block.source, documentId },
          confidenceBand: block.confidenceBand ?? getConfidenceBand(block.confidence),
          warnings: block.warnings ?? [],
        });
      }
    }

    data.assets.push(...assets);
    document.status = "parsed";
    document.pageCount = ast.pages.length;
    document.diagnostics = input.diagnostics;
    document.metadata = {
      ...document.metadata,
      astMetadata: ast.metadata,
      parsedAt: ast.metadata.parsedAt,
    };
    project.sourceType = ast.sourceType;
    project.pageCount = ast.pages.length;
    recalculateProject(data, ownerId, projectId);
    return { ...project };
  });
}

export interface DocumentStructure {
  project: ProjectRecord;
  document: StoredDocument;
  ast: DocumentAst;
}

export async function getDocumentStructure(
  ownerId: string,
  projectId: string,
): Promise<DocumentStructure> {
  const data = await readDb();
  const project = projectOrThrow(data, ownerId, projectId);
  const document = documentForProject(data, ownerId, projectId);
  if (!document) {
    throw new AppError("DOCUMENT_REQUIRED", "Dự án chưa có tài liệu gốc.", 404);
  }
  const pages = data.pages
    .filter((page) => page.documentId === document.id && page.ownerId === ownerId)
    .sort((left, right) => left.pageNumber - right.pageNumber);
  const blocks = data.blocks
    .filter((block) => block.documentId === document.id && block.ownerId === ownerId)
    .sort((left, right) => left.order - right.order);

  const astPages: DocumentPage[] = pages.map((page) => ({
    id: page.id,
    documentId: page.documentId,
    pageNumber: page.pageNumber,
    width: page.width,
    height: page.height,
    rotation: page.rotation,
    textLayerStatus: page.textLayerStatus,
    metadata: page.metadata,
    blocks: blocks.filter((block) => block.pageId === page.id),
  }));

  const sourceType: SourceType = document.detectedType === "unknown" ? "pdf" : document.detectedType;
  const astMetadataRaw = document.metadata.astMetadata as
    | Partial<DocumentAst["metadata"]>
    | undefined;
  const ast: DocumentAst = {
    schemaVersion: AST_SCHEMA_VERSION,
    documentId: document.id,
    title: project.name,
    language: project.settings.language,
    sourceType,
    pages: astPages,
    diagnostics: document.diagnostics,
    metadata: {
      pageCount: astPages.length,
      textLayerPages: astPages.filter((page) => page.textLayerStatus === "available").length,
      scannedPages: astPages.filter((page) => page.textLayerStatus === "unavailable").length,
      blockCount: blocks.length,
      mathBlockCount: countMath(blocks),
      parser: String(astMetadataRaw?.parser ?? "unknown"),
      parsedAt: String(astMetadataRaw?.parsedAt ?? document.createdAt),
    },
  };
  return { project, document, ast };
}

export async function getStoredDocumentByProject(
  ownerId: string,
  projectId: string,
): Promise<{ project: ProjectRecord; document: StoredDocument }> {
  const data = await readDb();
  const project = projectOrThrow(data, ownerId, projectId);
  const document = documentForProject(data, ownerId, projectId);
  if (!document) throw new AppError("DOCUMENT_REQUIRED", "Dự án chưa có tài liệu gốc.", 404);
  return { project, document };
}

export interface SaveLatexInput {
  ownerId: string;
  projectId: string;
  source: string;
  lineMap: Record<string, [number, number]>;
  snapshot?: boolean;
  summary?: string;
}

export async function saveProjectLatex(
  input: SaveLatexInput,
): Promise<{ project: ProjectRecord; version: LatexVersionSummary | null }> {
  return mutateDb((data) => {
    const project = projectOrThrow(data, input.ownerId, input.projectId);
    const sourceHash = hashSource(input.source);
    const latest = data.versions
      .filter((version) => version.projectId === input.projectId && version.ownerId === input.ownerId)
      .sort((left, right) => right.versionNumber - left.versionNumber)[0];

    let version: StoredVersion | null = null;
    if (input.snapshot && (!latest || latest.sourceHash !== sourceHash)) {
      const versionNumber = (latest?.versionNumber ?? 0) + 1;
      const timestamp = now();
      for (const existing of data.versions) {
        if (existing.projectId === input.projectId && existing.ownerId === input.ownerId) {
          existing.isCurrent = false;
        }
      }
      version = {
        id: newId(),
        ownerId: input.ownerId,
        projectId: input.projectId,
        versionNumber,
        sourceHash,
        changeSummary: input.summary ?? "Lưu phiên bản",
        createdAt: timestamp,
        sourceSize: Buffer.byteLength(input.source, "utf8"),
        isCurrent: true,
        source: input.source,
      };
      data.versions.push(version);
    }

    project.latexSource = input.source;
    project.latexLineMap = input.lineMap;
    project.lastOpenedAt = now();
    project.updatedAt = now();
    return {
      project: { ...project },
      version: version
        ? {
            id: version.id,
            projectId: version.projectId,
            versionNumber: version.versionNumber,
            sourceHash: version.sourceHash,
            changeSummary: version.changeSummary,
            createdAt: version.createdAt,
            sourceSize: version.sourceSize,
            isCurrent: version.isCurrent,
          }
        : null,
    };
  });
}

export async function getProjectDocumentSource(
  ownerId: string,
  projectId: string,
): Promise<{ project: ProjectRecord; document: StoredDocument }> {
  return getStoredDocumentByProject(ownerId, projectId);
}

export async function appendDocumentDiagnostics(
  ownerId: string,
  projectId: string,
  diagnostics: DocumentDiagnostic[],
): Promise<void> {
  if (diagnostics.length === 0) return;
  await mutateDb((data) => {
    projectOrThrow(data, ownerId, projectId);
    const document = documentForProject(data, ownerId, projectId);
    if (!document) return;
    const existingKeys = new Set(
      document.diagnostics.map((item) => `${item.code}:${item.message}`),
    );
    for (const diagnostic of diagnostics.slice(0, 200)) {
      const key = `${diagnostic.code}:${diagnostic.message}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      document.diagnostics.push(diagnostic);
    }
    document.diagnostics = document.diagnostics.slice(-500);
  });
}

export type ReviewAction = "accept" | "reject" | "ignore" | "edit" | "reset" | "unsupported";

export interface ReviewResult {
  block: StoredBlock;
  project: ProjectRecord;
}

export async function reviewBlock(params: {
  ownerId: string;
  projectId: string;
  blockId: string;
  action: ReviewAction;
  latex?: string;
  content?: BlockContent;
}): Promise<ReviewResult> {
  return mutateDb((data) => {
    const project = projectOrThrow(data, params.ownerId, params.projectId);
    const block = data.blocks.find(
      (item) =>
        item.id === params.blockId &&
        item.projectId === params.projectId &&
        item.ownerId === params.ownerId,
    );
    if (!block) {
      throw new AppError("BLOCK_NOT_FOUND", "Không tìm thấy block cần đánh giá.", 404);
    }
    const timestamp = now();
    switch (params.action) {
      case "accept":
        block.status = "accepted";
        block.reviewedAt = timestamp;
        break;
      case "reject":
        block.status = "rejected";
        block.reviewedAt = timestamp;
        break;
      case "ignore":
        block.status = "ignored";
        block.reviewedAt = timestamp;
        break;
      case "unsupported":
        block.status = "unsupported";
        break;
      case "reset":
        block.status = "needs_review";
        block.reviewedAt = undefined;
        break;
      case "edit": {
        if (!params.content && params.latex === undefined) {
          throw new AppError("EDIT_REQUIRED", "Cần cung cấp nội dung chỉnh sửa.", 400);
        }
        if (params.content) {
          block.content = params.content;
        } else if (params.latex !== undefined) {
          if (block.content.kind === "display_math") {
            block.content = {
              ...block.content,
              latex: params.latex,
              provenance: {
                ...(block.content.provenance ?? {}),
                providerId: "manual-edit",
                recognizedAt: timestamp,
              },
            };
          } else {
            throw new AppError(
              "INLINE_EDIT_UNSUPPORTED",
              "Block này cần được chỉnh sửa trong LaTeX Studio.",
              400,
            );
          }
        }
        block.status = "accepted";
        block.reviewedAt = timestamp;
        if (!block.warnings.includes("Đã chỉnh sửa thủ công và giáo viên xác nhận.")) {
          block.warnings.push("Đã chỉnh sửa thủ công và giáo viên xác nhận.");
        }
        break;
      }
      default:
        throw new AppError("REVIEW_ACTION_INVALID", "Hành động đánh giá không hợp lệ.", 400);
    }
    recalculateProject(data, params.ownerId, params.projectId);
    project.lastOpenedAt = timestamp;
    return { block: { ...block }, project: { ...project } };
  });
}

export async function getBlock(
  ownerId: string,
  projectId: string,
  blockId: string,
): Promise<StoredBlock> {
  const data = await readDb();
  const block = data.blocks.find(
    (item) => item.id === blockId && item.projectId === projectId && item.ownerId === ownerId,
  );
  if (!block) throw new AppError("BLOCK_NOT_FOUND", "Không tìm thấy block.", 404);
  return block;
}

export async function getReviewReport(ownerId: string, projectId: string): Promise<ReviewReport> {
  const data = await readDb();
  projectOrThrow(data, ownerId, projectId);
  const blocks = data.blocks.filter(
    (block) => block.projectId === projectId && block.ownerId === ownerId,
  );
  const pages = data.pages.filter(
    (page) => page.projectId === projectId && page.ownerId === ownerId,
  );
  const document = documentForProject(data, ownerId, projectId);
  const byStatus: Record<string, number> = {};
  for (const block of blocks) byStatus[block.status] = (byStatus[block.status] ?? 0) + 1;
  return {
    totalPages: pages.length,
    totalBlocks: blocks.length,
    mathBlocks: countMath(blocks),
    warnings: blocks.reduce((total, block) => total + block.warnings.length, 0),
    needsReview: blocks.filter((block) => block.status === "needs_review").length,
    accepted: blocks.filter((block) => block.status === "accepted").length,
    rejected: blocks.filter((block) => block.status === "rejected").length,
    unsupported: blocks.filter((block) => block.status === "unsupported").length,
    scannedPages: pages.filter((page) => page.textLayerStatus === "unavailable").length,
    unsupportedConstructs: document?.diagnostics.filter((item) => item.severity === "warning").length ?? 0,
    byStatus,
    measuredAt: now(),
  };
}

export async function createJob(params: {
  ownerId: string;
  projectId: string;
  documentId: string;
  jobType: ConversionJob["jobType"];
}): Promise<StoredJob> {
  return mutateDb((data) => {
    projectOrThrow(data, params.ownerId, params.projectId);
    documentOrThrow(data, params.ownerId, params.documentId);
    const active = data.jobs.find(
      (job) =>
        job.ownerId === params.ownerId &&
        job.projectId === params.projectId &&
        !["completed", "failed", "cancelled"].includes(job.status),
    );
    if (active) {
      throw new AppError("JOB_ACTIVE", "Dự án đang có một tác vụ xử lý khác.", 409);
    }
    const timestamp = now();
    const job: StoredJob = {
      id: newId(),
      projectId: params.projectId,
      documentId: params.documentId,
      ownerId: params.ownerId,
      jobType: params.jobType,
      status: "queued",
      progressPercent: 0,
      stage: "Đang xếp hàng",
      stageDetail: "",
      attemptCount: 0,
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      cancelRequested: false,
    };
    data.jobs.push(job);
    return { ...job };
  });
}

export async function updateJob(
  ownerId: string,
  jobId: string,
  patch: Partial<
    Pick<
      StoredJob,
      | "status"
      | "progressPercent"
      | "stage"
      | "stageDetail"
      | "errorCode"
      | "errorMessage"
      | "startedAt"
      | "finishedAt"
      | "attemptCount"
    >
  >,
): Promise<StoredJob> {
  return mutateDb((data) => {
    const job = data.jobs.find((item) => item.id === jobId && item.ownerId === ownerId);
    if (!job) throw new AppError("JOB_NOT_FOUND", "Không tìm thấy tác vụ.", 404);
    Object.assign(job, patch);
    job.updatedAt = now();
    return { ...job };
  });
}

export async function getJob(ownerId: string, projectId: string): Promise<StoredJob | null> {
  const data = await readDb();
  const jobs = data.jobs
    .filter((job) => job.ownerId === ownerId && job.projectId === projectId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return jobs[0] ?? null;
}

export async function getJobById(ownerId: string, jobId: string): Promise<StoredJob> {
  const data = await readDb();
  const job = data.jobs.find((item) => item.id === jobId && item.ownerId === ownerId);
  if (!job) throw new AppError("JOB_NOT_FOUND", "Không tìm thấy tác vụ.", 404);
  return job;
}

export async function isJobCancelRequested(jobId: string, ownerId: string): Promise<boolean> {
  const data = await readDb();
  const job = data.jobs.find((item) => item.id === jobId && item.ownerId === ownerId);
  return Boolean(job?.cancelRequested);
}

export async function requestCancelJob(
  ownerId: string,
  projectId: string,
  jobId: string,
): Promise<StoredJob> {
  return mutateDb((data) => {
    const job = data.jobs.find(
      (item) => item.id === jobId && item.projectId === projectId && item.ownerId === ownerId,
    );
    if (!job) throw new AppError("JOB_NOT_FOUND", "Không tìm thấy tác vụ.", 404);
    if (["completed", "failed", "cancelled"].includes(job.status)) {
      return { ...job };
    }
    job.cancelRequested = true;
    job.stage = "Đang hủy tác vụ";
    job.updatedAt = now();
    return { ...job };
  });
}

export async function failProject(
  ownerId: string,
  projectId: string,
  message: string,
): Promise<void> {
  await mutateDb((data) => {
    const project = projectOrThrow(data, ownerId, projectId);
    project.status = "failed";
    project.description = message.slice(0, 500);
    project.updatedAt = now();
  });
}

export interface VersionListResult {
  items: LatexVersionSummary[];
  currentLatexSource: string;
}

export async function listVersions(
  ownerId: string,
  projectId: string,
): Promise<VersionListResult> {
  const data = await readDb();
  const project = projectOrThrow(data, ownerId, projectId);
  const items = data.versions
    .filter((version) => version.projectId === projectId && version.ownerId === ownerId)
    .sort((left, right) => right.versionNumber - left.versionNumber)
    .map((version) => ({
      id: version.id,
      projectId: version.projectId,
      versionNumber: version.versionNumber,
      sourceHash: version.sourceHash,
      changeSummary: version.changeSummary,
      createdAt: version.createdAt,
      sourceSize: version.sourceSize,
      isCurrent: version.isCurrent,
    }));
  return { items, currentLatexSource: project.latexSource };
}

export async function getVersion(
  ownerId: string,
  projectId: string,
  versionId: string,
): Promise<LatexVersionDetail> {
  const data = await readDb();
  projectOrThrow(data, ownerId, projectId);
  const version = data.versions.find(
    (item) => item.id === versionId && item.projectId === projectId && item.ownerId === ownerId,
  );
  if (!version) throw new AppError("VERSION_NOT_FOUND", "Không tìm thấy phiên bản.", 404);
  return version;
}

export async function restoreVersion(
  ownerId: string,
  projectId: string,
  versionId: string,
): Promise<{ project: ProjectRecord; version: LatexVersionSummary }> {
  return mutateDb((data) => {
    const project = projectOrThrow(data, ownerId, projectId);
    const target = data.versions.find(
      (item) => item.id === versionId && item.projectId === projectId && item.ownerId === ownerId,
    );
    if (!target) throw new AppError("VERSION_NOT_FOUND", "Không tìm thấy phiên bản.", 404);

    const latest = data.versions
      .filter((version) => version.projectId === projectId && version.ownerId === ownerId)
      .sort((left, right) => right.versionNumber - left.versionNumber)[0];
    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const timestamp = now();
    for (const version of data.versions) {
      if (version.projectId === projectId && version.ownerId === ownerId) version.isCurrent = false;
    }
    const restored: StoredVersion = {
      id: newId(),
      ownerId,
      projectId,
      versionNumber,
      sourceHash: target.sourceHash,
      changeSummary: `Khôi phục từ phiên bản #${target.versionNumber}`,
      createdAt: timestamp,
      sourceSize: target.sourceSize,
      isCurrent: true,
      source: target.source,
    };
    data.versions.push(restored);
    project.latexSource = target.source;
    project.updatedAt = timestamp;
    return {
      project: { ...project },
      version: {
        id: restored.id,
        projectId,
        versionNumber: restored.versionNumber,
        sourceHash: restored.sourceHash,
        changeSummary: restored.changeSummary,
        createdAt: restored.createdAt,
        sourceSize: restored.sourceSize,
        isCurrent: true,
      },
    };
  });
}

export async function listAssets(ownerId: string, projectId: string): Promise<AssemblyAsset[]> {
  const data = await readDb();
  projectOrThrow(data, ownerId, projectId);
  return data.assets
    .filter((asset) => asset.projectId === projectId && asset.ownerId === ownerId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((asset) => ({
      id: asset.id,
      projectId: asset.projectId,
      filename: asset.filename,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt,
    }));
}

export async function getStoredAsset(
  ownerId: string,
  assetId: string,
): Promise<StoredAsset> {
  const data = await readDb();
  const asset = data.assets.find((item) => item.id === assetId && item.ownerId === ownerId);
  if (!asset) throw new AppError("ASSET_NOT_FOUND", "Không tìm thấy tài nguyên.", 404);
  return asset;
}

export async function getStoredAssetsForProject(
  ownerId: string,
  projectId: string,
): Promise<StoredAsset[]> {
  const data = await readDb();
  projectOrThrow(data, ownerId, projectId);
  return data.assets.filter(
    (asset) => asset.projectId === projectId && asset.ownerId === ownerId,
  );
}

export async function getProvider(
  ownerId: string,
): Promise<StoredProvider | null> {
  const data = await readDb();
  return data.providers.find((provider) => provider.ownerId === ownerId) ?? null;
}

export async function saveProvider(
  ownerId: string,
  provider: Omit<StoredProvider, "ownerId" | "updatedAt">,
): Promise<StoredProvider> {
  return mutateDb((data) => {
    const existing = data.providers.find((item) => item.ownerId === ownerId);
    const record: StoredProvider = {
      ...provider,
      ownerId,
      updatedAt: now(),
    };
    if (existing) {
      Object.assign(existing, record);
      return { ...existing };
    }
    data.providers.push(record);
    return { ...record };
  });
}

export async function deleteProvider(ownerId: string): Promise<void> {
  await mutateDb((data) => {
    data.providers = data.providers.filter((provider) => provider.ownerId !== ownerId);
  });
}

export async function updateProviderCheck(
  ownerId: string,
  status: StoredProvider["status"],
  lastError: string | null,
): Promise<void> {
  await mutateDb((data) => {
    const provider = data.providers.find((item) => item.ownerId === ownerId);
    if (!provider) return;
    provider.status = status;
    provider.lastError = lastError;
    provider.lastCheckedAt = now();
    provider.updatedAt = now();
  });
}

export interface NotificationItem {
  id: string;
  projectId: string;
  projectName: string;
  status: string;
  message: string;
  createdAt: string;
}

export async function getRecentNotifications(
  ownerId: string,
  limit = 8,
): Promise<NotificationItem[]> {
  const data = await readDb();
  const jobs = data.jobs
    .filter((job) => job.ownerId === ownerId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
  return jobs.map((job) => {
    const project = data.projects.find((item) => item.id === job.projectId);
    return {
      id: job.id,
      projectId: job.projectId,
      projectName: project?.name ?? "Dự án",
      status: job.status,
      message:
        job.status === "completed"
          ? "Đã hoàn tất xử lý tài liệu."
          : job.status === "failed"
            ? job.errorMessage ?? "Xử lý thất bại."
            : job.status === "needs_review"
              ? "Cần giáo viên kiểm tra nội dung."
              : job.stage,
      createdAt: job.updatedAt,
    };
  });
}

export interface SearchResult {
  projects: ProjectListItem[];
  blocks: Array<{
    projectId: string;
    projectName: string;
    blockId: string;
    blockType: string;
    preview: string;
  }>;
}

function blockPlainText(block: StoredBlock): string {
  const content = block.content;
  switch (content.kind) {
    case "paragraph":
    case "heading":
      return content.inlines
        .map((inline) => (inline.type === "text" ? inline.text : inline.type === "math" ? inline.latex : " "))
        .join(" ");
    case "display_math":
      return content.latex;
    case "table":
      return content.rows
        .flat()
        .map((cell) => cell.inlines.map((inline) => (inline.type === "text" ? inline.text : inline.type === "math" ? inline.latex : " ")).join(" "))
        .join(" | ");
    case "list":
      return content.items
        .map((item) => item.inlines.map((inline) => (inline.type === "text" ? inline.text : inline.type === "math" ? inline.latex : " ")).join(" "))
        .join(" • ");
    case "unknown":
      return content.rawText ?? content.reason;
    default:
      return "";
  }
}

export async function searchWorkspace(ownerId: string, rawQuery: string): Promise<SearchResult> {
  const query = rawQuery.trim().toLocaleLowerCase("vi");
  if (query.length < 2) return { projects: [], blocks: [] };
  const data = await readDb();
  const projects = data.projects.filter(
    (project) =>
      project.ownerId === ownerId &&
      (project.name.toLocaleLowerCase("vi").includes(query) ||
        project.sourceFilename.toLocaleLowerCase("vi").includes(query)),
  );
  const blocks: SearchResult["blocks"] = [];
  for (const block of data.blocks) {
    if (block.ownerId !== ownerId) continue;
    const text = blockPlainText(block);
    if (!text.toLocaleLowerCase("vi").includes(query)) continue;
    const project = data.projects.find((item) => item.id === block.projectId);
    if (!project) continue;
    const index = text.toLocaleLowerCase("vi").indexOf(query);
    blocks.push({
      projectId: block.projectId,
      projectName: project.name,
      blockId: block.id,
      blockType: block.type,
      preview: text.slice(Math.max(0, index - 40), index + 100),
    });
    if (blocks.length >= 12) break;
  }
  return { projects: projects.slice(0, 8).map(projectListItem), blocks };
}

export async function deleteWorkspaceData(ownerId: string): Promise<void> {
  const data = await readDb();
  const projectIds = data.projects.filter((project) => project.ownerId === ownerId).map((project) => project.id);
  await mutateDb((db) => {
    db.projects = db.projects.filter((project) => project.ownerId !== ownerId);
    db.documents = db.documents.filter((document) => document.ownerId !== ownerId);
    db.pages = db.pages.filter((page) => page.ownerId !== ownerId);
    db.blocks = db.blocks.filter((block) => block.ownerId !== ownerId);
    db.jobs = db.jobs.filter((job) => job.ownerId !== ownerId);
    db.versions = db.versions.filter((version) => version.ownerId !== ownerId);
    db.assets = db.assets.filter((asset) => asset.ownerId !== ownerId);
    db.providers = db.providers.filter((provider) => provider.ownerId !== ownerId);
    db.recognitions = db.recognitions.filter((recognition) => recognition.ownerId !== ownerId);
  });
  for (const projectId of projectIds) {
    await deleteProjectFiles(ownerId, projectId);
  }
}

export interface ReplacePageBlocksInput {
  ownerId: string;
  projectId: string;
  pageNumber: number;
  blocks: DocumentBlock[];
  textLayerStatus?: DocumentPage["textLayerStatus"];
  pageMetadata?: Record<string, unknown>;
}

/**
 * Replaces every block on one page. Existing assets and the page record are
 * preserved. Used by the OCR review flow; the caller is responsible for
 * keeping the image block when the page itself is an image.
 */
export async function replacePageBlocks(
  input: ReplacePageBlocksInput,
): Promise<{ project: ProjectRecord; blocks: StoredBlock[]; page: StoredPage }> {
  return mutateDb((data) => {
    const project = projectOrThrow(data, input.ownerId, input.projectId);
    const document = documentForProject(data, input.ownerId, input.projectId);
    if (!document) throw new AppError("DOCUMENT_REQUIRED", "Dự án chưa có tài liệu gốc.", 404);
    const page = data.pages.find(
      (item) =>
        item.documentId === document.id &&
        item.ownerId === input.ownerId &&
        item.pageNumber === input.pageNumber,
    );
    if (!page) throw new AppError("PAGE_NOT_FOUND", "Không tìm thấy trang cần cập nhật.", 404);

    data.blocks = data.blocks.filter(
      (block) => !(block.pageId === page.id && block.ownerId === input.ownerId),
    );

    const inserted: StoredBlock[] = input.blocks.map((block, index) => {
      const stored = {
        ...block,
        id: block.id || newId(),
        order: index,
        pageNumber: input.pageNumber,
        ownerId: input.ownerId,
        projectId: input.projectId,
        documentId: document.id,
        pageId: page.id,
        source: {
          ...block.source,
          documentId: document.id,
          pageNumber: input.pageNumber,
        },
        confidenceBand: block.confidenceBand ?? getConfidenceBand(block.confidence),
        warnings: block.warnings ?? [],
        originalContent: block.originalContent ?? structuredClone(block.content),
      } as StoredBlock;
      data.blocks.push(stored);
      return stored;
    });

    if (input.textLayerStatus) page.textLayerStatus = input.textLayerStatus;
    if (input.pageMetadata) page.metadata = { ...page.metadata, ...input.pageMetadata };
    recalculateProject(data, input.ownerId, input.projectId);
    return {
      project: { ...project },
      blocks: inserted.map((block) => structuredClone(block)),
      page: structuredClone(page),
    };
  });
}

export async function recordRecognition(input: {
  ownerId: string;
  projectId: string;
  documentId: string;
  pageId: string;
  blockId: string | null;
  providerId: string;
  modelName: string;
  confidence: number | null;
  normalizedResult: unknown;
  warnings: string[];
}): Promise<void> {
  await mutateDb((data) => {
    projectOrThrow(data, input.ownerId, input.projectId);
    data.recognitions.push({
      id: newId(),
      ownerId: input.ownerId,
      projectId: input.projectId,
      documentId: input.documentId,
      pageId: input.pageId,
      blockId: input.blockId,
      providerId: input.providerId,
      modelName: input.modelName,
      confidence: input.confidence,
      normalizedResult: input.normalizedResult,
      warnings: input.warnings.slice(0, 20),
      createdAt: now(),
    });
  });
}

export async function getWorkspaceInfo(ownerId: string): Promise<{
  name: string;
  createdAt: string;
  projectCount: number;
  storageBytes: number;
}> {
  const data = await readDb();
  const projects = data.projects.filter((project) => project.ownerId === ownerId);
  return {
    name: data.workspace.name,
    createdAt: data.workspace.createdAt,
    projectCount: projects.length,
    storageBytes: await ownerStorageUsage(ownerId),
  };
}

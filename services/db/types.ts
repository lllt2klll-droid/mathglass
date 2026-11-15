import type {
  DocumentBlock,
  DocumentDiagnostic,
  DocumentPage,
  SourceType,
} from "@/types/document";
import type {
  ConversionJob,
  LatexVersionSummary,
  ProjectRecord,
} from "@/types/project";
import type { ProviderConnectionStatus, ProviderKind } from "@/types/ai";

export interface StoredDocument {
  id: string;
  ownerId: string;
  projectId: string;
  originalFilename: string;
  storageKey: string;
  mimeType: string;
  detectedType: SourceType | "unknown";
  fileSizeBytes: number;
  checksumSha256: string;
  pageCount: number | null;
  status: "uploaded" | "inspecting" | "parsed" | "failed";
  metadata: Record<string, unknown>;
  diagnostics: DocumentDiagnostic[];
  createdAt: string;
}

export interface StoredPage extends Omit<DocumentPage, "blocks"> {
  ownerId: string;
  projectId: string;
}

export type StoredBlock = DocumentBlock & {
  ownerId: string;
  projectId: string;
  documentId: string;
  pageId: string;
};

export interface StoredJob extends ConversionJob {
  stageDetail: string;
  cancelRequested: boolean;
}

export interface StoredVersion extends LatexVersionSummary {
  ownerId: string;
  source: string;
}

export interface StoredAsset {
  id: string;
  ownerId: string;
  projectId: string;
  filename: string;
  mimeType: string;
  storageKey: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface StoredProvider {
  ownerId: string;
  providerId: ProviderKind;
  displayName: string;
  baseUrl: string;
  model: string;
  encryptedApiKey: string | null;
  enabled: boolean;
  status: ProviderConnectionStatus;
  lastCheckedAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

export interface StoredRecognition {
  id: string;
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
  createdAt: string;
}

export interface DbFile {
  schemaVersion: 1;
  workspace: {
    name: string;
    createdAt: string;
  };
  projects: ProjectRecord[];
  documents: StoredDocument[];
  pages: StoredPage[];
  blocks: StoredBlock[];
  jobs: StoredJob[];
  versions: StoredVersion[];
  assets: StoredAsset[];
  providers: StoredProvider[];
  recognitions: StoredRecognition[];
}

export function emptyDb(): DbFile {
  return {
    schemaVersion: 1,
    workspace: {
      name: "Không gian MathGlass",
      createdAt: new Date().toISOString(),
    },
    projects: [],
    documents: [],
    pages: [],
    blocks: [],
    jobs: [],
    versions: [],
    assets: [],
    providers: [],
    recognitions: [],
  };
}

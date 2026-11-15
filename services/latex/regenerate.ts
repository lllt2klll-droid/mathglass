import type { ConversionSettings } from "@/types/project";
import type { ProjectRecord } from "@/types/project";
import {
  getDocumentStructure,
  getStoredAssetsForProject,
  saveProjectLatex,
  updateProject,
} from "@/services/db/repository";
import {
  generateLatex,
  type GeneratedLatex,
} from "@/modules/latex-generator";
import {
  validateLatex,
  type LatexValidationResult,
} from "@/modules/latex-generator/validate";

export interface RegenerateLatexResult {
  project: ProjectRecord;
  generated: GeneratedLatex;
  validation: LatexValidationResult;
  assetCount: number;
}

/**
 * Rebuilds LaTeX from the stored AST and persists it as the project source.
 * A version snapshot is only created when `snapshot` is true and the source
 * actually changed (saveProjectLatex enforces the hash check).
 */
export async function regenerateProjectLatex(
  ownerId: string,
  projectId: string,
  options: {
    settings?: ConversionSettings;
    snapshot?: boolean;
    summary?: string;
  } = {},
): Promise<RegenerateLatexResult> {
  if (options.settings) {
    await updateProject(ownerId, projectId, { settings: options.settings });
  }
  const structure = await getDocumentStructure(ownerId, projectId);
  const assets = await getStoredAssetsForProject(ownerId, projectId);
  const generated = generateLatex({
    ast: structure.ast,
    settings: structure.project.settings,
    projectName: structure.project.name,
    sourceFilename: structure.document.originalFilename,
    assets: assets.map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
    })),
  });
  const validation = validateLatex(generated.source, {
    knownAssets: Object.values(generated.assetPaths),
  });
  const saved = await saveProjectLatex({
    ownerId,
    projectId,
    source: generated.source,
    lineMap: generated.lineMap,
    snapshot: options.snapshot ?? true,
    summary: options.summary ?? "Tạo lại LaTeX từ cấu trúc tài liệu",
  });
  return {
    project: saved.project,
    generated,
    validation,
    assetCount: assets.length,
  };
}

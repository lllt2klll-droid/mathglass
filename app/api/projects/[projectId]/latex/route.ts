import { requireOwnerId } from "@/lib/session";
import { apiSuccess, assertSameOrigin, handleApiError, readJson } from "@/lib/http";
import { saveLatexSchema } from "@/lib/schemas";
import {
  getDocumentStructure,
  getStoredAssetsForProject,
  saveProjectLatex,
} from "@/services/db/repository";
import { validateLatex } from "@/modules/latex-generator/validate";
import { generateLatex } from "@/modules/latex-generator";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
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
    const validation = validateLatex(structure.project.latexSource, {
      knownAssets: Object.values(generated.assetPaths),
    });
    return apiSuccess({
      source: structure.project.latexSource,
      lineMap: structure.project.latexLineMap,
      validation,
      projectId,
      updatedAt: structure.project.updatedAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwnerId();
    const { projectId } = await context.params;
    const payload = await readJson(request, saveLatexSchema);
    const saved = await saveProjectLatex({
      ownerId,
      projectId,
      source: payload.source,
      lineMap: payload.lineMap,
      snapshot: payload.snapshot,
      summary: payload.summary,
    });
    const validation = validateLatex(payload.source);
    return apiSuccess({
      project: saved.project,
      version: saved.version,
      validation,
      savedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

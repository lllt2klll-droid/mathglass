import JSZip from "jszip";
import type { ProjectRecord } from "@/types/project";
import { AppError } from "@/types/api";
import {
  getDocumentStructure,
  getStoredAssetsForProject,
  getStoredDocumentByProject,
} from "@/services/db/repository";
import { readStoredFile } from "@/services/storage/local-files";
import { generateLatex } from "@/modules/latex-generator";
import { safeFilename } from "@/lib/utils";

function compilerConfig(): { url: string; token: string; engine: string } | null {
  const url = process.env.MATHGLASS_COMPILER_URL?.trim();
  if (!url) return null;
  return {
    url: url.replace(/\/+$/, ""),
    token: process.env.MATHGLASS_COMPILER_TOKEN?.trim() ?? "",
    engine: process.env.MATHGLASS_COMPILER_ENGINE?.trim() || "xelatex",
  };
}

export function isCompilerConfigured(): boolean {
  return compilerConfig() !== null;
}

export function compilerStatus(): {
  configured: boolean;
  engine: string | null;
  reason: string;
} {
  const config = compilerConfig();
  return {
    configured: config !== null,
    engine: config?.engine ?? null,
    reason: config
      ? "Đã cấu hình dịch vụ biên dịch sandbox độc lập."
      : "Chưa cấu hình MATHGLASS_COMPILER_URL. MathGlass không biên dịch LaTeX trên máy chủ web và không cung cấp PDF giả.",
  };
}

async function projectExportContext(ownerId: string, projectId: string) {
  const structure = await getDocumentStructure(ownerId, projectId);
  const stored = await getStoredDocumentByProject(ownerId, projectId);
  const assets = await getStoredAssetsForProject(ownerId, projectId);
  if (!structure.project.latexSource.trim()) {
    throw new AppError(
      "LATEX_NOT_GENERATED",
      "Dự án chưa có mã LaTeX. Hãy chuyển đổi tài liệu hoặc tạo lại LaTeX trước khi xuất.",
      409,
    );
  }
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
  return { structure, stored, assets, assetPaths: generated.assetPaths };
}

export function exportBaseName(project: ProjectRecord): string {
  return safeFilename(project.name, "mathglass")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

export function contentDisposition(type: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export interface ExportArtifact {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export async function buildTexExport(
  ownerId: string,
  projectId: string,
): Promise<ExportArtifact> {
  const { structure } = await projectExportContext(ownerId, projectId);
  return {
    filename: `${exportBaseName(structure.project)}.tex`,
    mimeType: "application/x-tex; charset=utf-8",
    bytes: new TextEncoder().encode(structure.project.latexSource),
  };
}

export async function buildZipExport(
  ownerId: string,
  projectId: string,
): Promise<ExportArtifact> {
  const { structure, stored, assets, assetPaths } = await projectExportContext(
    ownerId,
    projectId,
  );
  if ((structure.project.latexSource.match(/\\includegraphics/g) ?? []).length > 0) {
    // Assets are always packed; validate references against the generated map.
    for (const [assetId, path] of Object.entries(assetPaths)) {
      if (!assets.some((asset) => asset.id === assetId)) {
        throw new AppError(
          "EXPORT_ASSET_MISSING",
          `Không thể xuất ZIP: tài nguyên ${path} không còn trong dự án.`,
          409,
        );
      }
    }
  }

  const zip = new JSZip();
  zip.file("main.tex", structure.project.latexSource);
  for (const asset of assets) {
    const path = assetPaths[asset.id];
    if (!path) continue;
    try {
      const bytes = await readStoredFile(asset.storageKey);
      zip.file(path, bytes);
    } catch {
      throw new AppError(
        "EXPORT_ASSET_UNREADABLE",
        `Không đọc được tài nguyên ${asset.filename}. Dự án chưa thể xuất đầy đủ.`,
        409,
      );
    }
  }
  try {
    const original = await readStoredFile(stored.document.storageKey);
    const extension = stored.document.storageKey.slice(stored.document.storageKey.lastIndexOf("."));
    zip.file(`source/${safeFilename(stored.document.originalFilename, "original")}${extension && !stored.document.originalFilename.endsWith(extension) ? extension : ""}`, original);
  } catch {
    // The original file is helpful but not required for a complete LaTeX bundle.
  }

  zip.file(
    "README.txt",
    [
      "MathGlass export",
      "================",
      `Dự án: ${structure.project.name}`,
      `Nguồn: ${stored.document.originalFilename}`,
      `Mẫu: ${structure.project.settings.templateId}`,
      `Số block: ${structure.project.blockCount}`,
      `Block cần kiểm tra: ${structure.project.needsReviewCount}`,
      "",
      "Cách biên dịch:",
      "1. Cài TeX Live hoặc MiKTeX có XeLaTeX và font Be Vietnam Pro/Noto Serif.",
      "2. Chạy: xelatex main.tex (hai lần nếu có tham chiếu trang).",
      "",
      "Lưu ý trung thực:",
      "- main.tex là mã hiện tại trong MathGlass, không phải bản đã biên dịch.",
      "- MathGlass không đảm bảo mọi công thức OCR là chính xác; hãy kiểm tra các block",
      "  được đánh dấu cần review trong Accuracy Lab trước khi in.",
      "- Nếu thiếu package hoặc font, XeLaTeX sẽ báo lỗi; MathGlass không tự cài package.",
    ].join("\n"),
  );

  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return {
    filename: `${exportBaseName(structure.project)}.zip`,
    mimeType: "application/zip",
    bytes,
  };
}

export async function compilePdfExport(
  ownerId: string,
  projectId: string,
): Promise<ExportArtifact> {
  const config = compilerConfig();
  if (!config) {
    throw new AppError(
      "COMPILER_NOT_CONFIGURED",
      "Chưa cấu hình dịch vụ biên dịch LaTeX sandbox. MathGlass không biên dịch trên máy chủ web và không tạo PDF giả. Bạn vẫn có thể xuất .tex hoặc .zip.",
      501,
    );
  }
  const { structure, assets, assetPaths } = await projectExportContext(ownerId, projectId);
  const payloadAssets: Array<{ path: string; base64: string }> = [];
  for (const asset of assets) {
    const path = assetPaths[asset.id];
    if (!path) continue;
    const bytes = await readStoredFile(asset.storageKey);
    payloadAssets.push({ path, base64: Buffer.from(bytes).toString("base64") });
  }

  let response: Response;
  try {
    response = await fetch(`${config.url}/compile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({
        engine: config.engine,
        source: structure.project.latexSource,
        assets: payloadAssets,
        options: { shellEscape: false, network: false },
      }),
      signal: AbortSignal.timeout(150_000),
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    throw new AppError(
      "COMPILER_UNREACHABLE",
      timeout
        ? "Dịch vụ biên dịch không phản hồi trong thời gian cho phép."
        : "Không thể kết nối dịch vụ biên dịch LaTeX.",
      502,
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { message?: string; log?: string };
      detail = (body.message ?? body.log ?? "").slice(0, 800);
    } catch {
      detail = (await response.text()).slice(0, 800);
    }
    throw new AppError(
      "COMPILATION_FAILED",
      `Biên dịch LaTeX thất bại (HTTP ${response.status}).${detail ? ` ${detail}` : ""}`,
      422,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  let bytes: Uint8Array;
  if (contentType.includes("application/pdf")) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength < 5 || String.fromCharCode(...buffer.slice(0, 5)) !== "%PDF-") {
      throw new AppError("COMPILER_INVALID_OUTPUT", "Dịch vụ biên dịch trả về tệp không phải PDF hợp lệ.", 502);
    }
    if (buffer.byteLength > 30 * 1024 * 1024) {
      throw new AppError("COMPILER_OUTPUT_TOO_LARGE", "PDF vượt quá giới hạn 30 MB.", 502);
    }
    bytes = buffer;
  } else {
    const body = (await response.json()) as { pdfBase64?: string; ok?: boolean; message?: string };
    if (!body.pdfBase64) {
      throw new AppError(
        "COMPILER_INVALID_OUTPUT",
        body.message ?? "Dịch vụ biên dịch không trả về PDF.",
        502,
      );
    }
    bytes = new Uint8Array(Buffer.from(body.pdfBase64, "base64"));
    if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
      throw new AppError("COMPILER_INVALID_OUTPUT", "Dữ liệu trả về không phải PDF hợp lệ.", 502);
    }
  }
  return {
    filename: `${exportBaseName(structure.project)}.pdf`,
    mimeType: "application/pdf",
    bytes,
  };
}

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "@/services/db/local-store";
import type { ParsedAssetInput } from "@/types/document";
import { AppError } from "@/types/api";

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export function filesRoot(): string {
  return path.join(getDataDir(), "files");
}

function assertSegment(segment: string, label: string): string {
  if (!SAFE_SEGMENT.test(segment) || segment === "." || segment === "..") {
    throw new AppError("INVALID_STORAGE_PATH", `Đường dẫn ${label} không hợp lệ.`, 400);
  }
  return segment;
}

function resolveKey(key: string): string {
  const segments = key.split("/").filter(Boolean);
  if (segments.length < 3 || segments.length > 8) {
    throw new AppError("INVALID_STORAGE_PATH", "Đường dẫn tệp không hợp lệ.", 400);
  }
  for (const segment of segments) assertSegment(segment, "tệp");
  const root = filesRoot();
  const resolved = path.resolve(root, ...segments);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    throw new AppError("INVALID_STORAGE_PATH", "Đường dẫn tệp nằm ngoài kho lưu trữ.", 400);
  }
  return resolved;
}

export function originalFileKey(params: {
  ownerId: string;
  projectId: string;
  documentId: string;
  extension: string;
}): string {
  const extension = params.extension.startsWith(".")
    ? params.extension.toLowerCase()
    : `.${params.extension.toLowerCase()}`;
  if (!/^\.[a-z0-9]{1,8}$/.test(extension)) {
    throw new AppError("INVALID_FILE_TYPE", "Phần mở rộng tệp không hợp lệ.", 400);
  }
  return [
    assertSegment(params.ownerId, "chủ sở hữu"),
    assertSegment(params.projectId, "dự án"),
    assertSegment(params.documentId, "tài liệu"),
    `original${extension}`,
  ].join("/");
}

export async function saveStoredFile(key: string, data: Uint8Array): Promise<number> {
  const target = resolveKey(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  return data.byteLength;
}

export async function readStoredFile(key: string): Promise<Uint8Array> {
  try {
    const target = resolveKey(key);
    return new Uint8Array(await readFile(target));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("FILE_NOT_FOUND", "Không tìm thấy tệp đã lưu.", 404);
  }
}

export async function storedFileSize(key: string): Promise<number> {
  try {
    return (await stat(resolveKey(key))).size;
  } catch {
    return 0;
  }
}

export async function saveAssetFile(params: {
  ownerId: string;
  projectId: string;
  assetId: string;
  input: ParsedAssetInput;
}): Promise<{ storageKey: string; sizeBytes: number }> {
  const extFromName = path.extname(params.input.filename).toLowerCase();
  const ext =
    /^\.[a-z0-9]{1,8}$/.test(extFromName)
      ? extFromName
      : params.input.mimeType === "image/png"
        ? ".png"
        : params.input.mimeType === "image/jpeg"
          ? ".jpg"
          : ".bin";
  const key = [
    assertSegment(params.ownerId, "chủ sở hữu"),
    assertSegment(params.projectId, "dự án"),
    "assets",
    `${assertSegment(params.assetId, "asset")}${ext}`,
  ].join("/");
  const size = await saveStoredFile(key, params.input.data);
  return { storageKey: key, sizeBytes: size };
}

export async function saveExportFile(params: {
  ownerId: string;
  projectId: string;
  filename: string;
  data: Uint8Array;
}): Promise<{ storageKey: string; sizeBytes: number }> {
  const safeName = params.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const key = [
    assertSegment(params.ownerId, "chủ sở hữu"),
    assertSegment(params.projectId, "dự án"),
    "exports",
    `${Date.now()}-${safeName}`,
  ].join("/");
  const size = await saveStoredFile(key, params.data);
  return { storageKey: key, sizeBytes: size };
}

export interface AssetFile {
  filename: string;
  storageKey: string;
  mimeType: string;
}

export async function readProjectAssets(
  ownerId: string,
  projectId: string,
): Promise<Map<string, Uint8Array>> {
  const assets = new Map<string, Uint8Array>();
  const dir = path.join(filesRoot(), ownerId, projectId, "assets");
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const key = [ownerId, projectId, "assets", entry.name].join("/");
      assets.set(entry.name, await readStoredFile(key));
    }
  } catch {
    // No assets directory is a valid state.
  }
  return assets;
}

export async function deleteProjectFiles(ownerId: string, projectId: string): Promise<void> {
  const target = path.resolve(filesRoot(), ownerId, projectId);
  const root = path.resolve(filesRoot());
  if (!target.startsWith(root + path.sep)) return;
  await rm(target, { recursive: true, force: true });
}

export async function ownerStorageUsage(ownerId: string): Promise<number> {
  const dir = path.join(filesRoot(), ownerId);
  async function walk(current: string): Promise<number> {
    try {
      const entries = await readdir(current, { withFileTypes: true });
      let total = 0;
      for (const entry of entries) {
        const target = path.join(current, entry.name);
        if (entry.isDirectory()) total += await walk(target);
        else if (entry.isFile()) total += (await stat(target)).size;
      }
      return total;
    } catch {
      return 0;
    }
  }
  return walk(dir);
}

export function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return ".pdf";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return ".docx";
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    default:
      return ".bin";
  }
}

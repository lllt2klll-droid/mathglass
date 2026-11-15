import JSZip from "jszip";
import type { SourceType } from "@/types/document";
import { AppError } from "@/types/api";
import { getMaxUploadBytes } from "@/config/site";

export interface DetectedFile {
  mimeType: string;
  type: SourceType;
  extension: string;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

export function isPdfSignature(bytes: Uint8Array): boolean {
  const header = ascii(bytes, 0, Math.min(bytes.length, 1024));
  return header.includes("%PDF-");
}

export function isZipSignature(bytes: Uint8Array): boolean {
  return (
    hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    hasPrefix(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    hasPrefix(bytes, [0x50, 0x4b, 0x07, 0x08])
  );
}

export function isPngSignature(bytes: Uint8Array): boolean {
  return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

export function isJpegSignature(bytes: Uint8Array): boolean {
  return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
}

export interface DocxValidation {
  valid: boolean;
  reason?: string;
}

/** ZIP-bomb and structure checks for OOXML packages. */
export async function validateDocxPackage(bytes: Uint8Array): Promise<DocxValidation> {
  if (!isZipSignature(bytes)) return { valid: false, reason: "Không phải tệp ZIP/OOXML hợp lệ." };
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return { valid: false, reason: "Không thể mở gói DOCX. Tệp có thể bị hỏng hoặc được mã hóa." };
  }

  const entries = Object.values(zip.files);
  if (entries.length > 4000) {
    return { valid: false, reason: "Gói DOCX chứa quá nhiều thành phần." };
  }
  let uncompressed = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    if (entry.name.startsWith("/") || entry.name.includes("..")) {
      return { valid: false, reason: "Gói DOCX chứa đường dẫn không an toàn." };
    }
    const data = entry as JSZip.JSZipObject & { _data?: { uncompressedSize?: number } };
    uncompressed += data._data?.uncompressedSize ?? 0;
  }
  if (uncompressed > 200 * 1024 * 1024) {
    return { valid: false, reason: "Gói DOCX giải nén vượt quá giới hạn 200 MB." };
  }
  if (!zip.file("[Content_Types].xml") || !zip.file("word/document.xml")) {
    return { valid: false, reason: "Gói ZIP không phải tài liệu Word (.docx) hợp lệ." };
  }
  return { valid: true };
}

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

export async function detectFile(
  bytes: Uint8Array,
  filename: string,
): Promise<DetectedFile> {
  if (bytes.byteLength === 0) {
    throw new AppError("EMPTY_FILE", "Tệp rỗng.", 400);
  }
  if (bytes.byteLength > getMaxUploadBytes()) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `Tệp vượt quá giới hạn ${Math.round(getMaxUploadBytes() / (1024 * 1024))} MB.`,
      413,
    );
  }

  const extension = extensionOf(filename);
  if (isPdfSignature(bytes)) {
    if (extension && extension !== ".pdf") {
      throw new AppError(
        "FILE_TYPE_MISMATCH",
        "Nội dung tệp là PDF nhưng phần mở rộng không phải .pdf. Hãy đổi tên hoặc xuất lại tệp.",
        400,
      );
    }
    return { mimeType: "application/pdf", type: "pdf", extension: ".pdf" };
  }
  if (isPngSignature(bytes)) {
    if (extension && ![".png"].includes(extension)) {
      throw new AppError("FILE_TYPE_MISMATCH", "Nội dung tệp là PNG nhưng phần mở rộng không khớp.", 400);
    }
    return { mimeType: "image/png", type: "image", extension: ".png" };
  }
  if (isJpegSignature(bytes)) {
    if (extension && ![".jpg", ".jpeg"].includes(extension)) {
      throw new AppError("FILE_TYPE_MISMATCH", "Nội dung tệp là JPEG nhưng phần mở rộng không khớp.", 400);
    }
    return { mimeType: "image/jpeg", type: "image", extension: ".jpg" };
  }
  if (isZipSignature(bytes)) {
    const validation = await validateDocxPackage(bytes);
    if (!validation.valid) {
      throw new AppError("INVALID_DOCX", validation.reason ?? "Tệp DOCX không hợp lệ.", 400);
    }
    if (extension && extension !== ".docx") {
      throw new AppError(
        "FILE_TYPE_MISMATCH",
        "Nội dung tệp là DOCX nhưng phần mở rộng không phải .docx.",
        400,
      );
    }
    return {
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      type: "docx",
      extension: ".docx",
    };
  }
  throw new AppError(
    "UNSUPPORTED_FILE_TYPE",
    "Định dạng không được hỗ trợ. MathGlass nhận PDF, DOCX, PNG và JPG.",
    415,
  );
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export function readImageDimensions(bytes: Uint8Array, mimeType: string): ImageDimensions | null {
  try {
    if (mimeType === "image/png" && bytes.length >= 24) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (mimeType === "image/jpeg") {
      let offset = 2;
      while (offset < bytes.length - 9) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = bytes[offset + 1];
        if (marker === 0xd8 || marker === 0xd9) {
          offset += 2;
          continue;
        }
        const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
        if (length < 2) break;
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
          const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
          return { width, height };
        }
        offset += 2 + length;
      }
    }
  } catch {
    return null;
  }
  return null;
}

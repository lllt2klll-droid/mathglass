import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { AppError } from "@/types/api";

function encryptionKey(): Buffer {
  const secret =
    process.env.MATHGLASS_ENCRYPTION_SECRET ??
    process.env.MATHGLASS_SESSION_SECRET ??
    "mathglass-development-encryption-secret-do-not-use-in-production";
  if (secret.length < 16) {
    throw new AppError(
      "ENCRYPTION_NOT_CONFIGURED",
      "MATHGLASS_ENCRYPTION_SECRET chưa được cấu hình đúng (tối thiểu 16 ký tự).",
      500,
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string): string {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new AppError("SECRET_DECRYPT_FAILED", "Không thể đọc khóa API đã lưu.", 500);
  }
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const encrypted = Buffer.from(parts[3], "base64url");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    throw new AppError(
      "SECRET_DECRYPT_FAILED",
      "Không thể giải mã khóa API. Có thể MATHGLASS_ENCRYPTION_SECRET đã thay đổi.",
      500,
    );
  }
}

export function maskSecret(value: string | null): string {
  if (!value) return "";
  return "••••••••";
}

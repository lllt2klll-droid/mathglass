import mammoth from "mammoth";

/**
 * Last-resort text extraction. It is intentionally explicit in the UI that
 * this path can lose equations and formatting.
 */
export async function mammothRawTextFallback(buffer: Uint8Array): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return result.value;
}

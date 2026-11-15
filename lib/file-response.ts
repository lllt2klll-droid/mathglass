import { contentDisposition } from "@/services/export/export-project";

export function fileResponse(input: {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  disposition?: "inline" | "attachment";
  cacheControl?: string;
}): Response {
  const body = new Uint8Array(input.bytes);
  return new Response(body as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": input.mimeType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": contentDisposition(
        input.disposition ?? "attachment",
        input.filename,
      ),
      "Cache-Control": input.cacheControl ?? "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

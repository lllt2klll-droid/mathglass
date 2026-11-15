import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const target = join(root, "public", "pdf.worker.min.mjs");

if (!existsSync(source)) {
  console.warn("[mathglass] pdf.js worker not found; skipping copy.");
  process.exit(0);
}

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log("[mathglass] copied pdf.js worker to public/pdf.worker.min.mjs");

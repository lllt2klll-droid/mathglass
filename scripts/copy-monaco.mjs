import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "node_modules", "monaco-editor", "min", "vs");
const target = join(root, "public", "monaco", "vs");

if (!existsSync(source)) {
  console.warn("[mathglass] monaco-editor assets not found; skipping copy.");
  process.exit(0);
}

await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true, force: true });
console.log("[mathglass] copied monaco assets to public/monaco/vs");

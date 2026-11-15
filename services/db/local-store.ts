import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { emptyDb, type DbFile } from "./types";

interface DatabaseGlobal {
  __mathglassDbState?: {
    data: DbFile | null;
    queue: Promise<unknown>;
  };
}

const globalState = globalThis as unknown as DatabaseGlobal;

function state() {
  if (!globalState.__mathglassDbState) {
    globalState.__mathglassDbState = { data: null, queue: Promise.resolve() };
  }
  return globalState.__mathglassDbState;
}

export function getDataDir(): string {
  if (process.env.MATHGLASS_DATA_DIR) {
    return path.resolve(process.env.MATHGLASS_DATA_DIR);
  }
  if (process.env.VERCEL) {
    return "/tmp/mathglass-data";
  }
  return path.join(process.cwd(), ".data");
}

export function isEphemeralStorage(): boolean {
  if (process.env.MATHGLASS_DATA_DIR) {
    const resolved = path.resolve(process.env.MATHGLASS_DATA_DIR);
    return resolved.startsWith("/tmp") || resolved.startsWith("/var/tmp");
  }
  return Boolean(process.env.VERCEL);
}

function dbPath(): string {
  return path.join(getDataDir(), "db.json");
}

async function load(): Promise<DbFile> {
  const current = state();
  if (current.data) return current.data;

  await mkdir(getDataDir(), { recursive: true });
  try {
    const raw = await readFile(dbPath(), "utf8");
    const parsed = JSON.parse(raw) as DbFile;
    if (parsed.schemaVersion !== 1) {
      throw new Error(
        `Unsupported database schema ${String(parsed.schemaVersion)}. Expected 1.`,
      );
    }
    current.data = parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      current.data = emptyDb();
      await persist(current.data);
    } else {
      throw error;
    }
  }
  return current.data;
}

async function persist(data: DbFile): Promise<void> {
  await mkdir(getDataDir(), { recursive: true });
  const target = dbPath();
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, JSON.stringify(data), "utf8");
  await rename(temp, target);
}

/** Read-only snapshot. Safe to serialize; mutations must go through mutateDb. */
export async function readDb(): Promise<DbFile> {
  const current = state();
  await current.queue.catch(() => undefined);
  const data = await load();
  return structuredClone(data);
}

/** Serialized read-modify-write with atomic persistence. */
export async function mutateDb<T>(mutator: (data: DbFile) => T | Promise<T>): Promise<T> {
  const current = state();
  const operation = current.queue
    .catch(() => undefined)
    .then(async () => {
      const data = await load();
      const snapshot = structuredClone(data);
      try {
        const result = await mutator(data);
        await persist(data);
        return result;
      } catch (error) {
        current.data = snapshot;
        throw error;
      }
    });

  current.queue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

export async function databaseInfo(): Promise<{
  path: string;
  exists: boolean;
  sizeBytes: number;
  ephemeral: boolean;
}> {
  const data = await readDb();
  let sizeBytes = 0;
  try {
    const raw = await readFile(dbPath(), "utf8");
    sizeBytes = Buffer.byteLength(raw, "utf8");
  } catch {
    sizeBytes = 0;
  }
  return {
    path: dbPath(),
    exists: data.projects.length >= 0,
    sizeBytes,
    ephemeral: isEphemeralStorage(),
  };
}

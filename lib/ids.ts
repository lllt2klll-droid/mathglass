export function newId(): string {
  return crypto.randomUUID();
}

export function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function assertSafeId(value: string, label = "id"): string {
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

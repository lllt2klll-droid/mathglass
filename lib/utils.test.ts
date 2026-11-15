import { describe, expect, it } from "vitest";
import { formatBytes, safeFilename, stripExtension, truncate } from "./utils";

describe("formatBytes", () => {
  it("formats byte sizes", () => {
    expect(formatBytes(0)).toContain("0");
    expect(formatBytes(1024)).toMatch(/1/);
    expect(formatBytes(5 * 1024 * 1024)).toMatch(/5/);
  });
});

describe("stripExtension", () => {
  it("removes the last extension", () => {
    expect(stripExtension("bai-tap.pdf")).toBe("bai-tap");
    expect(stripExtension("archive.tar.gz")).toBe("archive.tar");
    expect(stripExtension("noext")).toBe("noext");
  });
});

describe("safeFilename", () => {
  it("sanitizes unsafe characters", () => {
    const result = safeFilename("a/b\\c:d*e?.pdf");
    expect(result).not.toMatch(/[/\\:*?]/);
  });

  it("falls back for empty input", () => {
    expect(safeFilename("")).toBe("document");
  });
});

describe("truncate", () => {
  it("truncates long strings", () => {
    expect(truncate("short")).toBe("short");
    expect(truncate("x".repeat(200), 50)).toHaveLength(50);
  });
});

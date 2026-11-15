import { describe, expect, it } from "vitest";
import {
  escapeLatexText,
  inlinesToLatex,
  inlinesToPlainText,
  stripLeadingQuestionLabel,
} from "./escape";
import type { InlineNode } from "@/types/document";

describe("escapeLatexText", () => {
  it("escapes LaTeX special characters", () => {
    expect(escapeLatexText("100% & $5 #tag")).toBe("100\\% \\& \\$5 \\#tag");
    expect(escapeLatexText("a_b {c}")).toBe("a\\_b \\{c\\}");
  });

  it("converts unicode dashes and quotes", () => {
    expect(escapeLatexText("a–b—c")).toBe("a--b---c");
    expect(escapeLatexText("“xin” ‘chào’")).toBe("``xin'' `chào'");
  });

  it("preserves plain unicode text", () => {
    expect(escapeLatexText("Phương trình bậc hai")).toBe("Phương trình bậc hai");
  });
});

describe("inlinesToLatex", () => {
  const assetPath = () => "assets/img1.png";

  it("renders text, math and linebreak inlines", () => {
    const inlines: InlineNode[] = [
      { type: "text", text: "Cho " },
      { type: "math", latex: "x^2 + 1 = 0" },
      { type: "linebreak" },
      { type: "text", text: "với ", bold: true },
      { type: "text", text: "x ∈ ℝ" },
    ];
    const output = inlinesToLatex(inlines, { assetPath });
    expect(output).toContain("$x^2 + 1 = 0$");
    expect(output).toContain("\\newline{}");
    expect(output).toContain("\\textbf{với }");
  });

  it("renders missing assets as a placeholder", () => {
    const missing: string[] = [];
    const inlines: InlineNode[] = [
      { type: "image", assetId: "a1", filename: "hinh.png", alt: "", mimeType: "image/png" },
    ];
    const output = inlinesToLatex(inlines, {
      assetPath: () => null,
      onMissingAsset: (id, filename) => missing.push(`${id}:${filename}`),
    });
    expect(output).toContain("Thiếu tệp hình ảnh");
    expect(missing).toEqual(["a1:hinh.png"]);
  });
});

describe("inlinesToPlainText", () => {
  it("flattens inlines to readable text", () => {
    const inlines: InlineNode[] = [
      { type: "text", text: "Câu 1: " },
      { type: "math", latex: "E=mc^2" },
      { type: "linebreak" },
    ];
    expect(inlinesToPlainText(inlines)).toBe("Câu 1: E=mc^2\n");
  });
});

describe("stripLeadingQuestionLabel", () => {
  it("detects Vietnamese and numeric question labels", () => {
    expect(stripLeadingQuestionLabel("Câu 3: Tính tích phân")).toEqual({
      label: "Câu 3:",
      rest: "Tính tích phân",
    });
    expect(stripLeadingQuestionLabel("12. Đáp án")).toEqual({
      label: "12.",
      rest: "Đáp án",
    });
    expect(stripLeadingQuestionLabel("Không có nhãn")).toBeNull();
  });
});

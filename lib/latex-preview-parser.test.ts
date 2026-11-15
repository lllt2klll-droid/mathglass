import { describe, expect, it } from "vitest";
import { parseLatexPreview } from "./latex-preview-parser";

describe("parseLatexPreview", () => {
  it("parses a section heading and paragraph", () => {
    const blocks = parseLatexPreview(
      "\\section{Giới thiệu}\nNội dung bài học về phương trình bậc hai.",
    );
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(blocks[1]).toMatchObject({ type: "paragraph" });
  });

  it("parses inline math delimiters", () => {
    const blocks = parseLatexPreview("Giá trị $x = 5$ là nghiệm.");
    const paragraph = blocks.find((block) => block.type === "paragraph");
    expect(paragraph).toBeDefined();
    if (paragraph?.type !== "paragraph") return;
    const math = paragraph.inlines.find((inline) => inline.type === "math");
    expect(math).toMatchObject({ type: "math", latex: "x = 5" });
  });

  it("parses display math environments", () => {
    const blocks = parseLatexPreview("\\[\\frac{a}{b} = c\\]");
    expect(blocks.some((block) => block.type === "math")).toBe(true);
  });

  it("parses itemize lists", () => {
    const blocks = parseLatexPreview("\\begin{itemize}\n\\item Một\n\\item Hai\n\\end{itemize}");
    const list = blocks.find((block) => block.type === "list");
    expect(list).toMatchObject({ type: "list", ordered: false });
    if (list?.type === "list") expect(list.items.length).toBe(2);
  });

  it("parses tabular environments into tables", () => {
    const blocks = parseLatexPreview(
      "\\begin{tabular}{|c|c|}\n\\hline\na & b \\\\\n\\hline\n\\end{tabular}",
    );
    expect(blocks.some((block) => block.type === "table")).toBe(true);
  });

  it("ignores hidden preamble commands", () => {
    const blocks = parseLatexPreview(
      "\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nXin chào\n\\end{document}",
    );
    const texts = blocks
      .filter((block) => block.type === "paragraph")
      .map((block) => (block.type === "paragraph" ? block.inlines : []));
    expect(JSON.stringify(texts)).toContain("Xin chào");
    expect(JSON.stringify(blocks)).not.toContain("documentclass");
  });

  it("returns an empty array for empty input", () => {
    expect(parseLatexPreview("")).toEqual([]);
    expect(parseLatexPreview("   \n  ")).toEqual([]);
  });
});

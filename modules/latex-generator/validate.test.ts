import { describe, expect, it } from "vitest";
import { validateLatex } from "./validate";

const WRAPPER = (body: string) => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}`;

describe("validateLatex", () => {
  it("accepts a minimal valid document", () => {
    const result = validateLatex(WRAPPER("Xin chào $x=1$."));
    expect(result.valid).toBe(true);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("flags missing \\begin{document}", () => {
    const result = validateLatex("\\section{A}\nText");
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "LATEX_NO_DOCUMENT")).toBe(true);
  });

  it("flags unmatched braces", () => {
    const result = validateLatex(WRAPPER("Text {unclosed"));
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "LATEX_UNCLOSED_BRACE")).toBe(true);
  });

  it("flags unbalanced inline math dollars", () => {
    const result = validateLatex(WRAPPER("Giá trị $x = 5 và $y = 2"));
    // 4 dollars is balanced; use odd count instead
    const odd = validateLatex(WRAPPER("Giá trị $x = 5"));
    expect(odd.valid).toBe(false);
    expect(odd.diagnostics.some((d) => d.code === "LATEX_UNCLOSED_MATH")).toBe(true);
    expect(result.valid).toBe(true);
  });

  it("flags environment mismatch", () => {
    const result = validateLatex(WRAPPER("\\begin{itemize}\n\\item a\n\\end{enumerate}"));
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "LATEX_ENV_MISMATCH")).toBe(true);
  });

  it("blocks shell-escape commands", () => {
    const result = validateLatex(WRAPPER("\\write18{rm -rf /}"));
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "LATEX_SHELL_BLOCKED")).toBe(true);
  });

  it("warns about file includes", () => {
    const result = validateLatex(WRAPPER("\\input{secret}"));
    expect(result.diagnostics.some((d) => d.code === "LATEX_FILE_INCLUDE")).toBe(true);
  });

  it("reports referenced assets", () => {
    const result = validateLatex(
      WRAPPER("\\includegraphics{fig1.png}"),
      { knownAssets: ["fig1.png"] },
    );
    expect(result.referencedAssets).toContain("fig1.png");
    expect(result.diagnostics.some((d) => d.code === "LATEX_ASSET_NOT_FOUND")).toBe(false);

    const missing = validateLatex(WRAPPER("\\includegraphics{fig2.png}"), {
      knownAssets: ["fig1.png"],
    });
    expect(missing.diagnostics.some((d) => d.code === "LATEX_ASSET_NOT_FOUND")).toBe(true);
  });
});

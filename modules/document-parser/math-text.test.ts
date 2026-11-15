import { describe, expect, it } from "vitest";
import {
  detectEquation,
  looksLikeDisplayEquation,
  scoreAsMathExpression,
  textToLatexMath,
} from "./math-text";

describe("scoreAsMathExpression", () => {
  it("scores math-like strings higher than prose", () => {
    expect(scoreAsMathExpression("x^2 + 2x + 1 = 0")).toBeGreaterThan(
      scoreAsMathExpression("Hôm nay chúng ta học về phương trình bậc hai rất quan trọng"),
    );
  });

  it("returns 0 for very short input", () => {
    expect(scoreAsMathExpression("x=")).toBe(0);
  });
});

describe("looksLikeDisplayEquation", () => {
  it("detects display equations", () => {
    expect(looksLikeDisplayEquation("x^2 + 2x + 1 = 0")).toBe(true);
    expect(looksLikeDisplayEquation("∫₀¹ x² dx = 1/3")).toBe(true);
  });

  it("rejects prose sentences", () => {
    expect(
      looksLikeDisplayEquation("Giáo viên hướng dẫn học sinh cách giải bài toán này"),
    ).toBe(false);
  });
});

describe("textToLatexMath", () => {
  it("converts unicode minus and superscripts", () => {
    const output = textToLatexMath("x² − 3x + 2 = 0");
    expect(output).toContain("^");
    expect(output).not.toContain("−");
  });

  it("converts sqrt symbol", () => {
    expect(textToLatexMath("√x")).toContain("\\sqrt");
  });
});

describe("detectEquation", () => {
  it("returns latex and confidence for equations", () => {
    const result = detectEquation("x^2 + 2x + 1 = 0");
    expect(result).not.toBeNull();
    expect(result?.isEquation).toBe(true);
    expect(result?.latex.length).toBeGreaterThan(0);
    expect(result?.confidence).toBeGreaterThan(0);
  });

  it("returns null for non-equations", () => {
    expect(detectEquation("Đây là một câu văn bình thường trong tài liệu")).toBeNull();
  });
});

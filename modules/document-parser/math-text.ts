/**
 * Conservative conversion helpers for mathematical text extracted from a
 * digital text layer. These helpers never infer missing digits or answers;
 * they only normalize symbols that are present in the source.
 */

const MATH_SYMBOLS: Record<string, string> = {
  "≤": "\\le",
  "⩽": "\\le",
  "≥": "\\ge",
  "⩾": "\\ge",
  "≠": "\\ne",
  "≈": "\\approx",
  "≡": "\\equiv",
  "±": "\\pm",
  "∓": "\\mp",
  "×": "\\times",
  "÷": "\\div",
  "·": "\\cdot",
  "∙": "\\cdot",
  "√": "\\sqrt",
  "∑": "\\sum",
  "∏": "\\prod",
  "∫": "\\int",
  "∬": "\\iint",
  "∞": "\\infty",
  "π": "\\pi",
  "α": "\\alpha",
  "β": "\\beta",
  "γ": "\\gamma",
  "δ": "\\delta",
  "ε": "\\varepsilon",
  "θ": "\\theta",
  "λ": "\\lambda",
  "μ": "\\mu",
  "σ": "\\sigma",
  "φ": "\\varphi",
  "ω": "\\omega",
  "Δ": "\\Delta",
  "Ω": "\\Omega",
  "→": "\\to",
  "⇒": "\\Rightarrow",
  "⇔": "\\Leftrightarrow",
  "↔": "\\leftrightarrow",
  "∈": "\\in",
  "∉": "\\notin",
  "⊂": "\\subset",
  "⊃": "\\supset",
  "⊆": "\\subseteq",
  "⊇": "\\supseteq",
  "∪": "\\cup",
  "∩": "\\cap",
  "∅": "\\varnothing",
  "∀": "\\forall",
  "∃": "\\exists",
  "∠": "\\angle",
  "△": "\\triangle",
  "⊥": "\\perp",
  "∥": "\\parallel",
  "≅": "\\cong",
  "∼": "\\sim",
  "°": "^{\\circ}",
  "′": "'",
  "″": "''",
  "ℝ": "\\mathbb{R}",
  "ℤ": "\\mathbb{Z}",
  "ℕ": "\\mathbb{N}",
  "ℚ": "\\mathbb{Q}",
  "ℂ": "\\mathbb{C}",
};

const SUPERSCRIPTS: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁺": "+",
  "⁻": "-",
  "ⁿ": "n",
  "ⁱ": "i",
};

const SUBSCRIPTS: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
  "₊": "+",
  "₋": "-",
  "ₙ": "n",
  "ᵢ": "i",
};

const MATH_CHARACTERS = /[0-9a-zA-Zα-ωΑ-Ωπ∞∑∏∫√≤≥≠≈±×÷·=+\-−*/^_(){}\[\]<>|,.:%°′]/g;

function escapeMathLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\backslash ")
    .replace(/([{}%$&#])/g, "\\$1")
    .replace(/_/g, "\\_");
}

function replaceSuperscripts(input: string): string {
  return input.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱ]+/g, (match) => {
    const converted = [...match].map((character) => SUPERSCRIPTS[character] ?? "").join("");
    return converted ? `^{${converted}}` : match;
  });
}

function replaceSubscripts(input: string): string {
  return input.replace(/[₀₁₂₃₄₅₆₇₈₉₊₋ₙᵢ]+/g, (match) => {
    const converted = [...match].map((character) => SUBSCRIPTS[character] ?? "").join("");
    return converted ? `_{${converted}}` : match;
  });
}

function replaceFractions(input: string): string {
  // Only atomic numeric/variable fractions and parenthesized groups are
  // converted. This avoids changing operator precedence for ambiguous input.
  return input.replace(
    /(^|[\s(=+\-−*/])(\([^()\n]{1,40}\)|[0-9]+(?:\.[0-9]+)?|[a-zA-Z])\s*\/\s*(\([^()\n]{1,40}\)|[0-9]+(?:\.[0-9]+)?|[a-zA-Z])(?=$|[\s)=+\-−*/.,;:])/g,
    (_match, prefix: string, numerator: string, denominator: string) => {
      const clean = (value: string) =>
        value.startsWith("(") && value.endsWith(")") ? value.slice(1, -1) : value;
      return `${prefix}\\frac{${clean(numerator)}}{${clean(denominator)}}`;
    },
  );
}

/** Converts present Unicode math symbols to LaTeX while preserving digits. */
export function textToLatexMath(input: string): string {
  let output = replaceSuperscripts(input.normalize("NFC"));
  output = replaceSubscripts(output);
  output = output.replace(/[−–]/g, "-");
  let escaped = "";
  for (const character of output) {
    if (MATH_SYMBOLS[character]) {
      const command = MATH_SYMBOLS[character];
      escaped += command === "\\sqrt" ? "\\sqrt{}" : command;
      continue;
    }
    if (character === "√") {
      escaped += "\\sqrt{}";
      continue;
    }
    escaped += escapeMathLiteral(character);
  }
  escaped = escaped.replace(/\\sqrt\{\}\s*([0-9a-zA-Z])/g, "\\sqrt{$1}");
  escaped = replaceFractions(escaped);
  return escaped.trim();
}

/**
 * Produces an inline-safe LaTeX representation of normal text. Only symbols
 * that require math mode are wrapped in \ensuremath; words are untouched.
 */
export function textWithMathSymbolsToLatex(input: string): string {
  const escaped = input
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}%$&#_])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");

  return escaped.replace(
    /[≤⩽≥⩾≠≈≡±∓×÷·∙π∞→⇒⇔↔∈∉⊂⊃⊆⊇∪∩∅∀∃∠△⊥∥≅∼°ℝℤℕℚℂ]/g,
    (character) => `\\ensuremath{${MATH_SYMBOLS[character] ?? character}}`,
  );
}

export function scoreAsMathExpression(input: string): number {
  const text = input.trim();
  if (text.length < 3) return 0;
  const compact = text.replace(/\s+/g, "");
  if (!compact) return 0;
  const matches = compact.match(MATH_CHARACTERS)?.length ?? 0;
  const ratio = matches / compact.length;
  const hasOperator = /[=<>≤≥≈≠+\-−×÷*/√∑∫^_]/.test(text);
  const hasWord = /[a-zA-ZÀ-ỹ]{4,}/.test(text);
  let score = ratio;
  if (hasOperator) score += 0.16;
  if (/=/.test(text)) score += 0.08;
  if (hasWord) score -= 0.22;
  if (/[.!?]$/.test(text) && !/[=]$/.test(text)) score -= 0.08;
  return Math.max(0, Math.min(1, score));
}

export function looksLikeDisplayEquation(input: string): boolean {
  const text = input.trim();
  if (text.length < 5 || text.length > 260) return false;
  const score = scoreAsMathExpression(text);
  if (score < 0.62) return false;
  if (!/[=<>≤≥≈≠+\-−×÷*/√∑∫]/.test(text)) return false;
  const words = text.match(/[A-Za-zÀ-ỹ]{4,}/g) ?? [];
  return words.length <= 3;
}

export interface MathDetection {
  isEquation: boolean;
  latex: string;
  confidence: number;
}

export function detectEquation(input: string): MathDetection | null {
  if (!looksLikeDisplayEquation(input)) return null;
  const score = scoreAsMathExpression(input);
  return {
    isEquation: true,
    latex: textToLatexMath(input),
    confidence: Math.min(0.86, 0.52 + score * 0.34),
  };
}

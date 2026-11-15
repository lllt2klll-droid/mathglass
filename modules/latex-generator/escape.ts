import type { InlineNode } from "@/types/document";

const TEXT_SYMBOLS: Record<string, string> = {
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
  "∞": "\\infty",
  "π": "\\pi",
  "α": "\\alpha",
  "β": "\\beta",
  "γ": "\\gamma",
  "δ": "\\delta",
  "ε": "\\varepsilon",
  "ζ": "\\zeta",
  "η": "\\eta",
  "θ": "\\theta",
  "ι": "\\iota",
  "κ": "\\kappa",
  "λ": "\\lambda",
  "μ": "\\mu",
  "ν": "\\nu",
  "ξ": "\\xi",
  "ρ": "\\rho",
  "σ": "\\sigma",
  "τ": "\\tau",
  "υ": "\\upsilon",
  "φ": "\\varphi",
  "χ": "\\chi",
  "ψ": "\\psi",
  "ω": "\\omega",
  "Γ": "\\Gamma",
  "Δ": "\\Delta",
  "Θ": "\\Theta",
  "Λ": "\\Lambda",
  "Ξ": "\\Xi",
  "Π": "\\Pi",
  "Σ": "\\Sigma",
  "Φ": "\\Phi",
  "Ψ": "\\Psi",
  "Ω": "\\Omega",
  "→": "\\to",
  "←": "\\leftarrow",
  "↔": "\\leftrightarrow",
  "⇒": "\\Rightarrow",
  "⇐": "\\Leftarrow",
  "⇔": "\\Leftrightarrow",
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
  "□": "\\square",
  "⊥": "\\perp",
  "∥": "\\parallel",
  "≅": "\\cong",
  "∼": "\\sim",
  "≃": "\\simeq",
  "≪": "\\ll",
  "≫": "\\gg",
  "∂": "\\partial",
  "∇": "\\nabla",
  "∝": "\\propto",
  "°": "^\\circ",
  "′": "'",
  "″": "''",
  "ℝ": "\\mathbb{R}",
  "ℤ": "\\mathbb{Z}",
  "ℕ": "\\mathbb{N}",
  "ℚ": "\\mathbb{Q}",
  "ℂ": "\\mathbb{C}",
  "∑": "\\sum",
  "∏": "\\prod",
  "∫": "\\int",
  "∬": "\\iint",
  "∭": "\\iiint",
  "∮": "\\oint",
  "√": "\\surd",
  "⋯": "\\cdots",
  "⋮": "\\vdots",
  "⋱": "\\ddots",
  "∖": "\\setminus",
  "†": "\\dagger",
  "‡": "\\ddagger",
  "§": "\\S",
  "¶": "\\P",
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

function convertScripts(input: string): string {
  let output = input.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱ]+/g, (match) => {
    const value = [...match].map((character) => SUPERSCRIPTS[character] ?? "").join("");
    return value ? `\\ensuremath{^{${value}}}` : "";
  });
  output = output.replace(/[₀₁₂₃₄₅₆₇₈₉₊₋ₙᵢ]+/g, (match) => {
    const value = [...match].map((character) => SUBSCRIPTS[character] ?? "").join("");
    return value ? `\\ensuremath{_{${value}}}` : "";
  });
  return output;
}

/**
 * Escapes plain text for XeLaTeX while preserving every visible character.
 * Present Unicode mathematical symbols are wrapped in \ensuremath.
 */
export function escapeLatexText(input: string): string {
  const normalized = convertScripts(
    input
      .normalize("NFC")
      .replace(/\u200b|\u200c|\u200d|\ufeff/g, "")
      .replace(/\u00a0/g, "~")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ""),
  );

  let output = "";
  for (const character of normalized) {
    if (TEXT_SYMBOLS[character]) {
      output += `\\ensuremath{${TEXT_SYMBOLS[character]}}`;
      continue;
    }
    switch (character) {
      case "\\":
        output += "\\textbackslash{}";
        break;
      case "{":
        output += "\\{";
        break;
      case "}":
        output += "\\}";
        break;
      case "$":
        output += "\\$";
        break;
      case "&":
        output += "\\&";
        break;
      case "#":
        output += "\\#";
        break;
      case "%":
        output += "\\%";
        break;
      case "_":
        output += "\\_";
        break;
      case "^":
        output += "\\textasciicircum{}";
        break;
      case "~":
        output += "\\textasciitilde{}";
        break;
      case "…":
        output += "\\ldots{}";
        break;
      case "•":
        output += "\\textbullet{}";
        break;
      case "–":
        output += "--";
        break;
      case "—":
        output += "---";
        break;
      case "“":
        output += "``";
        break;
      case "”":
        output += "''";
        break;
      case "‘":
        output += "`";
        break;
      case "’":
        output += "'";
        break;
      case "«":
        output += "\\guillemotleft{}";
        break;
      case "»":
        output += "\\guillemotright{}";
        break;
      default:
        output += character;
    }
  }
  return output;
}

export interface AssetPathResolver {
  (assetId: string, filename?: string): string | null;
}

export interface InlineRenderOptions {
  assetPath: AssetPathResolver;
  onMissingAsset?: (assetId: string, filename: string) => void;
}

function applyTextMarks(text: string, inline: Extract<InlineNode, { type: "text" }>): string {
  let output = escapeLatexText(text);
  if (inline.code) output = `\\texttt{${output}}`;
  if (inline.underline) output = `\\underline{${output}}`;
  if (inline.italic) output = `\\textit{${output}}`;
  if (inline.bold) output = `\\textbf{${output}}`;
  if (inline.superscript) output = `\\textsuperscript{${output}}`;
  if (inline.subscript) output = `\\textsubscript{${output}}`;
  return output;
}

export function inlinesToLatex(
  inlines: InlineNode[],
  options: InlineRenderOptions,
): string {
  const parts: string[] = [];
  for (const inline of inlines) {
    switch (inline.type) {
      case "text": {
        if (inline.text) parts.push(applyTextMarks(inline.text, inline));
        break;
      }
      case "math": {
        const latex = inline.latex.trim();
        if (latex) parts.push(`$${latex}$`);
        break;
      }
      case "linebreak":
        parts.push("\\newline{}");
        break;
      case "image": {
        const path = options.assetPath(inline.assetId, inline.filename);
        if (!path) {
          options.onMissingAsset?.(inline.assetId, inline.filename);
          parts.push(`\\textit{[Thiếu tệp hình ảnh: ${escapeLatexText(inline.filename)}]}`);
        } else {
          parts.push(`\\includegraphics[width=0.35\\linewidth]{\\detokenize{${path}}}`);
        }
        break;
      }
    }
  }
  return parts.join("");
}

export function inlinesToPlainText(inlines: InlineNode[]): string {
  return inlines
    .map((inline) => {
      if (inline.type === "text") return inline.text;
      if (inline.type === "math") return inline.latex;
      if (inline.type === "image") return `[${inline.filename}]`;
      return "\n";
    })
    .join("");
}

export function stripLeadingQuestionLabel(text: string): { label: string; rest: string } | null {
  const match = /^\s*((?:Câu|Bài|Question)\s*\d+[.:)]|\d+[.)])\s+/i.exec(text);
  if (!match) return null;
  return { label: match[1], rest: text.slice(match[0].length) };
}

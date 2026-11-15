import {
  childrenNamed,
  firstChild,
  getAttribute,
  nodeText,
  tagName,
  type OrderedNode,
} from "./xml";

export interface OmmlResult {
  latex: string;
  warnings: string[];
  unsupportedTags: string[];
}

const SYMBOLS: Record<string, string> = {
  "−": "-",
  "–": "-",
  "—": "-",
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
  "⇒": "\\Rightarrow",
  "⇐": "\\Leftarrow",
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
  "°": "^{\\circ}",
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
  "⋃": "\\bigcup",
  "⋂": "\\bigcap",
  "⋁": "\\bigvee",
  "⋀": "\\bigwedge",
  "↑": "\\uparrow",
  "↓": "\\downarrow",
  "⇑": "\\Uparrow",
  "⇓": "\\Downarrow",
  "⋯": "\\cdots",
  "…": "\\ldots",
  "⋮": "\\vdots",
  "⋱": "\\ddots",
  "ℏ": "\\hbar",
  "ℓ": "\\ell",
  "∖": "\\setminus",
  "†": "\\dagger",
  "‡": "\\ddagger",
  "§": "\\S",
  "¶": "\\P",
};

const TEXT_MODE_PATTERN = /[À-ỹ]|\s{1,}/;
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
};

const NARY_COMMANDS: Record<string, string> = {
  "∑": "\\sum",
  "∏": "\\prod",
  "∫": "\\int",
  "∬": "\\iint",
  "∭": "\\iiint",
  "∮": "\\oint",
  "⋃": "\\bigcup",
  "⋂": "\\bigcap",
  "⋁": "\\bigvee",
  "⋀": "\\bigwedge",
};

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}%$&#_])/g, "\\$1")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/~/g, "\\textasciitilde{}");
}

function needsTextMode(value: string): boolean {
  return TEXT_MODE_PATTERN.test(value);
}

function convertRunText(value: string): string {
  const normalized = value.replace(/[−–—]/g, "-").replace(/\u00a0/g, " ");
  if (!normalized) return "";
  if (needsTextMode(normalized)) {
    return `\\text{${escapeText(normalized.trim())}}`;
  }
  let output = "";
  for (const character of normalized) {
    if (SYMBOLS[character]) {
      output += `${SYMBOLS[character]} `;
    } else if (SUPERSCRIPTS[character]) {
      output += `^{${SUPERSCRIPTS[character]}}`;
    } else if (/[{}%$&#_\\]/.test(character)) {
      output += `\\${character}`;
    } else {
      output += character;
    }
  }
  return output;
}

class OmmlContext {
  warnings = new Set<string>();
  unsupportedTags = new Set<string>();

  warn(message: string) {
    if (this.warnings.size < 60) this.warnings.add(message);
  }

  unsupported(tag: string) {
    if (this.unsupportedTags.size < 40) this.unsupportedTags.add(tag);
    this.warn(`Cấu trúc OMML chưa được hỗ trợ đầy đủ: ${tag}. Nội dung bên trong vẫn được giữ lại.`);
  }
}

function childrenValue(node: OrderedNode, tag: string): OrderedNode[] {
  return childrenNamed(node, tag);
}

function convertContainer(node: OrderedNode, tag: string, ctx: OmmlContext): string {
  const children = childrenValue(node, tag);
  if (children.length === 0) {
    const direct = node["#text"];
    if (typeof direct === "string") return convertRunText(direct);
  }
  return convertNodes(children, ctx);
}

function runStyle(node: OrderedNode): string {
  const properties = firstChild(node, "rPr");
  if (!properties) return "";
  const style = firstChild(properties, "sty");
  return getAttribute(style, "val") ?? "";
}

function convertRun(node: OrderedNode, ctx: OmmlContext): string {
  const fragments = childrenValue(node, "t").map((textNode) => nodeText(textNode));
  if (fragments.length === 0) {
    const direct = nodeText(node);
    if (direct) fragments.push(direct);
  }
  const symbolNodes = childrenValue(node, "sym");
  for (const symbol of symbolNodes) {
    const char = getAttribute(symbol, "char");
    const font = getAttribute(symbol, "font");
    if (char) {
      const code = Number.parseInt(char, 16);
      if (Number.isFinite(code)) {
        const decoded = String.fromCodePoint(code);
        fragments.push(decoded);
        if (font && /symbol/i.test(font)) {
          ctx.warn("Ký hiệu từ font Symbol đã được chuyển theo bảng Unicode; hãy đối chiếu.");
        }
      }
    }
  }
  let value = fragments.join("");
  if (!value) return "";
  value = convertRunText(value);
  const style = runStyle(node);
  if (style === "p" && !value.startsWith("\\text{")) return `\\mathrm{${value}}`;
  if (style === "b") return `\\mathbf{${value}}`;
  if (style === "bi") return `\\boldsymbol{${value}}`;
  return value;
}

function wrap(value: string): string {
  return value ? value : "";
}

function delimiter(value: string | null, fallback: string): string {
  if (!value) return fallback;
  if (value === "") return ".";
  if (value === "{") return "\\{";
  if (value === "}") return "\\}";
  if (value === "⟨") return "\\langle";
  if (value === "⟩") return "\\rangle";
  if (value === "|") return "|";
  return value;
}

function convertFraction(node: OrderedNode, ctx: OmmlContext): string {
  const numerator = firstChild(node, "num");
  const denominator = firstChild(node, "den");
  if (!numerator || !denominator) ctx.warn("Phân số OMML thiếu tử số hoặc mẫu số.");
  return `\\frac{${numerator ? convertContainer(numerator, "num", ctx) : ""}}{${
    denominator ? convertContainer(denominator, "den", ctx) : ""
  }}`;
}

function convertRadical(node: OrderedNode, ctx: OmmlContext): string {
  const degree = firstChild(node, "deg");
  const expression = firstChild(node, "e");
  const body = expression ? convertContainer(expression, "e", ctx) : "";
  const degreeValue = degree ? convertContainer(degree, "deg", ctx) : "";
  return degreeValue.trim()
    ? `\\sqrt[${degreeValue.trim()}]{${body}}`
    : `\\sqrt{${body}}`;
}

function convertSupSub(node: OrderedNode, ctx: OmmlContext): string {
  const base = firstChild(node, "e");
  const sup = firstChild(node, "sup");
  const sub = firstChild(node, "sub");
  const baseValue = wrap(base ? convertContainer(base, "e", ctx) : "");
  const supValue = sup ? convertContainer(sup, "sup", ctx) : "";
  const subValue = sub ? convertContainer(sub, "sub", ctx) : "";
  return `{${baseValue}}${subValue ? `_{${subValue}}` : ""}${supValue ? `^{${supValue}}` : ""}`;
}

function convertPreSubSup(node: OrderedNode, ctx: OmmlContext): string {
  const base = firstChild(node, "e");
  const sup = firstChild(node, "sup");
  const sub = firstChild(node, "sub");
  return `{}_{${sub ? convertContainer(sub, "sub", ctx) : ""}}^{${
    sup ? convertContainer(sup, "sup", ctx) : ""
  }}${base ? convertContainer(base, "e", ctx) : ""}`;
}

function convertNary(node: OrderedNode, ctx: OmmlContext): string {
  const properties = firstChild(node, "naryPr");
  const chr = properties ? childrenValue(properties, "chr")[0] : null;
  const character = getAttribute(chr, "val") ?? "∫";
  const command = NARY_COMMANDS[character] ?? "\\int";
  const sub = firstChild(node, "sub");
  const sup = firstChild(node, "sup");
  const expression = firstChild(node, "e");
  const subValue = sub ? convertContainer(sub, "sub", ctx) : "";
  const supValue = sup ? convertContainer(sup, "sup", ctx) : "";
  const body = expression ? convertContainer(expression, "e", ctx) : "";
  return `${command}\\limits${subValue ? `_{${subValue}}` : ""}${supValue ? `^{${supValue}}` : ""} ${body}`;
}

function convertDelimiter(node: OrderedNode, ctx: OmmlContext): string {
  const properties = firstChild(node, "dPr");
  const beg = properties ? getAttribute(childrenValue(properties, "begChr")[0] ?? null, "val") : null;
  const end = properties ? getAttribute(childrenValue(properties, "endChr")[0] ?? null, "val") : null;
  const body = childrenValue(node, "e")
    .map((child) => convertContainer(child, "e", ctx))
    .join(" ");
  return `\\left${delimiter(beg, "(")}${body}\\right${delimiter(end, ")")}`;
}

const ACCENTS: Record<string, string> = {
  "ˆ": "\\hat",
  "^": "\\hat",
  "¯": "\\bar",
  "‾": "\\bar",
  "→": "\\vec",
  "~": "\\tilde",
  "˜": "\\tilde",
  "˙": "\\dot",
  "¨": "\\ddot",
  "ˇ": "\\check",
  "´": "\\acute",
  "`": "\\grave",
  "˘": "\\breve",
  "˚": "\\mathring",
};

function convertAccent(node: OrderedNode, ctx: OmmlContext): string {
  const properties = firstChild(node, "accPr");
  const chr = properties ? getAttribute(childrenValue(properties, "chr")[0] ?? null, "val") : null;
  const command = chr ? ACCENTS[chr] ?? "\\overset" : "\\hat";
  const base = firstChild(node, "e");
  const body = base ? convertContainer(base, "e", ctx) : "";
  if (command === "\\overset" && chr) return `\\overset{${convertRunText(chr)}}{${body}}`;
  return `${command}{${body}}`;
}

function convertBar(node: OrderedNode, ctx: OmmlContext): string {
  const properties = firstChild(node, "barPr");
  const position = properties ? getAttribute(childrenValue(properties, "pos")[0] ?? null, "val") : null;
  const base = firstChild(node, "e");
  const body = base ? convertContainer(base, "e", ctx) : "";
  return position === "bot" ? `\\underline{${body}}` : `\\overline{${body}}`;
}

function convertLimit(node: OrderedNode, ctx: OmmlContext, kind: "limLow" | "limUpp"): string {
  const base = firstChild(node, "e");
  const limit = firstChild(node, "lim");
  const baseValue = base ? convertContainer(base, "e", ctx) : "";
  const limitValue = limit ? convertContainer(limit, "lim", ctx) : "";
  return kind === "limLow"
    ? `\\underset{${limitValue}}{${baseValue}}`
    : `\\overset{${limitValue}}{${baseValue}}`;
}

function convertFunction(node: OrderedNode, ctx: OmmlContext): string {
  const name = firstChild(node, "fName");
  const argument = firstChild(node, "e");
  let nameValue = name ? convertContainer(name, "fName", ctx).trim() : "";
  const known = /^\\(sin|cos|tan|cot|sec|csc|log|ln|exp|lim|max|min|sup|inf|det|gcd|arcsin|arccos|arctan)$/;
  if (nameValue && !known.test(nameValue)) {
    if (!nameValue.startsWith("\\operatorname") && !nameValue.startsWith("\\mathrm")) {
      nameValue = `\\operatorname{${nodeText(name ?? node).trim() || "f"}}`;
    }
  }
  if (!nameValue) nameValue = "\\operatorname{f}";
  const argumentValue = argument ? convertContainer(argument, "e", ctx) : "";
  return `${nameValue}\\left(${argumentValue}\\right)`;
}

function convertGroupCharacter(node: OrderedNode, ctx: OmmlContext): string {
  const properties = firstChild(node, "groupChrPr");
  const chr = properties ? getAttribute(childrenValue(properties, "chr")[0] ?? null, "val") : null;
  const position = properties ? getAttribute(childrenValue(properties, "pos")[0] ?? null, "val") : null;
  const base = firstChild(node, "e");
  const body = base ? convertContainer(base, "e", ctx) : "";
  if (chr === "⏞" || position === "top") return `\\overbrace{${body}}`;
  if (chr === "⏟" || position === "bot") return `\\underbrace{${body}}`;
  return `\\underbrace{${body}}`;
}

function convertMatrix(node: OrderedNode, ctx: OmmlContext): string {
  const rows = childrenValue(node, "mr");
  const renderedRows = rows.map((row) =>
    childrenValue(row, "e")
      .map((cell) => convertContainer(cell, "e", ctx))
      .join(" & "),
  );
  return `\\begin{matrix}${renderedRows.join(" \\\\ ")}\\end{matrix}`;
}

function convertEquationArray(node: OrderedNode, ctx: OmmlContext): string {
  const rows = childrenValue(node, "e").map((row) => convertContainer(row, "e", ctx));
  return `\\begin{aligned}${rows.join(" \\\\ ")}\\end{aligned}`;
}

function convertNode(node: OrderedNode, ctx: OmmlContext): string {
  const tag = tagName(node);
  if (!tag) return "";
  switch (tag) {
    case "oMath":
    case "oMathPara":
    case "e":
    case "num":
    case "den":
    case "deg":
    case "sub":
    case "sup":
    case "lim":
    case "fName":
      return convertContainer(node, tag, ctx);
    case "r":
      return convertRun(node, ctx);
    case "t":
    case "text":
      return convertRunText(nodeText(node));
    case "f":
      return convertFraction(node, ctx);
    case "rad":
      return convertRadical(node, ctx);
    case "sSup":
    case "sSub":
    case "sSubSup":
      return convertSupSub(node, ctx);
    case "sPre":
      return convertPreSubSup(node, ctx);
    case "nary":
      return convertNary(node, ctx);
    case "d":
      return convertDelimiter(node, ctx);
    case "acc":
      return convertAccent(node, ctx);
    case "bar":
      return convertBar(node, ctx);
    case "limLow":
      return convertLimit(node, ctx, "limLow");
    case "limUpp":
      return convertLimit(node, ctx, "limUpp");
    case "func":
      return convertFunction(node, ctx);
    case "groupChr":
      return convertGroupCharacter(node, ctx);
    case "m":
      return convertMatrix(node, ctx);
    case "eqArr":
      return convertEquationArray(node, ctx);
    case "box":
      return `\\boxed{${convertContainer(node, "e", ctx)}}`;
    case "borderBox":
      return `\\boxed{${convertContainer(node, "e", ctx)}}`;
    case "phant": {
      const properties = firstChild(node, "phantPr");
      const show = properties ? getAttribute(childrenValue(properties, "show")[0] ?? null, "val") : null;
      const body = convertContainer(node, "e", ctx);
      return show === "0" ? `\\phantom{${body}}` : body;
    }
    case "rPr":
    case "ctrlPr":
    case "argPr":
    case "naryPr":
    case "dPr":
    case "fPr":
    case "radPr":
    case "accPr":
    case "barPr":
    case "groupChrPr":
    case "funcPr":
    case "limLowPr":
    case "limUppPr":
    case "mPr":
    case "mrPr":
    case "sSupPr":
    case "sSubPr":
    case "sSubSupPr":
    case "sPrePr":
    case "oMathParaPr":
    case "bookmarkStart":
    case "bookmarkEnd":
      return "";
    default:
      ctx.unsupported(tag);
      return convertContainer(node, tag, ctx);
  }
}

export function convertNodes(nodes: OrderedNode[], ctx = new OmmlContext()): string {
  return nodes
    .map((node) => convertNode(node, ctx))
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function ommlNodesToLatex(nodes: OrderedNode[]): OmmlResult {
  const context = new OmmlContext();
  return {
    latex: convertNodes(nodes, context),
    warnings: [...context.warnings],
    unsupportedTags: [...context.unsupportedTags],
  };
}

export function ommlToLatex(node: OrderedNode): OmmlResult {
  return ommlNodesToLatex([node]);
}

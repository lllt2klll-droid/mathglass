/**
 * A deliberately small, non-executing LaTeX preview parser.
 *
 * It understands the semantic subset produced by MathGlass (headings, text
 * formatting, lists, tables, display math, images and page breaks) and renders
 * everything else as an explicit "command" token. It must never silently drop
 * content: unsupported commands stay visible so teachers can notice them.
 */

export interface PreviewTextInline {
  type: "text";
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
}

export interface PreviewMathInline {
  type: "math";
  latex: string;
}

export interface PreviewBreakInline {
  type: "break";
}

export interface PreviewCommandInline {
  type: "command";
  command: string;
}

export type PreviewInline =
  | PreviewTextInline
  | PreviewMathInline
  | PreviewBreakInline
  | PreviewCommandInline;

export type PreviewBlock =
  | { type: "heading"; level: number; inlines: PreviewInline[] }
  | { type: "paragraph"; inlines: PreviewInline[] }
  | { type: "math"; latex: string }
  | { type: "list"; ordered: boolean; items: PreviewInline[][] }
  | { type: "table"; rows: PreviewInline[][][]; hasHeaderRow: boolean }
  | { type: "note"; text: string }
  | { type: "image"; target: string }
  | { type: "break" };

const MATH_ENVIRONMENTS = new Set([
  "equation",
  "equation*",
  "displaymath",
  "align",
  "align*",
  "aligned",
  "gather",
  "gather*",
  "gathered",
  "multline",
  "multline*",
  "eqnarray",
  "eqnarray*",
  "split",
  "cases",
]);

const LIST_ENVIRONMENTS = new Set(["itemize", "enumerate", "description"]);

const TABLE_ENVIRONMENTS = new Set(["tabular", "tabularx", "longtable", "array"]);

const PASSTHROUGH_ENVIRONMENTS = new Set([
  "center",
  "flushleft",
  "flushright",
  "quote",
  "quotation",
  "abstract",
  "document",
  "minipage",
  "figure",
  "table",
  "table*",
  "figure*",
]);

const SECTION_LEVELS: Record<string, number> = {
  chapter: 1,
  section: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
  subparagraph: 4,
};

const HIDDEN_COMMANDS = new Set([
  "noindent",
  "indent",
  "centering",
  "raggedright",
  "raggedleft",
  "small",
  "footnotesize",
  "scriptsize",
  "tiny",
  "large",
  "Large",
  "LARGE",
  "huge",
  "Huge",
  "normalsize",
  "bfseries",
  "itshape",
  "mdseries",
  "rmfamily",
  "sffamily",
  "ttfamily",
  "allowdisplaybreaks",
  "maketitle",
  "tableofcontents",
  "listoffigures",
  "listoftables",
  "clearpage",
  "cleardoublepage",
  "vfill",
  "hfill",
  "null",
  "protect",
  "relax",
  "ignorespaces",
  "unskip",
]);

const SYMBOL_COMMANDS: Record<string, string> = {
  "%": "%",
  "&": "&",
  "#": "#",
  _: "_",
  "{": "{",
  "}": "}",
  $: "$",
  LaTeX: "LaTeX",
  TeX: "TeX",
  textbackslash: "\\",
  ldots: "…",
  dots: "…",
  textellipsis: "…",
  quad: "\u2003",
  qquad: "\u2003\u2003",
  ",": "\u2009",
  ";": "\u2005",
  ":": "\u2005",
  "!": "",
  " ": " ",
  par: "\n\n",
  newline: "\n",
  linebreak: "\n",
  textregistered: "®",
  texttrademark: "™",
  copyright: "©",
  pounds: "£",
  texteuro: "€",
  degree: "°",
  textdegree: "°",
  times: "×",
  pm: "±",
  leq: "≤",
  geq: "≥",
  neq: "≠",
  approx: "≈",
  infty: "∞",
  sum: "∑",
  prod: "∏",
  int: "∫",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  sigma: "σ",
  phi: "φ",
  omega: "ω",
  Delta: "Δ",
  Sigma: "Σ",
  Omega: "Ω",
};

interface ReadResult {
  content: string;
  next: number;
}

function stripComments(source: string): string {
  let result = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\" && index + 1 < source.length) {
      result += char + source[index + 1];
      index += 2;
      continue;
    }
    if (char === "%") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
}

/**
 * Removes a LaTeX comment from a line while respecting escaped percent signs.
 * Kept separate from `stripComments` because line handling is simpler for the
 * preview parser.
 */
function stripCommentFromLine(line: string): string {
  let backslashes = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\") {
      backslashes += 1;
      continue;
    }
    if (char === "%" && backslashes % 2 === 0) {
      return line.slice(0, index);
    }
    backslashes = 0;
  }
  return line;
}

function extractDocumentBody(source: string): string {
  const begin = /\\begin\s*\{document\}/.exec(source);
  if (!begin) return source;
  const afterBegin = source.slice(begin.index + begin[0].length);
  const end = afterBegin.lastIndexOf("\\end{document}");
  return end >= 0 ? afterBegin.slice(0, end) : afterBegin;
}

function readGroup(input: string, start: number): ReadResult | null {
  let index = start;
  while (index < input.length && /\s/.test(input[index])) index += 1;
  if (input[index] !== "{") return null;
  let depth = 0;
  let content = "";
  for (; index < input.length; index += 1) {
    const char = input[index];
    if (char === "\\" && index + 1 < input.length) {
      content += char + input[index + 1];
      index += 1;
      continue;
    }
    if (char === "{") {
      depth += 1;
      if (depth === 1) continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return { content, next: index + 1 };
    }
    content += char;
  }
  return null;
}

function readOptional(input: string, start: number): ReadResult | null {
  let index = start;
  while (index < input.length && /\s/.test(input[index])) index += 1;
  if (input[index] !== "[") return null;
  let depth = 0;
  let content = "";
  for (; index < input.length; index += 1) {
    const char = input[index];
    if (char === "\\" && index + 1 < input.length) {
      content += char + input[index + 1];
      index += 1;
      continue;
    }
    if (char === "[") {
      depth += 1;
      if (depth === 1) continue;
    }
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return { content, next: index + 1 };
    }
    content += char;
  }
  return null;
}

function readCommandName(input: string, start: number): { name: string; next: number } {
  let index = start;
  while (index < input.length && /[a-zA-Z@]/.test(input[index])) index += 1;
  if (index === start) {
    return { name: input[start] ?? "", next: Math.min(start + 1, input.length) };
  }
  return { name: input.slice(start, index), next: index };
}

function mergeText(
  target: PreviewInline[],
  text: string,
  style: Omit<PreviewTextInline, "type" | "text">,
): void {
  if (!text) return;
  const previous = target[target.length - 1];
  if (
    previous?.type === "text" &&
    previous.bold === style.bold &&
    previous.italic === style.italic &&
    previous.underline === style.underline &&
    previous.code === style.code
  ) {
    previous.text += text;
    return;
  }
  target.push({ type: "text", text, ...style });
}

function parseInlineMath(source: string, start: number, delimiter: "$" | "\\("): number {
  const endToken = delimiter === "$" ? "$" : "\\)";
  let index = start;
  while (index < source.length) {
    if (source[index] === "\\" && delimiter === "$") {
      index += 2;
      continue;
    }
    if (source.startsWith(endToken, index)) return index;
    index += 1;
  }
  return -1;
}

function parseInlines(
  source: string,
  style: Omit<PreviewTextInline, "type" | "text"> = {},
): PreviewInline[] {
  const result: PreviewInline[] = [];
  let index = 0;
  let textBuffer = "";

  const flush = () => {
    if (textBuffer) {
      mergeText(result, textBuffer, style);
      textBuffer = "";
    }
  };

  while (index < source.length) {
    const char = source[index];

    if (char === "$") {
      const end = parseInlineMath(source, index + 1, "$");
      if (end > index + 1) {
        flush();
        result.push({ type: "math", latex: source.slice(index + 1, end).trim() });
        index = end + 1;
        continue;
      }
    }

    if (char === "\\" && source[index + 1] === "(") {
      const end = parseInlineMath(source, index + 2, "\\(");
      if (end > index + 1) {
        flush();
        result.push({ type: "math", latex: source.slice(index + 2, end).trim() });
        index = end + 2;
        continue;
      }
    }

    if (char === "\\") {
      flush();
      if (source[index + 1] === "\\") {
        // Row/line break with an optional vertical-space argument.
        let next = index + 2;
        const optional = readOptional(source, next);
        if (optional) next = optional.next;
        result.push({ type: "break" });
        index = next;
        continue;
      }
      const command = readCommandName(source, index + 1);
      let next = command.next;
      const optional = readOptional(source, next);
      if (optional) next = optional.next;
      const firstGroup = readGroup(source, next);
      if (firstGroup) next = firstGroup.next;

      const name = command.name;
      if (name in SYMBOL_COMMANDS) {
        textBuffer += SYMBOL_COMMANDS[name];
        index = next;
        continue;
      }
      if (!name) {
        textBuffer += source[index + 1] ?? "";
        index = Math.min(index + 2, source.length);
        continue;
      }
      if (HIDDEN_COMMANDS.has(name)) {
        index = next;
        continue;
      }
      if (name === "label" || name === "index" || name === "hypertarget" || name === "phantom") {
        index = next;
        continue;
      }
      if (name === "href") {
        const second = readGroup(source, next);
        if (firstGroup) {
          if (second) {
            result.push(...parseInlines(second.content, style));
            index = second.next;
          } else {
            textBuffer += firstGroup.content;
            index = next;
          }
        } else {
          textBuffer += "\\href";
          index = next;
        }
        continue;
      }
      if (name === "url" && firstGroup) {
        textBuffer += firstGroup.content;
        index = next;
        continue;
      }
      if (name === "footnote" && firstGroup) {
        textBuffer += ` (chú thích: ${firstGroup.content})`;
        index = next;
        continue;
      }
      if (name === "caption" && firstGroup) {
        textBuffer += `Chú thích: ${firstGroup.content}`;
        index = next;
        continue;
      }
      if (
        ["textbf", "textmd", "textnormal", "textit", "emph", "textsl", "underline", "texttt", "textsf", "textrm", "textsc", "mbox", "text"].includes(
          name,
        )
      ) {
        if (firstGroup) {
          const nextStyle = {
            ...style,
            bold: style.bold || name === "textbf",
            italic: style.italic || ["textit", "emph", "textsl"].includes(name),
            underline: style.underline || name === "underline",
            code: style.code || name === "texttt",
          };
          result.push(...parseInlines(firstGroup.content, nextStyle));
          index = next;
          continue;
        }
      }
      if (["textsuperscript", "textsubscript"].includes(name) && firstGroup) {
        result.push(...parseInlines(firstGroup.content, style));
        index = next;
        continue;
      }
      if (name === "textcolor" || name === "colorbox" || name === "fcolorbox") {
        // Skip colour arguments and render their visible content.
        let contentIndex = next;
        if (name === "fcolorbox") {
          const third = readGroup(source, contentIndex);
          if (third) contentIndex = third.next;
        }
        const content = readGroup(source, contentIndex);
        if (content) {
          result.push(...parseInlines(content.content, style));
          index = content.next;
          continue;
        }
      }

      const visible = `\\${name}${optional ? `[${optional.content}]` : ""}${
        firstGroup ? `{${firstGroup.content}}` : ""
      }`;
      result.push({ type: "command", command: visible });
      index = next;
      continue;
    }

    if (char === "~") {
      textBuffer += "\u00a0";
      index += 1;
      continue;
    }

    if (char === "\n") {
      flush();
      const previous = result[result.length - 1];
      if (previous?.type !== "break") result.push({ type: "break" });
      index += 1;
      while (index < source.length && /\s/.test(source[index])) index += 1;
      continue;
    }

    if (char === "{" || char === "}") {
      index += 1;
      continue;
    }

    textBuffer += char;
    index += 1;
  }

  flush();
  return result;
}

function splitTopLevel(input: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (char === "\\") {
      if (input.startsWith(separator, index) && depth === 0) {
        parts.push(current);
        current = "";
        index += separator.length;
        continue;
      }
      current += char + (input[index + 1] ?? "");
      index += 2;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth = Math.max(0, depth - 1);
    if (input.startsWith(separator, index) && depth === 0) {
      parts.push(current);
      current = "";
      index += separator.length;
      continue;
    }
    current += char;
    index += 1;
  }
  parts.push(current);
  return parts;
}

function parseTableContent(raw: string, environment: string): {
  rows: PreviewInline[][][];
  hasHeaderRow: boolean;
} {
  let content = raw.trim();
  if (environment === "tabularx") {
    const width = readGroup(content, 0);
    if (width) content = content.slice(width.next).trim();
  }
  const columnSpec = readGroup(content, 0);
  if (columnSpec) content = content.slice(columnSpec.next).trim();

  const hasHeaderRow =
    /\\(?:toprule|midrule|hline)/.test(content) ||
    /\\textbf\s*\{/.test(content.split("\\\\")[0] ?? "");

  const rows = splitTopLevel(content, "\\\\")
    .map((row) =>
      splitTopLevel(row, "&").map((cell) =>
        parseInlines(
          cell
            .replace(/\\(?:hline|toprule|midrule|bottomrule)\b/g, " ")
            .replace(/\\cline\s*\{[^}]*\}/g, " ")
            .replace(/\\rowcolor\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/g, " ")
            .replace(/\\multicolumn\s*\{[^}]*\}\s*\{[^}]*\}\s*/g, "")
            .trim(),
        ),
      ),
    )
    .filter((row) => row.some((cell) => cell.length > 0));

  return { rows, hasHeaderRow };
}

function parseListContent(
  raw: string,
  ordered: boolean,
): { type: "list"; ordered: boolean; items: PreviewInline[][] } {
  const parts = raw.split(/\\item\b/);
  const items: PreviewInline[][] = [];
  if (parts.length > 1) {
    for (const part of parts.slice(1)) {
      const label = /^\s*\[([^\]]*)\]/.exec(part);
      let content = label ? part.slice(label[0].length) : part;
      content = content.replace(/^\s+|\s+$/g, "");
      const inlines = parseInlines(content);
      if (label) {
        items.push([{ type: "text", text: `${label[1]}: `, bold: true }, ...inlines]);
      } else {
        items.push(inlines);
      }
    }
  } else if (raw.trim()) {
    items.push(parseInlines(raw.trim()));
  }
  return { type: "list", ordered, items };
}

function normalizeMathEnvironment(environment: string, raw: string): string {
  const clean = raw
    .replace(/\\(?:label|tag)\s*\{[^}]*\}/g, "")
    .replace(/\\nonumber\b/g, "")
    .replace(/\\notag\b/g, "")
    .trim();
  if (environment.startsWith("align")) return `\\begin{aligned}${clean}\\end{aligned}`;
  if (environment.startsWith("gather")) return `\\begin{gathered}${clean}\\end{gathered}`;
  if (environment.startsWith("multline")) return `\\begin{gathered}${clean}\\end{gathered}`;
  if (environment.startsWith("eqnarray")) return `\\begin{aligned}${clean}\\end{aligned}`;
  if (environment === "split" || environment === "aligned") {
    return `\\begin{aligned}${clean}\\end{aligned}`;
  }
  if (environment === "cases") return `\\begin{cases}${clean}\\end{cases}`;
  return clean;
}

function findEnvironmentEnd(
  lines: string[],
  startLine: number,
  environment: string,
): { content: string; endLine: number; firstRemainder: string } {
  const beginToken = `\\begin{${environment}}`;
  const endToken = `\\end{${environment}}`;
  const startRaw = lines[startLine];
  const startIndex = startRaw.indexOf(beginToken);
  const firstRemainder =
    startIndex >= 0 ? startRaw.slice(startIndex + beginToken.length) : startRaw;
  let depth = 1;
  let content = firstRemainder;
  let line = startLine;

  if (firstRemainder.includes(endToken)) {
    const beforeEnd = firstRemainder.slice(0, firstRemainder.indexOf(endToken));
    return {
      content: beforeEnd,
      endLine: startLine,
      firstRemainder: firstRemainder.slice(firstRemainder.indexOf(endToken) + endToken.length),
    };
  }

  content += "\n";
  line += 1;
  while (line < lines.length && depth > 0) {
    const current = lines[line];
    const beginCount = current.split(beginToken).length - 1;
    depth += beginCount;
    const endIndex = current.indexOf(endToken);
    if (endIndex >= 0) {
      depth -= 1;
      if (depth === 0) {
        content += current.slice(0, endIndex);
        return {
          content,
          endLine: line,
          firstRemainder: current.slice(endIndex + endToken.length),
        };
      }
    }
    content += `${current}\n`;
    line += 1;
  }

  return { content, endLine: lines.length - 1, firstRemainder: "" };
}

function parseBlocks(source: string): PreviewBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: PreviewBlock[] = [];
  let paragraph: string[] = [];
  let line = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (!text) return;
    const inlines = parseInlines(text);
    if (inlines.length > 0) blocks.push({ type: "paragraph", inlines });
  };

  while (line < lines.length) {
    const rawLine = stripCommentFromLine(lines[line]);
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushParagraph();
      line += 1;
      continue;
    }

    const beginMatch = /^\\begin\{([^}]+)\}/.exec(trimmed);
    if (beginMatch) {
      flushParagraph();
      const environment = beginMatch[1];
      const found = findEnvironmentEnd(lines, line, environment);
      const content = found.content;
      const nextLine = found.endLine + 1;

      if (MATH_ENVIRONMENTS.has(environment)) {
        blocks.push({ type: "math", latex: normalizeMathEnvironment(environment, content) });
      } else if (LIST_ENVIRONMENTS.has(environment)) {
        blocks.push(parseListContent(content, environment === "enumerate"));
      } else if (TABLE_ENVIRONMENTS.has(environment)) {
        const table = parseTableContent(content, environment);
        if (table.rows.length > 0) blocks.push({ type: "table", ...table });
        else blocks.push({ type: "note", text: "Bảng không có dữ liệu hiển thị." });
      } else if (PASSTHROUGH_ENVIRONMENTS.has(environment)) {
        const inner = parseBlocks(content);
        if (inner.length === 0) {
          blocks.push({ type: "note", text: `Môi trường ${environment} không có nội dung hiển thị.` });
        } else {
          blocks.push(...inner);
        }
      } else {
        blocks.push({
          type: "note",
          text: `Môi trường “${environment}” chưa được preview ngữ nghĩa đầy đủ. Nội dung vẫn cần được kiểm tra trong tệp LaTeX.`,
        });
        blocks.push(...parseBlocks(content));
      }
      line = nextLine;
      continue;
    }

    if (trimmed.startsWith("\\[") || trimmed.startsWith("$$")) {
      flushParagraph();
      const singleLine = trimmed.startsWith("\\[")
        ? trimmed.endsWith("\\]") && trimmed.length > 4
        : trimmed.endsWith("$$") && trimmed.length > 4;
      if (singleLine) {
        const inner = trimmed.startsWith("\\[") ? trimmed.slice(2, -2) : trimmed.slice(2, -2);
        blocks.push({ type: "math", latex: inner.trim() });
        line += 1;
        continue;
      }
      const openToken = trimmed.startsWith("\\[") ? "\\[" : "$$";
      const closeToken = trimmed.startsWith("\\[") ? "\\]" : "$$";
      let content = trimmed.slice(2);
      let index = line;
      let closed = false;
      while (index < lines.length) {
        const current = stripCommentFromLine(lines[index]);
        const end = current.indexOf(closeToken);
        if (end >= 0) {
          content += `\n${current.slice(0, end)}`;
          line = index + 1;
          closed = true;
          break;
        }
        if (index > line) content += `\n${current}`;
        index += 1;
      }
      if (!closed) line = index;
      blocks.push({ type: "math", latex: content.trim() });
      if (!closed) {
        blocks.push({
          type: "note",
          text: `Không tìm thấy ${openToken === "\\[" ? "\\]" : "$$"} đóng cho công thức hiển thị. Preview có thể chưa đầy đủ.`,
        });
      }
      continue;
    }

    const sectionMatch = /^\\(chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(\[[^\]]*\])?\s*\{/.exec(
      trimmed,
    );
    if (sectionMatch) {
      flushParagraph();
      const level = SECTION_LEVELS[sectionMatch[1]] ?? 2;
      let index = line;
      let consumed = "";
      let content: string | null = null;
      while (index < lines.length) {
        const current = stripCommentFromLine(lines[index]);
        consumed += (consumed ? "\n" : "") + current.trim();
        const start = consumed.indexOf("{");
        if (start >= 0) {
          const group = readGroup(consumed, start);
          if (group) {
            content = group.content;
            break;
          }
        }
        index += 1;
      }
      if (content !== null) {
        blocks.push({ type: "heading", level, inlines: parseInlines(content) });
        line = index + 1;
      } else {
        blocks.push({ type: "note", text: "Tiêu đề mục không đọc được đầy đủ." });
        line += 1;
      }
      continue;
    }

    if (/^\\(?:newpage|pagebreak|clearpage|cleardoublepage)\b/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "break" });
      line += 1;
      continue;
    }

    const imageMatch = /^\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(trimmed);
    if (imageMatch) {
      flushParagraph();
      blocks.push({ type: "image", target: imageMatch[1] });
      line += 1;
      continue;
    }

    if (/^\\(?:vspace|hspace|setlength|addtolength|renewcommand|newcommand|def|let)\b/.test(trimmed)) {
      flushParagraph();
      if (/^\\(?:vspace|hspace)\b/.test(trimmed)) {
        blocks.push({ type: "note", text: "Khoảng trống / khoảng cách do lệnh LaTeX tạo ra." });
      }
      line += 1;
      continue;
    }

    paragraph.push(trimmed);
    line += 1;
  }

  flushParagraph();
  return blocks;
}

export function parseLatexPreview(source: string): PreviewBlock[] {
  if (!source.trim()) return [];
  const withoutComments = stripComments(source);
  const body = extractDocumentBody(withoutComments);
  return parseBlocks(body);
}

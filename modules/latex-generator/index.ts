import type {
  DocumentAst,
  DocumentBlock,
  InlineNode,
  TableContent,
} from "@/types/document";
import type { ConversionSettings } from "@/types/project";
import { safeFilename } from "@/lib/utils";
import { getTemplate } from "./templates";
import {
  escapeLatexText,
  inlinesToLatex,
  inlinesToPlainText,
  stripLeadingQuestionLabel,
  type InlineRenderOptions,
} from "./escape";

export interface GeneratorAsset {
  id: string;
  filename: string;
  mimeType: string;
}

export interface GeneratorDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  blockId?: string;
  line?: number;
}

export interface GenerateLatexInput {
  ast: DocumentAst;
  settings: ConversionSettings;
  projectName: string;
  sourceFilename: string;
  assets: GeneratorAsset[];
  generatedAt?: string;
}

export interface GeneratedLatex {
  source: string;
  lineMap: Record<string, [number, number]>;
  diagnostics: GeneratorDiagnostic[];
  includedBlockIds: string[];
  assetPaths: Record<string, string>;
  stats: {
    pages: number;
    blocks: number;
    includedBlocks: number;
    skippedBlocks: number;
    displayMath: number;
    tables: number;
    images: number;
  };
}

function cleanComment(value: string): string {
  return value.replace(/[\r\n]+/g, " ").slice(0, 240);
}

function selectionPages(ast: DocumentAst, settings: ConversionSettings): number[] {
  const all = ast.pages.map((page) => page.pageNumber).sort((left, right) => left - right);
  const selection = settings.pageSelection;
  if (selection.mode === "all") return all;
  if (selection.mode === "selected") {
    const selected = new Set(selection.pages.filter((page) => all.includes(page)));
    const result = all.filter((page) => selected.has(page));
    return result.length > 0 ? result : all;
  }
  const start = selection.rangeStart ?? 1;
  const end = selection.rangeEnd ?? all[all.length - 1] ?? 1;
  const lower = Math.max(1, Math.min(start, end));
  const upper = Math.max(1, Math.max(start, end));
  const result = all.filter((page) => page >= lower && page <= upper);
  return result.length > 0 ? result : all;
}

function blockContainsMath(block: DocumentBlock): boolean {
  if (block.content.kind === "display_math") return true;
  if (block.content.kind === "paragraph" || block.content.kind === "heading") {
    return block.content.inlines.some((inline) => inline.type === "math");
  }
  if (block.content.kind === "table") {
    return block.content.rows.some((row) =>
      row.some((cell) => cell.inlines.some((inline) => inline.type === "math")),
    );
  }
  if (block.content.kind === "list") {
    return block.content.items.some((item) =>
      item.inlines.some((inline) => inline.type === "math"),
    );
  }
  return false;
}

function blockVisibleText(block: DocumentBlock): string {
  switch (block.content.kind) {
    case "heading":
    case "paragraph":
      return inlinesToPlainText(block.content.inlines);
    case "display_math":
      return block.content.latex;
    case "list":
      return block.content.items.map((item) => inlinesToPlainText(item.inlines)).join(" ");
    case "table":
      return block.content.rows
        .flat()
        .map((cell) => inlinesToPlainText(cell.inlines))
        .join(" ");
    case "unknown":
      return block.content.rawText ?? block.content.reason;
    default:
      return "";
  }
}

function questionLabelAndRest(block: DocumentBlock): { label: string; number: number; rest: InlineNode[] } | null {
  if (block.type !== "paragraph" || block.content.kind !== "paragraph") return null;
  const firstTextIndex = block.content.inlines.findIndex((inline) => inline.type === "text" && inline.text.trim());
  if (firstTextIndex < 0) return null;
  const first = block.content.inlines[firstTextIndex];
  if (first.type !== "text") return null;
  const stripped = stripLeadingQuestionLabel(first.text);
  if (!stripped) return null;
  const numberMatch = /(\d+)/.exec(stripped.label);
  if (!numberMatch) return null;
  const inlines = [...block.content.inlines];
  inlines[firstTextIndex] = { ...first, text: stripped.rest };
  return {
    label: stripped.label,
    number: Number(numberMatch[1]),
    rest: inlines,
  };
}

function supportsQuestions(settings: ConversionSettings): boolean {
  return settings.mode === "exam" || settings.mode === "worksheet";
}

function renderTable(
  content: TableContent,
  renderInlines: (inlines: InlineNode[]) => string,
  diagnostics: GeneratorDiagnostic[],
  blockId: string,
): string[] {
  const columnCount = Math.max(0, ...content.rows.map((row) => row.length));
  if (columnCount === 0) {
    diagnostics.push({
      code: "LATEX_EMPTY_TABLE",
      severity: "warning",
      message: "Bảng không có ô dữ liệu và đã được bỏ qua.",
      blockId,
    });
    return [];
  }
  if (columnCount > 10) {
    diagnostics.push({
      code: "LATEX_WIDE_TABLE",
      severity: "warning",
      message: `Bảng có ${columnCount} cột; bố cục có thể tràn trang và cần chỉnh tay.`,
      blockId,
    });
  }
  const lines: string[] = [
    "\\begin{center}",
    `\\begin{tabularx}{\\linewidth}{|${"X|".repeat(columnCount)}}`,
    "\\hline",
  ];
  for (const [rowIndex, row] of content.rows.entries()) {
    const cells: string[] = [];
    for (let column = 0; column < columnCount; column += 1) {
      const cell = row[column];
      if (!cell) {
        cells.push("");
        continue;
      }
      let value = renderInlines(cell.inlines);
      if (cell.colspan && cell.colspan > 1) {
        diagnostics.push({
          code: "LATEX_COLSPAN_APPROXIMATION",
          severity: "warning",
          message: "Ô gộp ngang trong bảng được giữ nội dung nhưng chưa dựng lại đúng cấu trúc gộp.",
          blockId,
        });
      }
      if (content.hasHeaderRow && rowIndex === 0) value = `\\textbf{${value}}`;
      cells.push(value);
    }
    lines.push(cells.join(" & ") + " \\\\");
    if (content.hasHeaderRow && rowIndex === 0) lines.push("\\hline");
  }
  lines.push("\\hline", "\\end{tabularx}", "\\end{center}");
  return lines;
}

function renderUnknownBlock(
  block: DocumentBlock,
  diagnostics: GeneratorDiagnostic[],
): string[] {
  if (block.content.kind !== "unknown") return [];
  diagnostics.push({
    code: "LATEX_UNSUPPORTED_BLOCK",
    severity: "warning",
    message: "Block chưa nhận diện được biểu diễn bằng ghi chú rõ ràng trong tài liệu LaTeX.",
    blockId: block.id,
  });
  const lines = [
    "% MathGlass: block chưa nhận diện được — nội dung gốc không bị xóa.",
    "\\begin{quote}",
    `\\textit{[Nội dung cần kiểm tra: ${escapeLatexText(block.content.reason)}]}`,
  ];
  if (block.content.rawText) {
    lines.push("", escapeLatexText(block.content.rawText));
  }
  lines.push("\\end{quote}");
  return lines;
}

export function generateLatex(input: GenerateLatexInput): GeneratedLatex {
  const { ast, settings, projectName, sourceFilename, assets } = input;
  const template = getTemplate(settings.templateId);
  const diagnostics: GeneratorDiagnostic[] = [];
  const lineMap: Record<string, [number, number]> = {};
  const lines: string[] = [];
  const includedBlockIds: string[] = [];
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  const append = (line = ""): number => {
    lines.push(line);
    return lines.length;
  };

  // Deterministic, collision-free asset names.
  const assetPaths = new Map<string, string>();
  const usedNames = new Set<string>();
  for (const asset of assets) {
    const base = safeFilename(asset.filename, `${asset.id}.bin`).replace(/[^a-zA-Z0-9._-]/g, "-");
    let name = base || `${asset.id}.bin`;
    if (usedNames.has(name.toLowerCase())) {
      name = `${asset.id.slice(0, 8)}-${name}`;
    }
    usedNames.add(name.toLowerCase());
    assetPaths.set(asset.id, `assets/${name}`);
    if (!["image/png", "image/jpeg", "image/jpg"].includes(asset.mimeType)) {
      diagnostics.push({
        code: "LATEX_ASSET_FORMAT",
        severity: "warning",
        message: `Tệp ${asset.filename} có định dạng ${asset.mimeType}; XeLaTeX có thể không đọc trực tiếp. Hãy chuyển sang PNG/JPEG.`,
      });
    }
  }

  let currentBlockId: string | null = null;
  const renderOptions: InlineRenderOptions = {
    assetPath: (assetId) => assetPaths.get(assetId) ?? null,
    onMissingAsset: (assetId, filename) => {
      diagnostics.push({
        code: "LATEX_MISSING_ASSET",
        severity: "error",
        message: `Không tìm thấy tệp hình ảnh ${filename} (${assetId}). Tài liệu chưa thể biên dịch đầy đủ.`,
        blockId: currentBlockId ?? undefined,
      });
    },
  };
  const renderInlines = (inlines: InlineNode[]) => inlinesToLatex(inlines, renderOptions);

  // Preamble ---------------------------------------------------------------
  append("% ============================================================");
  append("% MathGlass — LaTeX generated from the recognized document AST");
  append(`% Project: ${cleanComment(projectName)}`);
  append(`% Source: ${cleanComment(sourceFilename)}`);
  append(`% Template: ${template.id} — ${cleanComment(template.name)}`);
  append(`% Generated at: ${generatedAt}`);
  append("% Review all needs_review blocks before publishing.");
  append("% Compiler: XeLaTeX or LuaLaTeX (fontspec + Vietnamese fonts required).");
  append("% ============================================================");
  append("");
  append(`\\documentclass[${template.classOptions.join(",")}]{article}`);
  append("\\usepackage{fontspec}");
  append("\\IfFontExistsTF{Be Vietnam Pro}{%");
  append("  \\setmainfont{Be Vietnam Pro}");
  append("}{\\IfFontExistsTF{Noto Serif}{%");
  append("  \\setmainfont{Noto Serif}");
  append("}{\\setmainfont{Latin Modern Roman}}}");
  append("\\usepackage[vietnamese]{babel}");
  const basePackages = [
    "amsmath",
    "amssymb",
    "mathtools",
    "geometry",
    "graphicx",
    "booktabs",
    "tabularx",
    "array",
    "float",
    "enumitem",
    "fancyhdr",
    "xcolor",
  ];
  const packages = [...new Set([...basePackages, ...template.packages])];
  append(`\\usepackage{${packages.join(",")}}`);
  append("\\usepackage[hidelinks]{hyperref}");
  append(`\\geometry{margin=${template.margin}}`);
  append("\\setlength{\\parindent}{0pt}");
  append("\\setlength{\\parskip}{6pt}");
  append("\\renewcommand{\\arraystretch}{1.2}");
  append("\\allowdisplaybreaks");
  for (const line of template.extraPreamble) append(line);

  const headerBlock = ast.pages
    .flatMap((page) => page.blocks)
    .find((block) => block.type === "header" && block.content.kind === "header");
  const footerBlock = ast.pages
    .flatMap((page) => page.blocks)
    .find((block) => block.type === "footer" && block.content.kind === "footer");

  append("\\pagestyle{fancy}");
  append("\\fancyhf{}");
  if (headerBlock && headerBlock.content.kind === "header") {
    const header = renderInlines(headerBlock.content.inlines).slice(0, 500);
    append(`\\fancyhead[L]{${header}}`);
  } else {
    append(`\\fancyhead[L]{${escapeLatexText(template.name)}}`);
  }
  if (footerBlock && footerBlock.content.kind === "footer") {
    const footer = renderInlines(footerBlock.content.inlines).slice(0, 500);
    append(`\\fancyhead[R]{${footer}}`);
  } else {
    append(`\\fancyhead[R]{${escapeLatexText(projectName)}}`);
  }
  if (template.pageNumbering) {
    append("\\fancyfoot[C]{\\thepage}");
  }
  append("\\renewcommand{\\headrulewidth}{0.4pt}");
  append("\\renewcommand{\\footrulewidth}{0pt}");
  append("");
  append("\\begin{document}");
  append("");
  append("\\begin{center}");
  if (template.subtitleTemplate) {
    append(`{\\Large\\bfseries ${escapeLatexText(template.subtitleTemplate)}}\\\\[2pt]`);
  }
  append(`{\\LARGE\\bfseries ${escapeLatexText(projectName)}}\\\\[4pt]`);
  for (const titleLine of template.titleLines) {
    append(`${escapeLatexText(titleLine)}\\\\[2pt]`);
  }
  for (const instruction of template.instructions) {
    append(`\\textit{${escapeLatexText(instruction)}}\\\\[2pt]`);
  }
  append("\\end{center}");
  append("");

  if (settings.mode === "formulas_only") {
    append("% Chế độ: Chỉ trích xuất công thức — chỉ các block có công thức được đưa vào thân tài liệu.");
  }
  if (settings.mode === "preserve_layout") {
    append("% Chế độ: Giữ bố cục gốc — ngắt trang được tái tạo theo trang nguồn.");
  }
  append("");

  const pages = selectionPages(ast, settings);
  const selectedSet = new Set(pages);
  const renderableBlocks: Array<{ block: DocumentBlock; pageNumber: number }> = [];
  for (const page of ast.pages) {
    if (!selectedSet.has(page.pageNumber)) continue;
    for (const block of page.blocks) {
      if (block.type === "page_break" || block.type === "header" || block.type === "footer") continue;
      renderableBlocks.push({ block, pageNumber: page.pageNumber });
    }
  }

  let displayMath = 0;
  let tables = 0;
  let images = 0;
  let skippedBlocks = 0;
  const emitBlock = (block: DocumentBlock) => {
    currentBlockId = block.id;
    if (block.warnings.length > 0) {
      append(`% [MathGlass] Cảnh báo cho block ${block.id}:`);
      for (const warning of block.warnings.slice(0, 4)) {
        append(`% - ${cleanComment(warning)}`);
      }
    }
    const start = lines.length + 1;
    switch (block.content.kind) {
      case "heading": {
        const level = Math.max(1, Math.min(4, block.content.level));
        const command = ["section", "subsection", "subsubsection", "paragraph"][level - 1] ?? "paragraph";
        const star = template.numberedHeadings ? "" : "*";
        const text = renderInlines(block.content.inlines);
        if (!text.trim()) break;
        append(`\\${command}${star}{${text}}`);
        includedBlockIds.push(block.id);
        break;
      }
      case "paragraph": {
        const text = renderInlines(block.content.inlines);
        if (!text.trim()) break;
        if (block.content.align === "center") {
          append("\\begin{center}");
          append(text);
          append("\\end{center}");
        } else if (block.content.align === "right") {
          append("\\begin{flushright}");
          append(text);
          append("\\end{flushright}");
        } else {
          append(text);
        }
        append("");
        includedBlockIds.push(block.id);
        break;
      }
      case "display_math": {
        if (!block.content.latex.trim()) {
          diagnostics.push({
            code: "LATEX_EMPTY_MATH",
            severity: "warning",
            message: "Công thức rỗng đã được bỏ qua.",
            blockId: block.id,
          });
          break;
        }
        append("\\[");
        append(block.content.latex.trim());
        append("\\]");
        append("");
        displayMath += 1;
        includedBlockIds.push(block.id);
        break;
      }
      case "list": {
        const environment = block.content.ordered ? "enumerate" : "itemize";
        append(`\\begin{${environment}}[leftmargin=1.6em,itemsep=3pt]`);
        for (const item of block.content.items) {
          const text = renderInlines(item.inlines);
          if (text.trim()) append(`  \\item ${text}`);
        }
        append(`\\end{${environment}}`);
        append("");
        includedBlockIds.push(block.id);
        break;
      }
      case "table": {
        const tableLines = renderTable(block.content, renderInlines, diagnostics, block.id);
        if (tableLines.length > 0) {
          lines.push(...tableLines, "");
          tables += 1;
          includedBlockIds.push(block.id);
        } else {
          skippedBlocks += 1;
        }
        break;
      }
      case "image": {
        const path = assetPaths.get(block.content.assetId);
        if (!path) {
          diagnostics.push({
            code: "LATEX_MISSING_IMAGE",
            severity: "error",
            message: `Hình ảnh ${block.content.filename} không có trong kho tài nguyên của dự án.`,
            blockId: block.id,
          });
          append("\\begin{center}");
          append(
            `\\fbox{\\parbox{0.8\\linewidth}{\\centering\\textit{[Thiếu hình ảnh: ${escapeLatexText(
              block.content.filename,
            )}]}}}`,
          );
          append("\\end{center}");
          append("");
          break;
        }
        append("\\begin{figure}[htbp]");
        append("\\centering");
        append(`\\includegraphics[width=0.8\\linewidth]{\\detokenize{${path}}}`);
        append("\\end{figure}");
        append("");
        images += 1;
        includedBlockIds.push(block.id);
        break;
      }
      case "unknown": {
        const unknownLines = renderUnknownBlock(block, diagnostics);
        if (unknownLines.length > 0) {
          lines.push(...unknownLines, "");
          includedBlockIds.push(block.id);
        }
        break;
      }
      case "geometry": {
        if (block.content.assetId && assetPaths.has(block.content.assetId)) {
          append("\\begin{figure}[htbp]");
          append("\\centering");
          append(
            `\\includegraphics[width=0.8\\linewidth]{\\detokenize{${assetPaths.get(block.content.assetId)}}}`,
          );
          append("\\end{figure}");
          append("");
        } else {
          append(`\\textit{[Hình học: ${escapeLatexText(block.content.description)}]}`);
          append("");
        }
        includedBlockIds.push(block.id);
        break;
      }
      default:
        break;
    }
    const end = lines.length;
    if (includedBlockIds.includes(block.id) && end >= start) {
      lineMap[block.id] = [start, end];
    }
    currentBlockId = null;
  };

  const filteredBlocks = renderableBlocks.filter(({ block }) => {
    if (block.status === "rejected" || block.status === "ignored") {
      skippedBlocks += 1;
      append(
        `% [MathGlass] Block ${block.id} đã được ${
          block.status === "ignored" ? "bỏ qua" : "từ chối"
        } trong Accuracy Lab và được loại khỏi đầu ra.`,
      );
      return false;
    }
    if (settings.mode === "formulas_only") {
      const keep = block.content.kind === "heading" || blockContainsMath(block);
      if (!keep) skippedBlocks += 1;
      return keep;
    }
    if (!blockVisibleText(block).trim() && block.type !== "image" && block.type !== "unknown") {
      skippedBlocks += 1;
      return false;
    }
    return true;
  });

  let index = 0;
  while (index < filteredBlocks.length) {
    const { block, pageNumber } = filteredBlocks[index];
    if (index > 0) {
      const previousPage = filteredBlocks[index - 1].pageNumber;
      if (previousPage !== pageNumber && settings.options.keepStructure) {
        append("\\newpage");
        append("");
      }
    }
    const pageStart = lines.length + 1;

    if (
      supportsQuestions(settings) &&
      !settings.options.keepQuestionNumbering &&
      block.type === "paragraph"
    ) {
      const group: Array<{ block: DocumentBlock; number: number; rest: InlineNode[] }> = [];
      let next = index;
      while (next < filteredBlocks.length) {
        const candidate = filteredBlocks[next];
        if (candidate.pageNumber !== pageNumber) break;
        const question = questionLabelAndRest(candidate.block);
        if (!question) break;
        if (group.length > 0 && question.number !== group[group.length - 1].number + 1) break;
        group.push({ block: candidate.block, number: question.number, rest: question.rest });
        next += 1;
      }
      if (group.length > 0) {
        const labelsUseWord = /^(Câu|Bài|Question)/i.test(questionLabelAndRest(group[0].block)?.label ?? "");
        append(
          `\\begin{enumerate}[label={${labelsUseWord ? "Câu " : ""}\\arabic*.},start=${group[0].number},leftmargin=*,itemsep=8pt]`,
        );
        for (const item of group) {
          const text = renderInlines(item.rest);
          append(`  \\item ${text}`);
          includedBlockIds.push(item.block.id);
          const start = lineMap[item.block.id]?.[0] ?? lines.length;
          lineMap[item.block.id] = [start, lines.length];
        }
        append("\\end{enumerate}");
        append("");
        diagnostics.push({
          code: "LATEX_QUESTION_NORMALIZED",
          severity: "info",
          message: `Đã chuẩn hóa ${group.length} câu hỏi thành danh sách đánh số theo tùy chọn "Không giữ đánh số câu".`,
        });
        index = next;
        const pageEnd = lines.length;
        lineMap[`page:${pageNumber}`] = [pageStart, pageEnd];
        continue;
      }
    }

    emitBlock(block);
    index += 1;
    lineMap[`page:${pageNumber}`] = [pageStart, lines.length];
  }

  append("\\end{document}");
  append("");

  const source = lines.join("\n");
  return {
    source,
    lineMap,
    diagnostics,
    includedBlockIds,
    assetPaths: Object.fromEntries(assetPaths),
    stats: {
      pages: pages.length,
      blocks: renderableBlocks.length,
      includedBlocks: includedBlockIds.length,
      skippedBlocks,
      displayMath,
      tables,
      images,
    },
  };
}

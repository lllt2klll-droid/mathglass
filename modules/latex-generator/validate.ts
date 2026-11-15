export interface LatexValidationDiagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  line?: number;
}

export interface LatexValidationResult {
  valid: boolean;
  diagnostics: LatexValidationDiagnostic[];
  environments: string[];
  referencedAssets: string[];
}

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; code: string; message: string }> = [
  {
    pattern: /\\write18\b|\\ShellEscape\b|\\immediate\\write\b|\\openout\b|\\newwrite\b/,
    code: "LATEX_SHELL_BLOCKED",
    message: "Mã nguồn chứa lệnh ghi/điều khiển hệ thống. Trình biên dịch sandbox sẽ từ chối tài liệu này.",
  },
  {
    pattern: /\\input\b|\\include\b|\\includeonly\b/,
    code: "LATEX_FILE_INCLUDE",
    message: "Mã nguồn tham chiếu tệp khác. Chỉ các tệp trong gói dự án được phép và cần được kiểm tra thủ công.",
  },
  {
    pattern: /\\catcode\b|\\csname\b|\\expandafter\b/,
    code: "LATEX_MACRO_INTROSPECTION",
    message: "Mã nguồn chứa macro introspection. Hãy kiểm tra trước khi biên dịch trong môi trường sandbox.",
  },
];

function stripComment(line: string): string {
  let output = "";
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "%" && line[index - 1] !== "\\") break;
    output += character;
  }
  return output;
}

export function validateLatex(
  source: string,
  options: { knownAssets?: string[] } = {},
): LatexValidationResult {
  const diagnostics: LatexValidationDiagnostic[] = [];
  const environments: string[] = [];
  const stack: Array<{ name: string; line: number }> = [];
  const referencedAssets = new Set<string>();
  let braceDepth = 0;
  let inlineDollarCount = 0;
  let hasDocumentBegin = false;
  let hasDocumentEnd = false;

  const sourceLines = source.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex += 1) {
    const lineNumber = lineIndex + 1;
    const line = stripComment(sourceLines[lineIndex]);
    if (!line) continue;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === "\\") {
        index += 1;
        continue;
      }
      if (character === "{") braceDepth += 1;
      if (character === "}") {
        braceDepth -= 1;
        if (braceDepth < 0) {
          diagnostics.push({
            severity: "error",
            code: "LATEX_UNMATCHED_BRACE",
            message: "Phát hiện dấu } đóng khi chưa có dấu { mở tương ứng.",
            line: lineNumber,
          });
          braceDepth = 0;
        }
      }
      if (character === "$") {
        if (line[index + 1] === "$") {
          index += 1;
        } else {
          inlineDollarCount += 1;
        }
      }
    }

    const beginMatches = line.matchAll(/\\begin\{([^}]+)\}/g);
    for (const match of beginMatches) {
      const name = match[1];
      environments.push(name);
      if (name === "document") hasDocumentBegin = true;
      stack.push({ name, line: lineNumber });
    }
    const endMatches = line.matchAll(/\\end\{([^}]+)\}/g);
    for (const match of endMatches) {
      const name = match[1];
      if (name === "document") hasDocumentEnd = true;
      const top = stack.pop();
      if (!top) {
        diagnostics.push({
          severity: "error",
          code: "LATEX_UNEXPECTED_END",
          message: `Gặp \\end{${name}} nhưng không có môi trường tương ứng.`,
          line: lineNumber,
        });
      } else if (top.name !== name) {
        diagnostics.push({
          severity: "error",
          code: "LATEX_ENV_MISMATCH",
          message: `Môi trường \\begin{${top.name}} (dòng ${top.line}) bị đóng bởi \\end{${name}}.`,
          line: lineNumber,
        });
      }
    }

    const includeMatches = line.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{\\detokenize\{([^}]+)\}\}|\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g);
    for (const match of includeMatches) {
      const path = (match[1] ?? match[2] ?? "").trim();
      if (path) referencedAssets.add(path);
    }

    for (const blocked of BLOCKED_PATTERNS) {
      if (blocked.pattern.test(line)) {
        diagnostics.push({
          severity: "error",
          code: blocked.code,
          message: blocked.message,
          line: lineNumber,
        });
      }
    }
  }

  if (braceDepth > 0) {
    diagnostics.push({
      severity: "error",
      code: "LATEX_UNCLOSED_BRACE",
      message: `Còn ${braceDepth} dấu { chưa được đóng.`,
    });
  }
  if (inlineDollarCount % 2 !== 0) {
    diagnostics.push({
      severity: "error",
      code: "LATEX_UNCLOSED_MATH",
      message: "Số dấu $ không cân bằng; có công thức inline chưa đóng.",
    });
  }
  if (!hasDocumentBegin) {
    diagnostics.push({
      severity: "error",
      code: "LATEX_NO_DOCUMENT",
      message: "Thiếu \\begin{document}.",
    });
  }
  if (!hasDocumentEnd) {
    diagnostics.push({
      severity: "error",
      code: "LATEX_NO_END_DOCUMENT",
      message: "Thiếu \\end{document}.",
    });
  }
  if (stack.length > 0) {
    for (const environment of stack) {
      diagnostics.push({
        severity: "error",
        code: "LATEX_UNCLOSED_ENV",
        message: `Môi trường ${environment.name} mở tại dòng ${environment.line} chưa được đóng.`,
        line: environment.line,
      });
    }
  }
  if (source.length > 2_000_000) {
    diagnostics.push({
      severity: "error",
      code: "LATEX_SOURCE_TOO_LARGE",
      message: "Mã nguồn vượt quá 2 MB và không thể biên dịch an toàn.",
    });
  }

  if (options.knownAssets) {
    const known = new Set(options.knownAssets);
    for (const asset of referencedAssets) {
      if (!known.has(asset)) {
        diagnostics.push({
          severity: "error",
          code: "LATEX_ASSET_NOT_FOUND",
          message: `Tệp được tham chiếu nhưng không có trong dự án: ${asset}`,
        });
      }
    }
  }

  const hasError = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  return {
    valid: !hasError,
    diagnostics,
    environments,
    referencedAssets: [...referencedAssets],
  };
}

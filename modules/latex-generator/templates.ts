import type { GradeLevel, TemplateId } from "@/types/project";

export type TemplateKind = "document" | "exam" | "worksheet" | "revision";

export interface LatexTemplate {
  id: TemplateId;
  name: string;
  description: string;
  kind: TemplateKind;
  grade: GradeLevel | "all";
  classOptions: string[];
  packages: string[];
  margin: string;
  titleLines: string[];
  subtitleTemplate: string;
  instructions: string[];
  extraPreamble: string[];
  numberedHeadings: boolean;
  answerSpaceCommand: boolean;
  pageNumbering: boolean;
}

export const LATEX_TEMPLATES: Record<TemplateId, LatexTemplate> = {
  "math-basic": {
    id: "math-basic",
    name: "Tài liệu Toán cơ bản",
    description:
      "Bài viết Toán tổng quát với tiêu đề tài liệu, công thức, bảng và hình ảnh. Phù hợp cho giáo án và tài liệu tham khảo.",
    kind: "document",
    grade: "all",
    classOptions: ["11pt", "a4paper"],
    packages: ["amsmath", "amssymb", "mathtools", "graphicx", "booktabs", "tabularx", "array", "float", "xcolor"],
    margin: "2cm",
    titleLines: [],
    subtitleTemplate: "",
    instructions: [],
    extraPreamble: [],
    numberedHeadings: false,
    answerSpaceCommand: false,
    pageNumbering: true,
  },
  "primary-exam": {
    id: "primary-exam",
    name: "Đề kiểm tra Toán tiểu học",
    description:
      "Bố cục đề kiểm tra tiểu học với chữ lớn, khoảng cách rộng, dòng ghi họ tên và lớp. Công thức giữ nguyên từ tài liệu gốc.",
    kind: "exam",
    grade: "primary",
    classOptions: ["12pt", "a4paper"],
    packages: ["amsmath", "amssymb", "graphicx", "booktabs", "tabularx", "array", "xcolor"],
    margin: "1.8cm",
    titleLines: ["TRƯỜNG: ......................................", "Họ và tên: ......................................  Lớp: ............"],
    subtitleTemplate: "ĐỀ KIỂM TRA MÔN TOÁN",
    instructions: ["Thời gian làm bài: ....................", "Điểm: ............    Nhận xét: ................................................"],
    extraPreamble: [
      "\\newcommand{\\answerspace}[1][2cm]{\\vspace{#1}}",
      "\\setlength{\\parskip}{10pt}",
    ],
    numberedHeadings: false,
    answerSpaceCommand: true,
    pageNumbering: true,
  },
  "lower-secondary-exam": {
    id: "lower-secondary-exam",
    name: "Đề kiểm tra Toán THCS",
    description:
      "Đề kiểm tra THCS với phần trắc nghiệm/tự luận, tiêu đề rõ ràng và không tự thêm đáp án hoặc giả thiết.",
    kind: "exam",
    grade: "lower_secondary",
    classOptions: ["11pt", "a4paper"],
    packages: ["amsmath", "amssymb", "mathtools", "graphicx", "booktabs", "tabularx", "array", "enumitem", "xcolor"],
    margin: "2cm",
    titleLines: ["TRƯỜNG: ......................................", "Họ và tên: ......................................  Lớp: ............"],
    subtitleTemplate: "ĐỀ KIỂM TRA MÔN TOÁN",
    instructions: ["Thời gian làm bài: ....................", "Điểm: ............    Nhận xét: ................................................"],
    extraPreamble: ["\\newcommand{\\answerspace}[1][3cm]{\\vspace{#1}}"],
    numberedHeadings: false,
    answerSpaceCommand: true,
    pageNumbering: true,
  },
  "upper-secondary-exam": {
    id: "upper-secondary-exam",
    name: "Đề kiểm tra Toán THPT",
    description:
      "Đề kiểm tra THPT tối ưu cho công thức dài, hệ phương trình, bảng số liệu và hình học. Không hiển thị đáp án tự suy diễn.",
    kind: "exam",
    grade: "upper_secondary",
    classOptions: ["11pt", "a4paper"],
    packages: ["amsmath", "amssymb", "mathtools", "graphicx", "booktabs", "tabularx", "array", "enumitem", "xcolor"],
    margin: "2cm",
    titleLines: ["TRƯỜNG: ......................................", "Họ và tên: ......................................  Lớp: ............"],
    subtitleTemplate: "ĐỀ KIỂM TRA MÔN TOÁN",
    instructions: ["Thời gian làm bài: ....................", "Điểm: ............    Nhận xét: ................................................"],
    extraPreamble: [
      "\\newcommand{\\answerspace}[1][3cm]{\\vspace{#1}}",
      "\\allowdisplaybreaks",
    ],
    numberedHeadings: false,
    answerSpaceCommand: true,
    pageNumbering: true,
  },
  worksheet: {
    id: "worksheet",
    name: "Phiếu học tập",
    description:
      "Phiếu học tập có khung thông tin học sinh, hướng dẫn làm bài và khoảng trả lời. Phù hợp cho hoạt động trên lớp.",
    kind: "worksheet",
    grade: "all",
    classOptions: ["12pt", "a4paper"],
    packages: ["amsmath", "amssymb", "mathtools", "graphicx", "booktabs", "tabularx", "array", "xcolor"],
    margin: "1.8cm",
    titleLines: ["Họ và tên: ......................................  Lớp: ............", "Ngày: ...... / ...... / ............"],
    subtitleTemplate: "PHIẾU HỌC TẬP",
    instructions: ["Hướng dẫn: ............................................................"],
    extraPreamble: [
      "\\newcommand{\\answerspace}[1][2.5cm]{\\vspace{#1}}",
      "\\newcommand{\\answerbox}[1][3cm]{\\framebox[\\linewidth]{\\rule{0pt}{#1}}}",
    ],
    numberedHeadings: true,
    answerSpaceCommand: true,
    pageNumbering: true,
  },
  "multiple-choice": {
    id: "multiple-choice",
    name: "Bài tập trắc nghiệm",
    description:
      "Bố cục bài tập trắc nghiệm với khoảng cách phương án, nhãn A/B/C/D có thể dùng trong LaTeX và hướng dẫn làm bài.",
    kind: "exam",
    grade: "all",
    classOptions: ["11pt", "a4paper"],
    packages: ["amsmath", "amssymb", "mathtools", "graphicx", "booktabs", "tabularx", "array", "enumitem", "xcolor"],
    margin: "1.8cm",
    titleLines: ["Họ và tên: ......................................  Lớp: ............"],
    subtitleTemplate: "BÀI TẬP TRẮC NGHIỆM",
    instructions: ["Hướng dẫn: Chọn một phương án đúng và khoanh tròn ký tự tương ứng."],
    extraPreamble: [
      "\\newcommand{\\choice}[4]{\\begin{enumerate}[label=\\Alph*.,leftmargin=1.8em,itemsep=2pt]\\item #1\\item #2\\item #3\\item #4\\end{enumerate}}",
      "\\newcommand{\\answerspace}[1][1cm]{\\vspace{#1}}",
    ],
    numberedHeadings: false,
    answerSpaceCommand: true,
    pageNumbering: true,
  },
  essay: {
    id: "essay",
    name: "Bài tập tự luận",
    description:
      "Bài tập tự luận với khoảng trống trình bày, khung ghi chú và bố cục rộng cho lời giải viết tay.",
    kind: "document",
    grade: "all",
    classOptions: ["12pt", "a4paper"],
    packages: ["amsmath", "amssymb", "mathtools", "graphicx", "booktabs", "tabularx", "array", "enumitem", "xcolor"],
    margin: "2cm",
    titleLines: ["Họ và tên: ......................................  Lớp: ............"],
    subtitleTemplate: "BÀI TẬP TỰ LUẬN",
    instructions: ["Trình bày lời giải vào phần trống bên dưới."],
    extraPreamble: [
      "\\newcommand{\\answerspace}[1][5cm]{\\vspace{#1}}",
      "\\setlength{\\parskip}{8pt}",
    ],
    numberedHeadings: true,
    answerSpaceCommand: true,
    pageNumbering: true,
  },
  revision: {
    id: "revision",
    name: "Tài liệu ôn tập",
    description:
      "Tài liệu ôn tập có tiêu đề, mục lục tùy chọn, tóm tắt kiến thức và bài tập. Sử dụng số trang và tiêu đề mục.",
    kind: "revision",
    grade: "all",
    classOptions: ["11pt", "a4paper"],
    packages: ["amsmath", "amssymb", "mathtools", "graphicx", "booktabs", "tabularx", "array", "enumitem", "xcolor", "hyperref"],
    margin: "2cm",
    titleLines: [],
    subtitleTemplate: "TÀI LIỆU ÔN TẬP",
    instructions: [],
    extraPreamble: [
      "\\newcommand{\\summarybox}[1]{\\fcolorbox{black!20}{black!3}{\\parbox{0.96\\linewidth}{#1}}}",
      "\\setlength{\\parskip}{6pt}",
    ],
    numberedHeadings: true,
    answerSpaceCommand: false,
    pageNumbering: true,
  },
};

export function getTemplate(id: TemplateId): LatexTemplate {
  return LATEX_TEMPLATES[id] ?? LATEX_TEMPLATES["math-basic"];
}

export const TEMPLATE_IDS = Object.keys(LATEX_TEMPLATES) as TemplateId[];

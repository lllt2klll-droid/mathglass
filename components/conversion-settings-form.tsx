"use client";

import * as React from "react";
import type {
  ConversionMode,
  ConversionSettings,
  DocumentLanguage,
  GradeLevel,
  TemplateId,
} from "@/types/project";
import { LATEX_TEMPLATES, TEMPLATE_IDS } from "@/modules/latex-generator/templates";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const MODES: Array<{ value: ConversionMode; label: string; hint: string }> = [
  { value: "math_accuracy", label: "Ưu tiên độ chính xác Toán", hint: "Giữ công thức và cấu trúc, hạn chế diễn giải." },
  { value: "preserve_layout", label: "Giữ bố cục gần nguồn", hint: "Tái tạo ngắt trang và thứ tự block." },
  { value: "exam", label: "Đề kiểm tra", hint: "Bố cục đề thi, có thể chuẩn hóa đánh số câu." },
  { value: "worksheet", label: "Phiếu học tập", hint: "Khoảng trả lời và tiêu đề lớp/học sinh." },
  { value: "formulas_only", label: "Chỉ công thức", hint: "Chỉ giữ heading và block có công thức." },
];

const GRADES: Array<{ value: GradeLevel; label: string }> = [
  { value: "primary", label: "Tiểu học" },
  { value: "lower_secondary", label: "THCS" },
  { value: "upper_secondary", label: "THPT" },
  { value: "university", label: "Đại học / Cao đẳng" },
  { value: "other", label: "Khác" },
];

const LANGUAGES: Array<{ value: DocumentLanguage; label: string }> = [
  { value: "auto", label: "Tự động" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
];

export function ConversionSettingsForm({
  value,
  onChange,
  pageCount,
  disabled,
}: {
  value: ConversionSettings;
  onChange: (next: ConversionSettings) => void;
  pageCount: number | null;
  disabled?: boolean;
}) {
  const pages = React.useMemo(
    () => Array.from({ length: Math.min(pageCount ?? 0, 500) }, (_, index) => index + 1),
    [pageCount],
  );

  const patch = (partial: Partial<ConversionSettings>) => onChange({ ...value, ...partial });
  const patchOptions = (partial: Partial<ConversionSettings["options"]>) =>
    onChange({ ...value, options: { ...value.options, ...partial } });

  const togglePage = (page: number) => {
    const current = new Set(value.pageSelection.pages);
    if (current.has(page)) current.delete(page);
    else current.add(page);
    patch({
      pageSelection: {
        ...value.pageSelection,
        pages: [...current].sort((left, right) => left - right),
      },
    });
  };

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-semibold">Chế độ chuyển đổi</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODES.map((mode) => (
            <label
              key={mode.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-[12px] border p-3 transition-colors",
                value.mode === mode.value
                  ? "border-[color:var(--mg-primary)]/50 bg-[color:var(--mg-highlight)]"
                  : "border-[color:var(--mg-border-subtle)] hover:bg-[color:var(--mg-highlight)]/60",
                disabled && "pointer-events-none opacity-60",
              )}
            >
              <input
                type="radio"
                name="conversion-mode"
                className="mt-1 accent-[color:var(--mg-primary)]"
                checked={value.mode === mode.value}
                onChange={() => patch({ mode: mode.value })}
              />
              <span>
                <span className="block text-xs font-semibold">{mode.label}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                  {mode.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Cấp học</Label>
          <Select
            value={value.grade}
            onValueChange={(next) => patch({ grade: next as GradeLevel })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRADES.map((grade) => (
                <SelectItem key={grade.value} value={grade.value}>
                  {grade.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ngôn ngữ tài liệu</Label>
          <Select
            value={value.language}
            onValueChange={(next) => patch({ language: next as DocumentLanguage })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((language) => (
                <SelectItem key={language.value} value={language.value}>
                  {language.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Template LaTeX</Label>
          <Select
            value={value.templateId}
            onValueChange={(next) => patch({ templateId: next as TemplateId })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {LATEX_TEMPLATES[id].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {LATEX_TEMPLATES[value.templateId].description}
          </p>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Phạm vi trang</h3>
          <span className="text-[11px] text-muted-foreground">
            {pageCount ? `${pageCount} trang khả dụng` : "Chưa xác định số trang (DOCX)"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { value: "all", label: "Tất cả" },
            { value: "selected", label: "Chọn trang" },
            { value: "range", label: "Khoảng" },
          ].map((mode) => (
            <button
              key={mode.value}
              type="button"
              disabled={disabled || !pageCount}
              onClick={() =>
                patch({
                  pageSelection: {
                    ...value.pageSelection,
                    mode: mode.value as ConversionSettings["pageSelection"]["mode"],
                  },
                })
              }
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                value.pageSelection.mode === mode.value
                  ? "border-primary bg-[color:var(--mg-highlight)] text-primary"
                  : "border-[color:var(--mg-border-subtle)] text-muted-foreground hover:bg-[color:var(--mg-highlight)]",
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {!pageCount ? (
          <p className="rounded-[10px] border border-dashed border-[color:var(--mg-border-subtle)] p-2.5 text-[11px] text-muted-foreground">
            DOCX chưa có số trang trước khi phân tích. MathGlass sẽ chuyển toàn bộ nội dung và áp
            dụng giới hạn trang sau khi đọc tài liệu.
          </p>
        ) : value.pageSelection.mode === "selected" ? (
          <div className="mg-scrollbar max-h-44 overflow-y-auto rounded-[12px] border border-[color:var(--mg-border-subtle)] p-2">
            <div className="flex flex-wrap gap-1.5">
              {pages.map((page) => {
                const checked = value.pageSelection.pages.includes(page);
                return (
                  <button
                    key={page}
                    type="button"
                    disabled={disabled}
                    onClick={() => togglePage(page)}
                    aria-pressed={checked}
                    className={cn(
                      "min-w-9 rounded-[8px] border px-2 py-1 text-xs font-medium transition-colors",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-[color:var(--mg-border-subtle)] hover:bg-[color:var(--mg-highlight)]",
                    )}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
          </div>
        ) : value.pageSelection.mode === "range" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="range-start" className="text-xs">
                Từ trang
              </Label>
              <Input
                id="range-start"
                type="number"
                min={1}
                max={pageCount ?? undefined}
                value={value.pageSelection.rangeStart ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  patch({
                    pageSelection: {
                      ...value.pageSelection,
                      rangeStart: event.target.value ? Number(event.target.value) : null,
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="range-end" className="text-xs">
                Đến trang
              </Label>
              <Input
                id="range-end"
                type="number"
                min={1}
                max={pageCount ?? undefined}
                value={value.pageSelection.rangeEnd ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  patch({
                    pageSelection: {
                      ...value.pageSelection,
                      rangeEnd: event.target.value ? Number(event.target.value) : null,
                    },
                  })
                }
              />
            </div>
          </div>
        ) : null}
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Tùy chọn nhận diện</h3>
        <div className="space-y-2.5">
          <ToggleRow
            label="Nhận diện công thức"
            description="Giữ công thức dưới dạng LaTeX; không tự giải hay sửa số liệu."
            checked={value.options.recognizeFormulas}
            onCheckedChange={(checked) => patchOptions({ recognizeFormulas: checked })}
            disabled={disabled}
          />
          <ToggleRow
            label="Xử lý bảng"
            description="Chuyển bảng thành tabularx; cảnh báo nếu ô gộp chưa được tái tạo chính xác."
            checked={value.options.recognizeTables}
            onCheckedChange={(checked) => patchOptions({ recognizeTables: checked })}
            disabled={disabled}
          />
          <ToggleRow
            label="Giữ hình ảnh"
            description="Đóng gói hình ảnh vào thư mục assets của bản xuất."
            checked={value.options.recognizeImages}
            onCheckedChange={(checked) => patchOptions({ recognizeImages: checked })}
            disabled={disabled}
          />
          <ToggleRow
            label="Giữ cấu trúc trang"
            description="Tái tạo ngắt trang giữa các trang nguồn khi có thể."
            checked={value.options.keepStructure}
            onCheckedChange={(checked) => patchOptions({ keepStructure: checked })}
            disabled={disabled}
          />
          <ToggleRow
            label="Giữ đánh số câu hỏi"
            description="Tắt để chuẩn hóa danh sách câu hỏi liên tiếp (chỉ ở chế độ đề/phiếu)."
            checked={value.options.keepQuestionNumbering}
            onCheckedChange={(checked) => patchOptions({ keepQuestionNumbering: checked })}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[11px] border border-[color:var(--mg-border-subtle)] p-3">
      <div>
        <p className="text-xs font-semibold">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

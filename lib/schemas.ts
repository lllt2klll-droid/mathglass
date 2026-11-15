import { z } from "zod";

export const pageSelectionSchema = z.object({
  mode: z.enum(["all", "selected", "range"]),
  pages: z.array(z.number().int().positive()).max(500).default([]),
  rangeStart: z.number().int().positive().nullable().default(null),
  rangeEnd: z.number().int().positive().nullable().default(null),
});

export const conversionOptionsSchema = z.object({
  recognizeImages: z.boolean(),
  recognizeTables: z.boolean(),
  recognizeFormulas: z.boolean(),
  keepQuestionNumbering: z.boolean(),
  keepStructure: z.boolean(),
});

export const conversionSettingsSchema = z.object({
  mode: z.enum(["preserve_layout", "math_accuracy", "exam", "worksheet", "formulas_only"]),
  grade: z.enum(["primary", "lower_secondary", "upper_secondary", "university", "other"]),
  language: z.enum(["vi", "en", "auto"]),
  pageSelection: pageSelectionSchema,
  options: conversionOptionsSchema,
  templateId: z.enum([
    "math-basic",
    "primary-exam",
    "lower-secondary-exam",
    "upper-secondary-exam",
    "worksheet",
    "multiple-choice",
    "essay",
    "revision",
  ]),
});

export const createProjectSchema = z.object({
  name: z.string().trim().max(160).optional(),
  settings: conversionSettingsSchema.optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["draft", "processing", "needs_review", "ready", "failed", "archived"]).optional(),
  settings: conversionSettingsSchema.optional(),
});

export const processProjectSchema = z.object({
  settings: conversionSettingsSchema.optional(),
});

export const reviewBlockSchema = z.object({
  action: z.enum(["accept", "reject", "ignore", "edit", "reset", "unsupported"]),
  latex: z.string().max(50_000).optional(),
  content: z.unknown().optional(),
});

export const saveLatexSchema = z.object({
  source: z.string().max(2_000_000),
  lineMap: z.record(
    z.string(),
    z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  ).default({}),
  snapshot: z.boolean().default(false),
  summary: z.string().max(200).optional(),
});

export const providerSettingsSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          url.protocol === "https:" ||
          (process.env.NODE_ENV !== "production" && url.hostname === "localhost")
        );
      } catch {
        return false;
      }
    }, "Base URL phải là HTTPS (hoặc localhost khi phát triển)."),
  model: z.string().trim().min(1).max(160),
  apiKey: z.string().trim().max(1000).optional(),
  clearApiKey: z.boolean().optional(),
  enabled: z.boolean(),
});

export const assistantRequestSchema = z.object({
  projectId: z.string().uuid().optional(),
  action: z.enum([
    "explain_source",
    "fix_syntax",
    "suggest_format",
    "expression_to_latex",
    "optimize_layout",
    "explain_package",
    "build_table",
    "build_geometry",
  ]),
  input: z.string().min(1).max(20_000),
  source: z.string().max(2_000_000).optional(),
  selection: z.string().max(20_000).optional(),
});

export const ocrRequestSchema = z.object({
  pageNumber: z.number().int().positive().optional(),
  imageBase64: z.string().max(30_000_000),
  mimeType: z.enum(["image/png", "image/jpeg"]),
  replacePage: z.boolean().default(true),
});

export type ConversionSettingsInput = z.infer<typeof conversionSettingsSchema>;

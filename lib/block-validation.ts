import { z } from "zod";
import type { BlockType } from "@/types/document";
import { AppError } from "@/types/api";

const textInlineSchema = z.object({
  type: z.literal("text"),
  text: z.string().max(100_000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  superscript: z.boolean().optional(),
  subscript: z.boolean().optional(),
  code: z.boolean().optional(),
});

const mathInlineSchema = z.object({
  type: z.literal("math"),
  latex: z.string().max(20_000),
  confidence: z.number().min(0).max(1).optional(),
  provenance: z
    .object({
      providerId: z.string().max(100).optional(),
      model: z.string().max(200).optional(),
      recognizedAt: z.string().max(50).optional(),
      originalText: z.string().max(20_000).optional(),
    })
    .optional(),
});

const breakInlineSchema = z.object({ type: z.literal("linebreak") });

const imageInlineSchema = z.object({
  type: z.literal("image"),
  assetId: z.string().min(1).max(200),
  filename: z.string().max(300),
  alt: z.string().max(500),
  mimeType: z.string().max(100),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

const inlineSchema = z.discriminatedUnion("type", [
  textInlineSchema,
  mathInlineSchema,
  breakInlineSchema,
  imageInlineSchema,
]);

const inlinesSchema = z.array(inlineSchema).max(5000);
const alignSchema = z.enum(["left", "center", "right", "justify"]).optional();

const headingContentSchema = z.object({
  kind: z.literal("heading"),
  level: z.number().int().min(1).max(6),
  inlines: inlinesSchema,
});

const paragraphContentSchema = z.object({
  kind: z.literal("paragraph"),
  inlines: inlinesSchema,
  align: alignSchema,
  sourceStyle: z.string().max(200).optional(),
});

const displayMathContentSchema = z.object({
  kind: z.literal("display_math"),
  latex: z.string().max(50_000),
  originalText: z.string().max(50_000).optional(),
  provenance: z
    .object({
      providerId: z.string().max(100).optional(),
      model: z.string().max(200).optional(),
      recognizedAt: z.string().max(50).optional(),
      originalText: z.string().max(20_000).optional(),
    })
    .optional(),
});

const listContentSchema = z.object({
  kind: z.literal("list"),
  ordered: z.boolean(),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        inlines: inlinesSchema,
      }),
    )
    .max(500),
  start: z.number().int().positive().optional(),
  sourceNumberingId: z.string().max(200).optional(),
});

const tableContentSchema = z.object({
  kind: z.literal("table"),
  rows: z
    .array(
      z
        .array(
          z.object({
            inlines: inlinesSchema,
            header: z.boolean().optional(),
            colspan: z.number().int().positive().max(50).optional(),
            rowspan: z.number().int().positive().max(200).optional(),
          }),
        )
        .max(50),
    )
    .max(500),
  hasHeaderRow: z.boolean(),
  caption: z.string().max(500).optional(),
});

const imageContentSchema = z.object({
  kind: z.literal("image"),
  assetId: z.string().min(1).max(200),
  filename: z.string().max(300),
  alt: z.string().max(500),
  mimeType: z.string().max(100),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  placement: z.enum(["block", "inline"]).optional(),
});

const pageBreakContentSchema = z.object({ kind: z.literal("page_break") });

const headerFooterContentSchema = z.object({
  kind: z.enum(["header", "footer"]),
  inlines: inlinesSchema,
});

const unknownContentSchema = z.object({
  kind: z.literal("unknown"),
  reason: z.string().max(2000),
  rawText: z.string().max(100_000).optional(),
  rawXml: z.string().max(100_000).optional(),
});

const geometryContentSchema = z.object({
  kind: z.literal("geometry"),
  description: z.string().max(5000),
  assetId: z.string().max(200).optional(),
  rawText: z.string().max(100_000).optional(),
});

const blockContentSchema = z.discriminatedUnion("kind", [
  headingContentSchema,
  paragraphContentSchema,
  displayMathContentSchema,
  listContentSchema,
  tableContentSchema,
  imageContentSchema,
  pageBreakContentSchema,
  headerFooterContentSchema,
  unknownContentSchema,
  geometryContentSchema,
]);

const allowedKinds: Record<BlockType, string[]> = {
  heading: ["heading"],
  paragraph: ["paragraph"],
  display_math: ["display_math"],
  list: ["list"],
  table: ["table"],
  image: ["image"],
  geometry: ["geometry"],
  page_break: ["page_break"],
  header: ["header"],
  footer: ["footer"],
  unknown: ["unknown"],
};

/** Validates edited block JSON and ensures its `kind` still matches the block type. */
export function parseEditedBlockContent(type: BlockType, value: unknown) {
  const content = blockContentSchema.parse(value);
  if (!allowedKinds[type]?.includes(content.kind)) {
    throw new AppError(
      "BLOCK_CONTENT_MISMATCH",
      `Nội dung ${content.kind} không khớp với loại block ${type}.`,
      422,
    );
  }
  return content;
}

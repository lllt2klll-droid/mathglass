import { apiSuccess } from "@/lib/http";
import { LATEX_TEMPLATES } from "@/modules/latex-generator/templates";
import { TEMPLATE_IDS } from "@/modules/latex-generator/templates";

export const runtime = "nodejs";

export async function GET() {
  return apiSuccess({
    items: TEMPLATE_IDS.map((id) => {
      const template = LATEX_TEMPLATES[id];
      return {
        id: template.id,
        name: template.name,
        description: template.description,
        kind: template.kind,
        grade: template.grade,
        packages: template.packages,
        margin: template.margin,
        numberedHeadings: template.numberedHeadings,
        answerSpaceCommand: template.answerSpaceCommand,
      };
    }),
  });
}

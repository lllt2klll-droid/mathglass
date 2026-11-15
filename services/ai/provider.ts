import { z } from "zod";
import type {
  OcrPageResult,
  OcrRecognizedBlock,
  ProviderPublicConfig,
  ProviderTestResult,
} from "@/types/ai";
import { AppError } from "@/types/api";
import type { StoredProvider } from "@/services/db/types";
import { decryptSecret } from "./crypto";

export interface ProviderRuntime {
  id: "openai-compatible";
  displayName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

const recognizedBlockSchema = z.object({
  type: z.enum(["paragraph", "heading", "display_math", "table", "unknown"]),
  text: z.string().max(20_000).optional(),
  latex: z.string().max(20_000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  warning: z.string().max(1000).optional(),
  rows: z.array(z.array(z.string().max(5000)).max(20)).max(100).optional(),
});

const ocrResponseSchema = z.object({
  language: z.string().max(20).optional(),
  blocks: z.array(recognizedBlockSchema).max(100),
  warnings: z.array(z.string().max(1000)).max(20).optional(),
});

const assistantResponseSchema = z.object({
  kind: z.enum(["explanation", "proposal"]),
  message: z.string().max(20_000),
  proposal: z.string().max(2_000_000).optional(),
});

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function chatEndpoint(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (base.endsWith("/chat/completions")) return base;
  return `${base}/chat/completions`;
}

function modelEndpoint(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (base.endsWith("/chat/completions")) return `${base.replace(/\/chat\/completions$/, "")}/models`;
  return `${base}/models`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new AppError(
        "AI_TIMEOUT",
        `Nhà cung cấp AI không phản hồi trong ${Math.round(timeoutMs / 1000)} giây.`,
        504,
      );
    }
    throw new AppError(
      "AI_UNREACHABLE",
      "Không thể kết nối nhà cung cấp AI. Hãy kiểm tra Base URL và kết nối mạng.",
      502,
    );
  }
}

function providerError(status: number, body: string): AppError {
  let message = `Nhà cung cấp AI trả về lỗi HTTP ${status}.`;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === "string") message = parsed.error;
    else if (parsed.error?.message) message = parsed.error.message;
    else if (parsed.message) message = parsed.message;
  } catch {
    if (body.trim()) message = `${message} ${body.slice(0, 300)}`;
  }
  if (status === 401 || status === 403) {
    return new AppError("AI_AUTH_FAILED", "API key không hợp lệ hoặc không có quyền truy cập model.", 401);
  }
  if (status === 404) {
    return new AppError("AI_MODEL_OR_URL_NOT_FOUND", `Không tìm thấy endpoint hoặc model. ${message}`, 404);
  }
  if (status === 429) {
    return new AppError("AI_RATE_LIMITED", "Nhà cung cấp AI đã giới hạn tần suất hoặc hết quota.", 429);
  }
  return new AppError("AI_PROVIDER_ERROR", message.slice(0, 500), 502);
}

export function providerRuntime(provider: StoredProvider): ProviderRuntime {
  if (!provider.enabled) {
    throw new AppError("AI_DISABLED", "Nhà cung cấp AI đang bị tắt trong Cài đặt.", 409);
  }
  if (!provider.encryptedApiKey) {
    throw new AppError("AI_API_KEY_MISSING", "Chưa cấu hình API key cho nhà cung cấp AI.", 409);
  }
  return {
    id: "openai-compatible",
    displayName: provider.displayName,
    baseUrl: provider.baseUrl,
    model: provider.model,
    apiKey: decryptSecret(provider.encryptedApiKey),
  };
}

export function publicProviderConfig(provider: StoredProvider | null): ProviderPublicConfig {
  return {
    id: "openai-compatible",
    displayName: provider?.displayName ?? "OpenAI-compatible Vision",
    baseUrl: provider?.baseUrl ?? "",
    model: provider?.model ?? "",
    hasApiKey: Boolean(provider?.encryptedApiKey),
    enabled: provider?.enabled ?? false,
    status: provider?.status ?? "not_configured",
    lastCheckedAt: provider?.lastCheckedAt ?? null,
    lastError: provider?.lastError ?? null,
    supportsVision: true,
  };
}

export async function testProvider(provider: StoredProvider): Promise<ProviderTestResult> {
  const runtime = providerRuntime(provider);
  const started = Date.now();
  const headers = {
    Authorization: `Bearer ${runtime.apiKey}`,
    "Content-Type": "application/json",
  };
  try {
    let response = await fetchWithTimeout(
      modelEndpoint(runtime.baseUrl),
      { method: "GET", headers },
      12_000,
    );
    if (!response.ok) {
      // Some OpenAI-compatible servers do not implement /models. Test with a
      // minimal completion rather than assuming the endpoint is invalid.
      response = await fetchWithTimeout(
        chatEndpoint(runtime.baseUrl),
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: runtime.model,
            messages: [{ role: "user", content: "Reply with OK." }],
            max_tokens: 3,
            temperature: 0,
          }),
        },
        20_000,
      );
    }
    if (!response.ok) {
      throw providerError(response.status, await response.text());
    }
    return {
      ok: true,
      status: "connected",
      latencyMs: Date.now() - started,
      message: "Kết nối thành công. Nhà cung cấp phản hồi hợp lệ.",
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError("AI_TEST_FAILED", "Kiểm tra kết nối thất bại.", 502);
    return {
      ok: false,
      status: "failed",
      latencyMs: Date.now() - started,
      message: appError.message,
      checkedAt: new Date().toISOString(),
    };
  }
}

function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new AppError(
      "AI_INVALID_JSON",
      "Nhà cung cấp AI trả về dữ liệu không đúng định dạng JSON.",
      502,
    );
  }
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

async function chatCompletion(
  runtime: ProviderRuntime,
  messages: ChatMessage[],
  options: { maxTokens: number; jsonMode?: boolean; timeoutMs?: number },
): Promise<{ content: string; usage?: { promptTokens?: number; completionTokens?: number } }> {
  const headers = {
    Authorization: `Bearer ${runtime.apiKey}`,
    "Content-Type": "application/json",
  };
  const body: Record<string, unknown> = {
    model: runtime.model,
    messages,
    temperature: 0,
    max_tokens: options.maxTokens,
  };
  if (options.jsonMode) body.response_format = { type: "json_object" };
  let response = await fetchWithTimeout(
    chatEndpoint(runtime.baseUrl),
    { method: "POST", headers, body: JSON.stringify(body) },
    options.timeoutMs ?? 90_000,
  );
  if (!response.ok && options.jsonMode) {
    const firstBody = await response.text();
    if (response.status === 400 || response.status === 422) {
      delete body.response_format;
      response = await fetchWithTimeout(
        chatEndpoint(runtime.baseUrl),
        { method: "POST", headers, body: JSON.stringify(body) },
        options.timeoutMs ?? 90_000,
      );
    } else {
      throw providerError(response.status, firstBody);
    }
  }
  if (!response.ok) throw providerError(response.status, await response.text());
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const rawContent = payload.choices?.[0]?.message?.content;
  const content = Array.isArray(rawContent)
    ? rawContent.map((part) => part.text ?? "").join("")
    : rawContent ?? "";
  if (!content.trim()) {
    throw new AppError("AI_EMPTY_RESPONSE", "Nhà cung cấp AI trả về nội dung rỗng.", 502);
  }
  return {
    content,
    usage: payload.usage
      ? {
          promptTokens: payload.usage.prompt_tokens,
          completionTokens: payload.usage.completion_tokens,
        }
      : undefined,
  };
}

const OCR_PROMPT = `Bạn là một công cụ OCR Toán học. Hãy chép lại CHÍNH XÁC nội dung nhìn thấy trong ảnh.

Quy tắc bắt buộc:
1. KHÔNG giải bài, KHÔNG sửa phép tính, KHÔNG đổi số liệu, KHÔNG thêm giả thiết, KHÔNG suy ra đáp án.
2. Giữ nguyên tiếng Việt và dấu câu.
3. Công thức Toán học đặt riêng thành block "display_math" với LaTeX đầy đủ (không bao quanh bởi $).
4. Văn bản thường đặt thành block "paragraph" với text chép nguyên văn.
5. Bảng đặt thành block "table" với rows là mảng các hàng; mỗi ô là chuỗi văn bản.
6. Nếu một phần nội dung không đọc chắc chắn, vẫn chép phần đọc được, giảm confidence và ghi warning. KHÔNG bịa nội dung.
7. confidence là số từ 0 đến 1 phản ánh độ chắc chắn của lần đọc, không phải độ đúng toán học.

Chỉ trả về JSON theo schema:
{"language":"vi","blocks":[{"type":"paragraph","text":"...","confidence":0.95},{"type":"display_math","latex":"...","confidence":0.8,"warning":"..."}],"warnings":[]}`;

export async function recognizePageImage(
  runtime: ProviderRuntime,
  input: { imageBase64: string; mimeType: string },
): Promise<OcrPageResult> {
  const dataUrl = `data:${input.mimeType};base64,${input.imageBase64}`;
  const result = await chatCompletion(
    runtime,
    [
      { role: "system", content: OCR_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Hãy OCR trang tài liệu Toán này và trả về JSON." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    { maxTokens: 6000, jsonMode: true, timeoutMs: 120_000 },
  );
  const parsed = ocrResponseSchema.safeParse(extractJsonObject(result.content));
  if (!parsed.success) {
    throw new AppError(
      "AI_OCR_SCHEMA",
      "Kết quả OCR không đúng cấu trúc mong đợi. Chưa có dữ liệu nào được áp dụng.",
      502,
      parsed.error.issues.slice(0, 8),
    );
  }
  const blocks: OcrRecognizedBlock[] = parsed.data.blocks.map((block) => ({
    type: block.type,
    text: block.text,
    latex: block.latex,
    confidence: block.confidence,
    warning: block.warning,
    rows: block.rows,
  }));
  return {
    providerId: runtime.id,
    model: runtime.model,
    language: parsed.data.language ?? "unknown",
    blocks,
    warnings: parsed.data.warnings ?? [],
    receivedAt: new Date().toISOString(),
  };
}

const ACTION_INSTRUCTIONS: Record<string, string> = {
  explain_source:
    "Giải thích ngắn gọn cấu trúc và các lệnh LaTeX chính. Không thay đổi nội dung. Trả về kind=explanation, proposal rỗng.",
  fix_syntax:
    "Chỉ sửa lỗi cú pháp LaTeX kỹ thuật. KHÔNG thay đổi bất kỳ số liệu, công thức, tên điểm hay đề bài nào. Trả về kind=proposal và proposal là mã LaTeX đã sửa hoàn chỉnh cho đoạn được cung cấp.",
  suggest_format:
    "Đề xuất cải thiện định dạng/bố cục nhưng không thay đổi nội dung Toán học. Trả về kind=explanation; nêu rõ mọi thay đổi đề xuất để giáo viên tự quyết định.",
  expression_to_latex:
    "Chuyển đúng biểu thức được cung cấp thành LaTeX. Không giải, không thêm nội dung. Trả về kind=proposal và proposal chỉ chứa biểu thức LaTeX.",
  optimize_layout:
    "Đề xuất tối ưu bố cục LaTeX cho dễ đọc/in. Không sửa nội dung Toán học. Trả về kind=explanation.",
  explain_package:
    "Giải thích package hoặc lệnh LaTeX được hỏi. Trả về kind=explanation.",
  build_table:
    "Tạo mã LaTeX cho bảng theo yêu cầu, giữ nguyên dữ liệu người dùng cung cấp. Trả về kind=proposal với đoạn mã LaTeX đầy đủ.",
  build_geometry:
    "Tạo đoạn LaTeX/TikZ minh họa hình học theo yêu cầu, chỉ dùng dữ kiện người dùng cung cấp. Không tự thêm giả thiết. Trả về kind=proposal với mã LaTeX.",
};

export async function runAssistant(
  runtime: ProviderRuntime,
  input: {
    action: string;
    input: string;
    source?: string;
    selection?: string;
  },
): Promise<{ message: string; kind: "explanation" | "proposal"; proposal?: string; usage?: { promptTokens?: number; completionTokens?: number } }> {
  const instruction = ACTION_INSTRUCTIONS[input.action] ?? ACTION_INSTRUCTIONS.suggest_format;
  const context = [
    instruction,
    "Tuyệt đối không tự sửa nội dung Toán học. Nếu có đề xuất thay đổi nội dung, đưa vào message để giáo viên xem trước và xác nhận.",
    "Trả về JSON: {\"kind\":\"explanation\"|\"proposal\",\"message\":\"...\",\"proposal\":\"...\"}.",
    input.selection ? `Đoạn mã đang chọn:\n---\n${input.selection}\n---` : "",
    input.source ? `Mã nguồn hiện tại (có thể bị cắt):\n---\n${input.source.slice(0, 20_000)}\n---` : "",
    `Yêu cầu của giáo viên:\n${input.input.slice(0, 10_000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await chatCompletion(
    runtime,
    [
      {
        role: "system",
        content:
          "Bạn là trợ lý LaTeX cho giáo viên Toán Việt Nam. Ưu tiên bảo toàn nội dung hơn mọi cải tiến. Không bao giờ tự ý sửa số liệu hoặc kết luận Toán học.",
      },
      { role: "user", content: context },
    ],
    { maxTokens: 3500, jsonMode: true, timeoutMs: 90_000 },
  );
  const parsed = assistantResponseSchema.safeParse(extractJsonObject(result.content));
  if (!parsed.success) {
    throw new AppError(
      "AI_ASSISTANT_SCHEMA",
      "Phản hồi của trợ lý không đúng cấu trúc. Chưa có thay đổi nào được áp dụng.",
      502,
      parsed.error.issues.slice(0, 6),
    );
  }
  return {
    kind: parsed.data.kind,
    message: parsed.data.message,
    proposal: parsed.data.proposal,
    usage: result.usage,
  };
}

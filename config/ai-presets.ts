export interface AiProviderPreset {
  id: string;
  label: string;
  description: string;
  baseUrl: string;
  models: Array<{ id: string; label: string; vision: boolean }>;
  docsUrl: string;
}

/**
 * Presets for OpenAI-compatible chat-completions endpoints.
 * Gemini exposes an official OpenAI-compatible API, so it works with the
 * existing provider layer (chat completions + image_url for vision models).
 */
export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Gemini API qua endpoint tương thích OpenAI. Hỗ trợ vision cho OCR.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", vision: true },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", vision: true },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", vision: true },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", vision: true },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite", vision: true },
    ],
    docsUrl: "https://ai.google.dev/gemini-api/docs/openai",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "API OpenAI chính thức (chat completions).",
    baseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-4o", label: "GPT-4o", vision: true },
      { id: "gpt-4o-mini", label: "GPT-4o mini", vision: true },
      { id: "gpt-4.1", label: "GPT-4.1", vision: true },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", vision: true },
    ],
    docsUrl: "https://platform.openai.com/docs",
  },
  {
    id: "custom",
    label: "Tùy chỉnh (OpenAI-compatible)",
    description: "Bất kỳ endpoint nào tương thích /chat/completions (OpenRouter, Azure, local…).",
    baseUrl: "",
    models: [],
    docsUrl: "",
  },
];

export function detectPreset(baseUrl: string): AiProviderPreset | null {
  const normalized = baseUrl.replace(/\/+$/, "").toLowerCase();
  for (const preset of AI_PROVIDER_PRESETS) {
    if (preset.baseUrl && normalized === preset.baseUrl.toLowerCase()) return preset;
  }
  return null;
}

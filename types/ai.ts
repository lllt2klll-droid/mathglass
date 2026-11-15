export type ProviderKind = "openai-compatible";

export type ProviderConnectionStatus =
  | "not_configured"
  | "not_tested"
  | "connected"
  | "failed";

export interface ProviderPublicConfig {
  id: ProviderKind;
  displayName: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  enabled: boolean;
  status: ProviderConnectionStatus;
  lastCheckedAt: string | null;
  lastError: string | null;
  supportsVision: boolean;
}

export interface ProviderSettingsInput {
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
  enabled: boolean;
}

export interface ProviderTestResult {
  ok: boolean;
  status: ProviderConnectionStatus;
  latencyMs: number;
  message: string;
  checkedAt: string;
}

export type AssistantAction =
  | "explain_source"
  | "fix_syntax"
  | "suggest_format"
  | "expression_to_latex"
  | "optimize_layout"
  | "explain_package"
  | "build_table"
  | "build_geometry";

export interface AssistantRequest {
  projectId?: string;
  action: AssistantAction;
  input: string;
  source?: string;
  selection?: string;
}

export interface AssistantResponse {
  action: AssistantAction;
  kind: "explanation" | "proposal";
  message: string;
  proposal?: string;
  provider: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface OcrRecognizedBlock {
  type: "paragraph" | "heading" | "display_math" | "table" | "unknown";
  text?: string;
  latex?: string;
  confidence?: number;
  warning?: string;
  rows?: string[][];
}

export interface OcrPageResult {
  providerId: string;
  model: string;
  language: string;
  blocks: OcrRecognizedBlock[];
  warnings: string[];
  rawText?: string;
  receivedAt: string;
}

"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  CheckCircle2,
  HardDrive,
  KeyRound,
  Loader2,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
  Unplug,
  Wifi,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { AI_PROVIDER_PRESETS, detectPreset } from "@/config/ai-presets";
import { cn, formatBytes } from "@/lib/utils";
import type { ProviderPublicConfig, ProviderTestResult } from "@/types/ai";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/controls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { Alert } from "@/components/ui/alert";

interface ProviderResponse {
  provider: ProviderPublicConfig;
  envFallbackAvailable: boolean;
}

interface WorkspaceResponse {
  workspace: {
    projectCount: number;
    documentCount: number;
    blockCount: number;
    storageBytes: number;
  };
  database: { ephemeral: boolean; path?: string };
}

const THEME_OPTIONS = [
  { value: "light", label: "Sáng", icon: Sun, description: "Giao diện sáng, phù hợp ban ngày" },
  { value: "dark", label: "Tối", icon: Moon, description: "Giao diện tối, giảm mỏi mắt" },
  { value: "system", label: "Hệ thống", icon: Monitor, description: "Theo cài đặt của thiết bị" },
] as const;

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const provider = useApi<ProviderResponse>("/api/settings/provider");
  const workspace = useApi<WorkspaceResponse>("/api/settings/workspace");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cài đặt</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Giao diện, trình biên tập, nhà cung cấp AI và dữ liệu workspace.
        </p>
      </div>

      <Tabs defaultValue="appearance">
        <TabsList>
          <TabsTrigger value="appearance">Giao diện</TabsTrigger>
          <TabsTrigger value="editor">Trình biên tập</TabsTrigger>
          <TabsTrigger value="ai">Nhà cung cấp AI</TabsTrigger>
          <TabsTrigger value="storage">Lưu trữ & Quyền riêng tư</TabsTrigger>
        </TabsList>

        <TabsContent value="appearance">
          <AppearanceTab theme={theme} setTheme={setTheme} />
        </TabsContent>
        <TabsContent value="editor">
          <EditorTab />
        </TabsContent>
        <TabsContent value="ai">
          <AiProviderTab
            data={provider.data}
            loading={provider.loading}
            error={provider.error}
            onSaved={() => provider.refresh()}
          />
        </TabsContent>
        <TabsContent value="storage">
          <StorageTab
            data={workspace.data}
            loading={workspace.loading}
            error={workspace.error}
            onDeleted={() => workspace.refresh()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AppearanceTab({
  theme,
  setTheme,
}: {
  theme: string | undefined;
  setTheme: (value: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Giao diện</CardTitle>
        <CardDescription>Chế độ sáng/tối được lưu trên trình duyệt và áp dụng toàn ứng dụng.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-[14px] border p-4 text-left transition-all",
                  active
                    ? "border-primary bg-[color:var(--mg-highlight)] ring-1 ring-primary/30"
                    : "border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)]/60 hover:border-primary/40",
                )}
                aria-pressed={active}
              >
                <Icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-[11px] leading-relaxed text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function EditorTab() {
  const [fontSize, setFontSize] = React.useState(13);
  const [wordWrap, setWordWrap] = React.useState("on");
  const [autoSave, setAutoSave] = React.useState(true);
  const [tabSize, setTabSize] = React.useState(2);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem("mg-editor-prefs");
        if (raw) {
          const prefs = JSON.parse(raw) as Record<string, unknown>;
          if (typeof prefs.fontSize === "number") setFontSize(prefs.fontSize);
          if (typeof prefs.wordWrap === "string") setWordWrap(prefs.wordWrap);
          if (typeof prefs.autoSave === "boolean") setAutoSave(prefs.autoSave);
          if (typeof prefs.tabSize === "number") setTabSize(prefs.tabSize);
        }
      } catch {
        // Ignore corrupted preferences.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const persist = (patch: Record<string, unknown>) => {
    try {
      const current = JSON.parse(window.localStorage.getItem("mg-editor-prefs") ?? "{}") as Record<
        string,
        unknown
      >;
      window.localStorage.setItem("mg-editor-prefs", JSON.stringify({ ...current, ...patch }));
    } catch {
      // Storage may be unavailable; preferences simply won't persist.
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trình biên tập LaTeX</CardTitle>
        <CardDescription>
          Tùy chỉnh Monaco Editor trong LaTeX Studio. Cài đặt được lưu cục bộ trên trình duyệt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="editor-font-size">Cỡ chữ ({fontSize}px)</Label>
            <input
              id="editor-font-size"
              type="range"
              min={11}
              max={20}
              value={fontSize}
              onChange={(event) => {
                const value = Number(event.target.value);
                setFontSize(value);
                persist({ fontSize: value });
              }}
              className="w-full accent-[color:var(--mg-primary)]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editor-tab-size">Kích thước tab</Label>
            <select
              id="editor-tab-size"
              value={tabSize}
              onChange={(event) => {
                const value = Number(event.target.value);
                setTabSize(value);
                persist({ tabSize: value });
              }}
              className="h-9 w-full rounded-[10px] border border-[color:var(--mg-border-subtle)] bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <option value={2}>2 spaces</option>
              <option value={4}>4 spaces</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2.5 text-sm">
            <Switch
              checked={wordWrap === "on"}
              onCheckedChange={(checked) => {
                const value = checked ? "on" : "off";
                setWordWrap(value);
                persist({ wordWrap: value });
              }}
            />
            Tự xuống dòng
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <Switch
              checked={autoSave}
              onCheckedChange={(checked) => {
                setAutoSave(checked);
                persist({ autoSave: checked });
              }}
            />
            Tự động lưu (debounce)
          </label>
        </div>
        <Alert tone="info">
          Các tùy chọn này được áp dụng khi mở LaTeX Studio. Tự động lưu luôn tạo phiên bản có thể khôi phục.
        </Alert>
      </CardContent>
    </Card>
  );
}

function AiProviderTab({
  data,
  loading,
  error,
  onSaved,
}: {
  data: ProviderResponse | null;
  loading: boolean;
  error: string | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [baseUrl, setBaseUrl] = React.useState("");
  const [model, setModel] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [enabled, setEnabled] = React.useState(false);
  const [presetId, setPresetId] = React.useState<string>("custom");
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<ProviderTestResult | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const initialized = React.useRef(false);

  React.useEffect(() => {
    if (data?.provider && !initialized.current) {
      initialized.current = true;
      setBaseUrl(data.provider.baseUrl);
      setModel(data.provider.model);
      setEnabled(data.provider.enabled);
      setPresetId(detectPreset(data.provider.baseUrl)?.id ?? "custom");
    }
  }, [data]);

  const preset = AI_PROVIDER_PRESETS.find((item) => item.id === presetId) ?? null;
  const presetModels = preset && preset.id !== "custom" ? preset.models : [];

  const applyPreset = (id: string) => {
    setPresetId(id);
    const next = AI_PROVIDER_PRESETS.find((item) => item.id === id);
    if (!next) return;
    if (next.baseUrl) setBaseUrl(next.baseUrl);
    if (next.models.length > 0) setModel(next.models[0].id);
  };

  const provider = data?.provider ?? null;

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/settings/provider", {
        method: "PUT",
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          model: model.trim(),
          apiKey: apiKey.trim() || undefined,
          enabled,
        }),
      });
      setApiKey("");
      toast({ title: "Đã lưu cấu hình AI", tone: "success" });
      onSaved();
    } catch (cause) {
      toast({
        title: "Lưu thất bại",
        description: cause instanceof Error ? cause.message : "Không thể lưu cấu hình.",
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch<{ result: ProviderTestResult }>(
        "/api/settings/provider/test",
        { method: "POST" },
      );
      setTestResult(result.result);
      onSaved();
    } catch (cause) {
      toast({
        title: "Kiểm tra kết nối thất bại",
        description: cause instanceof Error ? cause.message : "Không thể kiểm tra.",
        tone: "danger",
      });
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    try {
      await apiFetch("/api/settings/provider", { method: "DELETE" });
      setBaseUrl("");
      setModel("");
      setApiKey("");
      setEnabled(false);
      initialized.current = false;
      toast({ title: "Đã xóa cấu hình AI", tone: "success" });
      onSaved();
    } catch (cause) {
      toast({
        title: "Xóa thất bại",
        description: cause instanceof Error ? cause.message : "Không thể xóa cấu hình.",
        tone: "danger",
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert tone="danger">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" /> Nhà cung cấp AI tương thích OpenAI
          </CardTitle>
          <CardDescription>
            Dùng cho OCR nâng cao và AI Assistant. API key được mã hóa phía máy chủ và không bao giờ
            trả về trình duyệt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-[12px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)]/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Trạng thái kết nối</p>
              <p className="text-[11px] text-muted-foreground">
                {provider?.lastCheckedAt
                  ? `Kiểm tra lần cuối ${new Date(provider.lastCheckedAt).toLocaleString("vi-VN")}`
                  : "Chưa kiểm tra kết nối"}
              </p>
            </div>
            <StatusBadge status={provider?.status ?? "not_configured"} />
          </div>

          {provider?.lastError ? (
            <Alert tone="warning">Lỗi gần nhất: {provider.lastError}</Alert>
          ) : null}
          {data?.envFallbackAvailable ? (
            <Alert tone="info">
              Biến môi trường OPENAI_API_KEY / MATHGLASS_AI_BASE_URL đang được dùng làm dự phòng khi
              chưa lưu cấu hình riêng.
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ai-preset">Nhà cung cấp</Label>
              <Select value={presetId} onValueChange={applyPreset}>
                <SelectTrigger id="ai-preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDER_PRESETS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {preset?.description ? (
                <p className="text-[11px] text-muted-foreground">{preset.description}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-model">Model</Label>
              {presetModels.length > 0 ? (
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger id="ai-model">
                    <SelectValue placeholder="Chọn model" />
                  </SelectTrigger>
                  <SelectContent>
                    {presetModels.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                        {item.vision ? " · vision" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="ai-model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="model-name"
                />
              )}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ai-base-url">Base URL (HTTPS)</Label>
              <Input
                id="ai-base-url"
                value={baseUrl}
                onChange={(event) => {
                  setBaseUrl(event.target.value);
                  if (detectPreset(event.target.value)?.id !== presetId) setPresetId("custom");
                }}
                placeholder="https://generativelanguage.googleapis.com/v1beta/openai"
                inputMode="url"
              />
              {preset?.docsUrl ? (
                <p className="text-[11px] text-muted-foreground">
                  Tài liệu:{" "}
                  <a
                    href={preset.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {preset.docsUrl}
                  </a>
                </p>
              ) : null}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ai-api-key">API Key {provider?.hasApiKey ? "(đã lưu — để trống nếu không đổi)" : ""}</Label>
              <Input
                id="ai-api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={provider?.hasApiKey ? "••••••••••••" : "AIza... / sk-..."}
                autoComplete="off"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            Bật nhà cung cấp cho tác vụ OCR / AI Assistant
          </label>

          {testResult ? (
            <Alert tone={testResult.ok ? "success" : "danger"}>
              {testResult.ok ? <CheckCircle2 className="size-4" /> : <Unplug className="size-4" />}
              {testResult.message} ({testResult.latencyMs} ms)
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={saving || !baseUrl.trim() || !model.trim()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Lưu cấu hình
            </Button>
            <Button
              variant="secondary"
              onClick={() => void test()}
              disabled={testing || !provider}
            >
              {testing ? <Loader2 className="size-4 animate-spin" /> : <Wifi className="size-4" />}
              Kiểm tra kết nối
            </Button>
            {provider ? (
              <Button variant="ghost" className="text-[color:var(--mg-danger)]" onClick={() => setConfirmRemove(true)}>
                <Trash2 className="size-4" /> Xóa cấu hình
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Xóa cấu hình AI?"
        description="API key đã lưu và toàn bộ tùy chọn nhà cung cấp sẽ bị xóa. Các tác vụ OCR/AI sẽ quay về chế độ chưa cấu hình."
        confirmLabel="Xóa cấu hình"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}

function StorageTab({
  data,
  loading,
  error,
  onDeleted,
}: {
  data: WorkspaceResponse | null;
  loading: boolean;
  error: string | null;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [confirmText, setConfirmText] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const wipe = async () => {
    try {
      await apiFetch("/api/settings/workspace", {
        method: "DELETE",
        body: JSON.stringify({ confirm: confirmText }),
      });
      toast({ title: "Đã xóa toàn bộ dữ liệu workspace", tone: "success" });
      setConfirmOpen(false);
      setConfirmText("");
      onDeleted();
    } catch (cause) {
      toast({
        title: "Xóa thất bại",
        description: cause instanceof Error ? cause.message : "Không thể xóa dữ liệu.",
        tone: "danger",
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert tone="danger">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

  const workspace = data?.workspace;
  const database = data?.database;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="size-4 text-primary" /> Sử dụng lưu trữ
          </CardTitle>
          <CardDescription>
            {database?.ephemeral
              ? "Workspace đang chạy ở chế độ ephemeral — dữ liệu mất khi khởi động lại server."
              : "Dữ liệu được lưu cục bộ trên máy chủ (local-first)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Dự án", value: workspace?.projectCount ?? 0 },
              { label: "Tài liệu", value: workspace?.documentCount ?? 0 },
              { label: "Block nhận diện", value: workspace?.blockCount ?? 0 },
              { label: "Dung lượng", value: formatBytes(workspace?.storageBytes ?? 0) },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[12px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)]/60 px-4 py-3"
              >
                <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
                <dd className="mt-0.5 text-lg font-bold tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card className="border-[color:var(--mg-danger)]/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[color:var(--mg-danger)]">
            <ShieldCheck className="size-4" /> Quyền riêng tư & Xóa dữ liệu
          </CardTitle>
          <CardDescription>
            Xóa toàn bộ dự án, tài liệu nguồn, block nhận diện, phiên bản LaTeX và cấu hình AI của
            workspace hiện tại. Hành động này không thể hoàn tác.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" className="text-[color:var(--mg-danger)]" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-4" /> Xóa toàn bộ dữ liệu workspace
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Xóa toàn bộ dữ liệu?"
        description="Mọi dự án, tệp nguồn và lịch sử chỉnh sửa sẽ bị xóa vĩnh viễn. Nhập “XOA TOAN BO” để xác nhận."
        confirmLabel="Xóa vĩnh viễn"
        destructive
        onConfirm={wipe}
      >
        <div className="space-y-2">
          <Label htmlFor="wipe-confirm">Gõ “XOA TOAN BO” để xác nhận</Label>
          <Input
            id="wipe-confirm"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="XOA TOAN BO"
            autoComplete="off"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}

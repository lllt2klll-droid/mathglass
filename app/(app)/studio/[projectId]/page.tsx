"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { editor as MonacoEditorType } from "monaco-editor";
import {
  ArrowLeft,
  CheckCircle2,
  Code2,
  Download,
  FileCode2,
  FileDown,
  History,
  Loader2,
  RefreshCw,
  Save,
  ScanSearch,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import type {
  LatexVersionDetail,
  LatexVersionSummary,
  ProjectDetail,
} from "@/types/project";
import type { AssistantAction, AssistantResponse, ProviderPublicConfig } from "@/types/ai";
import type { LatexValidationResult } from "@/modules/latex-generator/validate";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LatexPreview } from "@/components/latex-preview";
import { useToast } from "@/components/ui/toast";
import { apiFetch, fetchBlob } from "@/lib/api-client";
import { validateLatex } from "@/modules/latex-generator/validate";
import { formatBytes, formatDateTime, formatRelative, safeFilename } from "@/lib/utils";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((module) => module.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[color:var(--mg-code-bg)] text-xs text-white/60">
        <Loader2 className="mr-2 size-4 animate-spin" /> Đang tải trình soạn thảo…
      </div>
    ),
  },
);

interface LatexPayload {
  source: string;
  lineMap: Record<string, [number, number]>;
  validation: LatexValidationResult;
  projectId: string;
  updatedAt: string;
}

interface VersionPayload {
  items: LatexVersionSummary[];
  currentLatexSource: string;
}

interface HealthPayload {
  provider: ProviderPublicConfig;
  compiler: { configured: boolean; engine: string | null; reason: string };
}

interface SaveResponse {
  project: { updatedAt: string; latexSource: string };
  version: LatexVersionSummary | null;
  validation: LatexValidationResult;
  savedAt: string;
}

const ASSISTANT_ACTIONS: Array<{ value: AssistantAction; label: string; hint: string }> = [
  { value: "fix_syntax", label: "Kiểm tra / sửa cú pháp", hint: "Chỉ đề xuất, không tự áp dụng." },
  { value: "explain_source", label: "Giải thích mã nguồn", hint: "Giải thích cấu trúc LaTeX hiện tại." },
  { value: "suggest_format", label: "Gợi ý định dạng", hint: "Đề xuất bố cục phù hợp giáo viên Toán." },
  { value: "expression_to_latex", label: "Biểu thức → LaTeX", hint: "Nhập biểu thức cần chuyển." },
  { value: "optimize_layout", label: "Tối ưu bố cục", hint: "Đề xuất khoảng cách và cách trình bày." },
  { value: "explain_package", label: "Giải thích package", hint: "Hỏi về gói LaTeX đang dùng." },
  { value: "build_table", label: "Tạo bảng", hint: "Mô tả bảng cần tạo." },
  { value: "build_geometry", label: "Tạo hình học", hint: "Mô tả hình cần dựng bằng TikZ." },
];

function displayProjectName(project: ProjectDetail) {
  return project.name || project.sourceFilename || "Dự án MathGlass";
}

function downloadName(name: string, extension: string) {
  return `${safeFilename(name, "mathglass")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80)}.${extension}`;
}

export default function StudioProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { toast } = useToast();
  const projectApi = useApi<ProjectDetail>(`/api/projects/${projectId}`);
  const latexApi = useApi<LatexPayload>(`/api/projects/${projectId}/latex`);
  const versionsApi = useApi<VersionPayload>(`/api/projects/${projectId}/versions`);
  const healthApi = useApi<HealthPayload>("/api/health");
  const refreshVersions = versionsApi.refresh;

  const [source, setSource] = React.useState("");
  const [savedSource, setSavedSource] = React.useState("");
  const [lineMap, setLineMap] = React.useState<Record<string, [number, number]>>({});
  const [initialized, setInitialized] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [restoring, setRestoring] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [editorReady, setEditorReady] = React.useState(false);
  const [regenerateOpen, setRegenerateOpen] = React.useState(false);
  const [restoreTarget, setRestoreTarget] = React.useState<LatexVersionSummary | null>(null);
  const [versionPreview, setVersionPreview] = React.useState<LatexVersionDetail | null>(null);
  const [versionPreviewLoading, setVersionPreviewLoading] = React.useState(false);
  const [exporting, setExporting] = React.useState<string | null>(null);
  const [assistantAction, setAssistantAction] = React.useState<AssistantAction>("fix_syntax");
  const [assistantInput, setAssistantInput] = React.useState("");
  const [assistantBusy, setAssistantBusy] = React.useState(false);
  const [assistantResult, setAssistantResult] = React.useState<AssistantResponse | null>(null);
  const [assistantError, setAssistantError] = React.useState<string | null>(null);
  const editorRef = React.useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const saveRef = React.useRef<(options?: { snapshot?: boolean; silent?: boolean }) => void>(() => undefined);
  const savingRef = React.useRef(false);
  const failedSourceRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    import("@monaco-editor/react")
      .then(({ loader }) => {
        loader.config({ paths: { vs: "/monaco/vs" } });
        setEditorReady(true);
      })
      .catch(() => setEditorReady(false));
  }, []);

  if (!initialized && latexApi.data) {
    setSource(latexApi.data.source);
    setSavedSource(latexApi.data.source);
    setLineMap(latexApi.data.lineMap);
    setSavedAt(latexApi.data.updatedAt);
    setInitialized(true);
  }

  const deferredSource = React.useDeferredValue(source);
  const liveValidation = React.useMemo(
    () => validateLatex(deferredSource),
    [deferredSource],
  );

  const dirty = initialized && source !== savedSource;
  const errorCount = liveValidation.diagnostics.filter((item) => item.severity === "error").length;
  const warningCount = liveValidation.diagnostics.filter((item) => item.severity === "warning").length;

  const save = React.useCallback(
    async (options: { snapshot?: boolean; silent?: boolean } = {}) => {
      if (!initialized || savingRef.current) return;
      const snapshot = options.snapshot ?? false;
      const snapshotSource = source;
      if (!snapshot && snapshotSource === savedSource) return;
      failedSourceRef.current = null;
      savingRef.current = true;
      setSaving(true);
      setActionError(null);
      try {
        const response = await apiFetch<SaveResponse>(`/api/projects/${projectId}/latex`, {
          method: "PUT",
          body: JSON.stringify({
            source: snapshotSource,
            // Manual edits do not have reliable line ranges; do not pretend they do.
            lineMap: {},
            snapshot,
            summary: snapshot ? "Lưu phiên bản thủ công" : "Chỉnh sửa trong LaTeX Studio",
          }),
        });
        setSavedSource(snapshotSource);
        setLineMap({});
        setSavedAt(response.savedAt);
        refreshVersions();
        if (!options.silent) {
          toast({
            title: snapshot ? "Đã lưu phiên bản" : "Đã lưu mã nguồn",
            description:
              snapshot && !response.version
                ? "Nội dung không thay đổi so với phiên bản gần nhất nên không tạo bản trùng."
                : "Mã nguồn và thời điểm lưu đã được cập nhật.",
            tone: "success",
          });
        }
      } catch (cause) {
        failedSourceRef.current = snapshotSource;
        const message = cause instanceof Error ? cause.message : "Không thể lưu mã LaTeX.";
        setActionError(message);
        toast({ title: "Lưu thất bại", description: message, tone: "danger" });
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [initialized, projectId, refreshVersions, savedSource, source, toast],
  );

  React.useEffect(() => {
    saveRef.current = (options) => {
      void save(options);
    };
  }, [save]);

  React.useEffect(() => {
    if (!dirty || saving || regenerating || restoring) return;
    if (failedSourceRef.current === source) return;
    const timer = setTimeout(() => {
      void save({ silent: true });
    }, 3000);
    return () => clearTimeout(timer);
  }, [dirty, regenerating, restoring, save, saving, source]);

  React.useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const jumpToLine = (line?: number) => {
    if (!line || !editorRef.current) return;
    editorRef.current.revealLineInCenter(line);
    editorRef.current.setPosition({ lineNumber: line, column: 1 });
    editorRef.current.focus();
  };

  const regenerate = async () => {
    setRegenerating(true);
    setActionError(null);
    try {
      const response = await apiFetch<{
        project: ProjectDetail;
        source: string;
        lineMap: Record<string, [number, number]>;
      }>(`/api/projects/${projectId}/latex/regenerate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSource(response.source);
      setSavedSource(response.source);
      setLineMap(response.lineMap);
      setSavedAt(response.project.updatedAt);
      refreshVersions();
      latexApi.refresh();
      toast({
        title: "Đã tạo lại LaTeX",
        description: "Nội dung được tạo từ AST hiện tại và đã tạo một phiên bản mới.",
        tone: "success",
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Không thể tạo lại LaTeX.";
      setActionError(message);
      toast({ title: "Tạo lại thất bại", description: message, tone: "danger" });
    } finally {
      setRegenerating(false);
    }
  };

  const restoreVersion = async () => {
    if (!restoreTarget) return;
    setRestoring(restoreTarget.id);
    setActionError(null);
    try {
      const response = await apiFetch<{ project: ProjectDetail; version: LatexVersionSummary }>(
        `/api/projects/${projectId}/versions/${restoreTarget.id}`,
        { method: "POST" },
      );
      const restoredSource = response.project.latexSource;
      setSource(restoredSource);
      setSavedSource(restoredSource);
      setLineMap({});
      setSavedAt(response.project.updatedAt);
      refreshVersions();
      toast({
        title: "Đã khôi phục phiên bản",
        description: `Phiên bản #${response.version.versionNumber} đã trở thành nội dung hiện tại.`,
        tone: "success",
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Không thể khôi phục phiên bản.";
      setActionError(message);
      toast({ title: "Khôi phục thất bại", description: message, tone: "danger" });
      setRestoreTarget(null);
    } finally {
      setRestoring(null);
    }
  };

  const openVersion = async (version: LatexVersionSummary) => {
    setVersionPreviewLoading(true);
    try {
      const detail = await apiFetch<LatexVersionDetail>(
        `/api/projects/${projectId}/versions/${version.id}`,
      );
      setVersionPreview(detail);
    } catch (cause) {
      toast({
        title: "Không tải được phiên bản",
        description: cause instanceof Error ? cause.message : "Lỗi không xác định.",
        tone: "danger",
      });
    } finally {
      setVersionPreviewLoading(false);
    }
  };

  const exportProject = async (format: "tex" | "zip" | "pdf") => {
    setExporting(format);
    setActionError(null);
    try {
      const blob = await fetchBlob(`/api/projects/${projectId}/export?format=${format}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadName(projectApi.data?.name || "mathglass", format);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast({
        title: "Đã tạo bản xuất",
        description: `${format.toUpperCase()} · ${formatBytes(blob.size)}. Tệp được tải trực tiếp từ máy chủ.`,
        tone: "success",
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Không thể xuất dự án.";
      setActionError(message);
      toast({ title: "Xuất thất bại", description: message, tone: "danger" });
    } finally {
      setExporting(null);
    }
  };

  const runAssistant = async () => {
    const input = assistantInput.trim();
    if (!input) {
      setAssistantError("Hãy nhập yêu cầu trước khi gọi trợ lý.");
      return;
    }
    setAssistantBusy(true);
    setAssistantError(null);
    setAssistantResult(null);
    try {
      const editor = editorRef.current;
      const model = editor?.getModel();
      const selection = editor?.getSelection();
      const selected = model && selection ? model.getValueInRange(selection) : undefined;
      const response = await apiFetch<AssistantResponse>("/api/ai/assistant", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          action: assistantAction,
          input,
          source: source.slice(0, 20000),
          selection: selected?.trim() || undefined,
        }),
      });
      setAssistantResult(response);
    } catch (cause) {
      setAssistantError(cause instanceof Error ? cause.message : "Trợ lý không phản hồi.");
    } finally {
      setAssistantBusy(false);
    }
  };

  const insertProposal = (proposal: string) => {
    const editor = editorRef.current;
    if (!editor) {
      setSource((current) => `${current}\n\n${proposal}`);
      return;
    }
    const selection = editor.getSelection();
    if (selection) {
      editor.executeEdits("mathglass-assistant", [
        { range: selection, text: proposal, forceMoveMarkers: true },
      ]);
    } else {
      const model = editor.getModel();
      if (!model) return;
      const end = model.getFullModelRange().getEndPosition();
      editor.executeEdits("mathglass-assistant", [
        { range: { startLineNumber: end.lineNumber, startColumn: end.column, endLineNumber: end.lineNumber, endColumn: end.column }, text: `\n\n${proposal}` },
      ]);
    }
    editor.focus();
    toast({
      title: "Đã chèn đề xuất vào editor",
      description: "Đề xuất chưa được lưu. Hãy kiểm tra nội dung và bấm Lưu.",
      tone: "info",
    });
  };

  const project = projectApi.data;
  const loading = (projectApi.loading && !project) || (latexApi.loading && !latexApi.data);
  const loadError = projectApi.error || latexApi.error;
  const providerReady = Boolean(healthApi.data?.provider.enabled && healthApi.data?.provider.hasApiKey);
  const compilerReady = Boolean(healthApi.data?.compiler.configured);
  const selectedVersionIsCurrent = restoreTarget?.isCurrent ?? false;

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-3">
        <Skeleton className="h-20 rounded-[20px]" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-[620px] rounded-[18px]" />
          <Skeleton className="h-[620px] rounded-[18px]" />
        </div>
      </div>
    );
  }

  if (loadError && (!project || !latexApi.data)) {
    return (
      <div className="mx-auto max-w-3xl">
        <Alert tone="danger" title="Không mở được LaTeX Studio">
          {loadError}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => { projectApi.refresh(); latexApi.refresh(); }}>
              Thử lại
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/library">Về thư viện</Link>
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div id="main-content" className="mx-auto max-w-7xl space-y-4">
      <section className="rounded-[20px] border border-[color:var(--mg-border)] bg-[color:var(--mg-glass-strong)] p-4 backdrop-blur-xl sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Link href="/library" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Thư viện
            </Link>
            <span aria-hidden>/</span>
            <span className="font-mono">{project.id.slice(0, 8)}…</span>
            <StatusBadge status={project.status} />
            {project.needsReviewCount > 0 ? (
              <Link
                href={`/accuracy/${project.id}`}
                className="inline-flex items-center gap-1 rounded-full bg-[color:var(--mg-warning-soft)] px-2 py-0.5 font-semibold text-[color:var(--mg-warning)] hover:underline"
              >
                <ScanSearch className="size-3" />
                {project.needsReviewCount} mục cần kiểm tra
              </Link>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
                {displayProjectName(project)}
              </h1>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {project.pageCount ?? "?"} trang · {project.blockCount} block ·{" "}
                {project.mathBlockCount} block công thức ·{" "}
                {project.document?.originalFilename ?? project.sourceFilename}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button asChild size="sm" variant="secondary">
                <Link href={`/accuracy/${project.id}`}>
                  <ScanSearch className="size-3.5" /> Accuracy Lab
                </Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setRegenerateOpen(true)}
                loading={regenerating}
              >
                <RefreshCw className="size-3.5" /> Tạo lại từ AST
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="secondary" loading={Boolean(exporting)}>
                    <FileDown className="size-3.5" /> Xuất bản
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[250px]">
                  <DropdownMenuLabel>Bản xuất từ dự án hiện tại</DropdownMenuLabel>
                  <DropdownMenuItem
                    disabled={Boolean(exporting)}
                    onSelect={() => void exportProject("tex")}
                  >
                    <FileCode2 /> Tải tệp .tex
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={Boolean(exporting)}
                    onSelect={() => void exportProject("zip")}
                  >
                    <Download /> Tải gói .zip (kèm assets)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={!compilerReady || Boolean(exporting)}
                    onSelect={() => void exportProject("pdf")}
                  >
                    <FileDown /> Biên dịch PDF
                  </DropdownMenuItem>
                  <p className="px-2.5 pb-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    {compilerReady
                      ? `Sandbox compiler · ${healthApi.data?.compiler.engine ?? "xelatex"}`
                      : "PDF bị tắt: chưa cấu hình MATHGLASS_COMPILER_URL. MathGlass không tạo PDF giả."}
                  </p>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </section>

      {actionError ? (
        <Alert tone="danger" title="Tác vụ chưa hoàn tất">
          {actionError}
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => setActionError(null)}>
              Đóng
            </Button>
          </div>
        </Alert>
      ) : null}

      {!compilerReady ? (
        <Alert tone="info" title="PDF compilation đang tắt">
          {healthApi.data?.compiler.reason ??
            "Chưa cấu hình dịch vụ biên dịch sandbox. Xuất .tex/.zip vẫn hoạt động."}
        </Alert>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-glass-strong)] px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
              <Code2 className="size-3.5 text-primary" /> Mã nguồn LaTeX
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                dirty
                  ? "bg-[color:var(--mg-warning-soft)] text-[color:var(--mg-warning)]"
                  : "bg-[color:var(--mg-success-soft)] text-[color:var(--mg-success)]",
              )}
            >
              {saving ? (
                <>
                  <Loader2 className="size-3 animate-spin" /> Đang lưu
                </>
              ) : dirty ? (
                <>
                  <TriangleAlert className="size-3" /> Chưa lưu
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3" /> Đã lưu
                </>
              )}
            </span>
            <span className="hidden text-[10px] text-muted-foreground sm:inline">
              {savedAt ? `Lưu ${formatRelative(savedAt)}` : "Chưa lưu"} ·{" "}
              {formatBytes(new Blob([source]).size)} · {source.split(/\r?\n/).length} dòng
            </span>
            <div className="flex-1" />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void save({ snapshot: true })}
              disabled={saving || regenerating}
              title="Tạo một phiên bản có thể khôi phục"
            >
              <History className="size-3.5" /> Lưu phiên bản
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void save({})}
              loading={saving}
              disabled={regenerating || (!dirty && source === savedSource)}
            >
              <Save className="size-3.5" /> Lưu
            </Button>
          </div>
          <div className="mg-editor-shell h-[560px] w-full overflow-hidden">
            {editorReady ? (
              <MonacoEditor
                height="100%"
                language="latex"
                theme="vs-dark"
                value={source}
                onChange={(value) => setSource(value ?? "")}
                onMount={(editor, monaco) => {
                  editorRef.current = editor;
                  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                    saveRef.current({});
                  });
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: "JetBrains Mono Variable, monospace",
                  wordWrap: "on",
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  padding: { top: 12, bottom: 12 },
                  renderWhitespace: "selection",
                  bracketPairColorization: { enabled: true },
                  fixedOverflowWidgets: true,
                }}
                loading={
                  <div className="flex h-full items-center justify-center bg-[color:var(--mg-code-bg)] text-xs text-white/60">
                    <Loader2 className="mr-2 size-4 animate-spin" /> Đang tải editor…
                  </div>
                }
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-white/60">
                <Loader2 className="mr-2 size-4 animate-spin" /> Đang tải editor…
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--mg-border-subtle)] px-3 py-2 text-[10px] text-muted-foreground">
            <span className={errorCount > 0 ? "font-semibold text-[color:var(--mg-danger)]" : "text-[color:var(--mg-success)]"}>
              {errorCount} lỗi
            </span>
            <span className={warningCount > 0 ? "font-semibold text-[color:var(--mg-warning)]" : ""}>
              {warningCount} cảnh báo
            </span>
            <span>Ctrl/Cmd + S để lưu · tự động lưu sau 3 giây</span>
            <div className="flex-1" />
            <a
              href={`/api/projects/${project.id}/source?download=true`}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Download className="size-3" /> Tệp nguồn gốc
            </a>
          </div>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <Tabs defaultValue="preview" className="flex h-[655px] flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-glass-strong)] px-3 py-2">
              <TabsList className="h-8">
                <TabsTrigger value="preview" className="text-[11px]">
                  Preview
                </TabsTrigger>
                <TabsTrigger value="diagnostics" className="text-[11px]">
                  Kiểm tra
                  {errorCount + warningCount > 0 ? (
                    <span className="ml-1 rounded-full bg-[color:var(--mg-danger-soft)] px-1.5 text-[9px] text-[color:var(--mg-danger)]">
                      {errorCount + warningCount}
                    </span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="versions" className="text-[11px]">
                  Phiên bản {versionsApi.data ? `(${versionsApi.data.items.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="assistant" className="text-[11px]">
                  Trợ lý
                </TabsTrigger>
              </TabsList>
              <div className="flex-1" />
              <span className="text-[10px] text-muted-foreground">
                {lineMap && Object.keys(lineMap).length > 0
                  ? `${Object.keys(lineMap).length} block có line map`
                  : "Line map trống sau chỉnh sửa thủ công"}
              </span>
            </div>
            <TabsContent value="preview" className="mg-scrollbar mt-0 flex-1 overflow-y-auto p-4">
              <LatexPreview source={source} />
            </TabsContent>
            <TabsContent value="diagnostics" className="mg-scrollbar mt-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-3">
                {liveValidation.valid ? (
                  <Alert tone="success" title="Không phát hiện lỗi cú pháp">
                    Kiểm tra cục bộ đối với dấu ngoặc, môi trường, math delimiter và lệnh bị chặn.
                    Đây không phải biên dịch TeX đầy đủ.
                  </Alert>
                ) : (
                  <Alert tone="danger" title="Mã nguồn chưa hợp lệ">
                    Sửa các lỗi bên dưới trước khi xuất PDF. `.tex` vẫn có thể tải xuống để kiểm tra
                    cục bộ.
                  </Alert>
                )}
                {liveValidation.diagnostics.length === 0 ? (
                  <p className="rounded-[12px] border border-dashed border-[color:var(--mg-border-subtle)] p-4 text-center text-xs text-muted-foreground">
                    Không có chẩn đoán nào.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {liveValidation.diagnostics.map((diagnostic, index) => (
                      <li key={`${diagnostic.code}-${index}`}>
                        <button
                          type="button"
                          onClick={() => jumpToLine(diagnostic.line)}
                          className={cn(
                            "w-full rounded-[10px] border p-2.5 text-left text-xs transition-colors",
                            diagnostic.severity === "error"
                              ? "border-[color:var(--mg-danger)]/30 bg-[color:var(--mg-danger-soft)]"
                              : diagnostic.severity === "warning"
                                ? "border-[color:var(--mg-warning)]/30 bg-[color:var(--mg-warning-soft)]"
                                : "border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)]",
                          )}
                        >
                          <span className="font-mono text-[10px] uppercase text-muted-foreground">
                            {diagnostic.severity} · {diagnostic.code}
                            {diagnostic.line ? ` · dòng ${diagnostic.line}` : ""}
                          </span>
                          <span className="mt-1 block leading-relaxed">{diagnostic.message}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="rounded-[12px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)] p-3 text-[11px] text-muted-foreground">
                  <p className="font-semibold text-foreground">Môi trường đã nhận diện</p>
                  <p className="mt-1 break-words font-mono text-[10px]">
                    {liveValidation.environments.length
                      ? [...new Set(liveValidation.environments)].join(", ")
                      : "Không có"}
                  </p>
                  <p className="mt-2 font-semibold text-foreground">Tài nguyên tham chiếu</p>
                  <p className="mt-1 break-words font-mono text-[10px]">
                    {liveValidation.referencedAssets.length
                      ? liveValidation.referencedAssets.join(", ")
                      : "Không có"}
                  </p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="versions" className="mg-scrollbar mt-0 flex-1 overflow-y-auto p-3">
              {versionsApi.loading && !versionsApi.data ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 rounded-[12px]" />
                  <Skeleton className="h-14 rounded-[12px]" />
                </div>
              ) : versionsApi.error ? (
                <Alert tone="danger" title="Không tải được phiên bản">
                  {versionsApi.error}
                  <Button size="sm" variant="secondary" className="mt-2" onClick={versionsApi.refresh}>
                    Thử lại
                  </Button>
                </Alert>
              ) : !versionsApi.data || versionsApi.data.items.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="Chưa có phiên bản nào"
                  description="Lưu phiên bản đầu tiên để có thể quay lại nội dung này về sau. Việc tạo lại từ AST cũng tạo phiên bản."
                  action={
                    <Button size="sm" onClick={() => void save({ snapshot: true })} disabled={saving}>
                      <History className="size-3.5" /> Lưu phiên bản đầu tiên
                    </Button>
                  }
                />
              ) : (
                <ul className="space-y-1.5">
                  {versionsApi.data.items.map((version) => (
                    <li
                      key={version.id}
                      className={cn(
                        "rounded-[12px] border p-3",
                        version.isCurrent
                          ? "border-[color:var(--mg-primary)]/35 bg-[color:var(--mg-highlight)]"
                          : "border-[color:var(--mg-border-subtle)]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold">
                            Phiên bản #{version.versionNumber}
                            {version.isCurrent ? (
                              <span className="ml-2 text-[10px] font-semibold text-primary">Hiện tại</span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {version.changeSummary}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {formatDateTime(version.createdAt)} · {formatBytes(version.sourceSize)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void openVersion(version)}
                            disabled={versionPreviewLoading}
                          >
                            Xem
                          </Button>
                          {!version.isCurrent ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => setRestoreTarget(version)}
                              disabled={Boolean(restoring)}
                            >
                              Khôi phục
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="assistant" className="mg-scrollbar mt-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-3">
                <div className="rounded-[12px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)] p-3 text-[11px] leading-relaxed text-muted-foreground">
                  <p className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Sparkles className="size-3.5 text-primary" /> Trợ lý không tự áp dụng thay đổi
                  </p>
                  <p className="mt-1">
                    Mọi đề xuất chỉ được hiển thị. Bạn phải kiểm tra và chủ động chèn vào editor.
                    MathGlass không tự sửa số liệu, công thức hay kết luận Toán học.
                  </p>
                </div>
                {!providerReady ? (
                  <Alert tone="warning" title="Trợ lý AI chưa được cấu hình">
                    Không có kết quả nào được tạo. Hãy cấu hình provider trong{" "}
                    <Link href="/settings" className="font-semibold text-primary hover:underline">
                      Cài đặt
                    </Link>
                    .
                  </Alert>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="assistant-action">Hành động</Label>
                  <Select
                    value={assistantAction}
                    onValueChange={(value) => setAssistantAction(value as AssistantAction)}
                  >
                    <SelectTrigger id="assistant-action">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSISTANT_ACTIONS.map((action) => (
                        <SelectItem key={action.value} value={action.value}>
                          {action.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    {ASSISTANT_ACTIONS.find((item) => item.value === assistantAction)?.hint}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="assistant-input">Yêu cầu</Label>
                  <Textarea
                    id="assistant-input"
                    value={assistantInput}
                    onChange={(event) => setAssistantInput(event.target.value)}
                    placeholder="Ví dụ: kiểm tra lỗi môi trường trong mã nguồn và đề xuất cách sửa an toàn…"
                    rows={3}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Trợ lý nhận tối đa 20.000 ký tự đầu của mã nguồn và đoạn đang chọn (nếu có).
                  </p>
                </div>
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => void runAssistant()}
                  loading={assistantBusy}
                  disabled={!providerReady}
                >
                  <Wand2 className="size-4" /> Gửi yêu cầu
                </Button>
                {assistantError ? (
                  <Alert tone="danger" title="Trợ lý không phản hồi">
                    {assistantError}
                  </Alert>
                ) : null}
                {assistantResult ? (
                  <div className="rounded-[12px] border border-[color:var(--mg-border-subtle)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {assistantResult.kind === "proposal" ? "Đề xuất" : "Giải thích"} ·{" "}
                      {assistantResult.provider} / {assistantResult.model}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">
                      {assistantResult.message}
                    </p>
                    {assistantResult.proposal ? (
                      <>
                        <pre className="mg-scrollbar mt-2 max-h-56 overflow-auto rounded-[8px] bg-[color:var(--mg-code-bg)] p-2.5 font-mono text-[10px] leading-relaxed text-[color:var(--mg-code-text)]">
                          {assistantResult.proposal}
                        </pre>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="mt-2"
                          onClick={() => insertProposal(assistantResult.proposal!)}
                        >
                          <Code2 className="size-3.5" /> Chèn vào editor
                        </Button>
                      </>
                    ) : null}
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Đề xuất chưa được áp dụng hoặc lưu. Hãy đối chiếu với tài liệu gốc.
                    </p>
                  </div>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      <ConfirmDialog
        open={regenerateOpen}
        onOpenChange={setRegenerateOpen}
        title="Tạo lại LaTeX từ cấu trúc tài liệu?"
        description="Nội dung hiện tại trong editor sẽ được thay bằng LaTeX sinh từ AST. MathGlass sẽ tạo một phiên bản mới trước khi thay đổi. Các chỉnh sửa thủ công chưa lưu có thể bị mất."
        confirmLabel="Tạo lại và lưu phiên bản"
        onConfirm={regenerate}
      />

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
        title={
          restoreTarget
            ? `Khôi phục phiên bản #${restoreTarget.versionNumber}?`
            : "Khôi phục phiên bản?"
        }
        description={
          selectedVersionIsCurrent
            ? "Đây là phiên bản hiện tại."
            : "Nội dung hiện tại sẽ được thay bằng phiên bản đã chọn. MathGlass tạo một phiên bản khôi phục mới, không xóa lịch sử."
        }
        confirmLabel="Khôi phục"
        onConfirm={restoreVersion}
      />

      <Dialog
        open={Boolean(versionPreview)}
        onOpenChange={(open) => {
          if (!open) setVersionPreview(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Phiên bản #{versionPreview?.versionNumber ?? "?"}
            </DialogTitle>
            <DialogDescription>
              {versionPreview
                ? `${versionPreview.changeSummary} · ${formatDateTime(versionPreview.createdAt)} · ${formatBytes(versionPreview.sourceSize)}`
                : "Đang tải…"}
            </DialogDescription>
          </DialogHeader>
          <pre className="mg-scrollbar max-h-[62dvh] overflow-auto rounded-[12px] bg-[color:var(--mg-code-bg)] p-3 font-mono text-[11px] leading-relaxed text-[color:var(--mg-code-text)]">
            {versionPreview?.source ?? ""}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

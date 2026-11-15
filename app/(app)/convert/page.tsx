"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Code2,
  FileImage,
  FileText,
  Files,
  Loader2,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { DEFAULT_CONVERSION_SETTINGS, type ConversionJob, type ConversionSettings, type ProjectDetail } from "@/types/project";
import type { ApiResponse } from "@/types/api";
import type { ProviderPublicConfig } from "@/types/ai";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Progress, Separator } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConversionSettingsForm } from "@/components/conversion-settings-form";
import { PdfPreview } from "@/components/pdf-preview";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { formatBytes, stripExtension } from "@/lib/utils";
import { useApi } from "@/lib/use-api";

interface HealthResponse {
  limits: { maxUploadBytes: number; maxPages: number };
  provider: ProviderPublicConfig;
  compiler: { configured: boolean; engine: string | null; reason: string };
  database: { ephemeral: boolean };
}

interface UploadPayload {
  project: ProjectDetail;
  job: ConversionJob | null;
  detected: { type: string; mimeType: string; pageCount: number | null };
}

interface JobLike extends ConversionJob {
  stageDetail?: string;
  cancelRequested?: boolean;
}

interface JobPayload {
  job: JobLike | null;
  project: ProjectDetail;
  structure: { pageCount: number; blockCount: number; mathBlockCount: number } | null;
}

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".png", ".jpg", ".jpeg"];
const TERMINAL_STATUSES = new Set(["completed", "needs_review", "failed", "cancelled"]);

function fileKind(file: File): "pdf" | "docx" | "image" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image";
  if (file.type === "image/png" || file.type === "image/jpeg") return "image";
  return null;
}

export default function ConvertPage() {
  const { toast } = useToast();
  const health = useApi<HealthResponse>("/api/health");
  const [file, setFile] = React.useState<File | null>(null);
  const [name, setName] = React.useState("");
  const [settings, setSettings] = React.useState<ConversionSettings>(DEFAULT_CONVERSION_SETTINGS);
  const [dragging, setDragging] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [project, setProject] = React.useState<ProjectDetail | null>(null);
  const [job, setJob] = React.useState<JobLike | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pollNote, setPollNote] = React.useState<string | null>(null);
  const xhrRef = React.useRef<XMLHttpRequest | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const previewUrl = React.useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  React.useEffect(() => {
    return () => xhrRef.current?.abort();
  }, []);

  const maxUploadBytes = health.data?.limits.maxUploadBytes ?? 25 * 1024 * 1024;
  const maxPages = health.data?.limits.maxPages ?? 80;
  const providerReady = Boolean(health.data?.provider.enabled && health.data?.provider.hasApiKey);

  const acceptFile = (candidate: File) => {
    setError(null);
    if (!fileKind(candidate)) {
      setError("Chỉ hỗ trợ PDF, DOCX, PNG và JPG. Tệp không được tải lên.");
      return;
    }
    if (candidate.size <= 0) {
      setError("Tệp rỗng. Hãy chọn tệp khác.");
      return;
    }
    if (candidate.size > maxUploadBytes) {
      setError(`Tệp vượt quá giới hạn ${formatBytes(maxUploadBytes)}.`);
      return;
    }
    setFile(candidate);
    setName(stripExtension(candidate.name).slice(0, 160));
    setProject(null);
    setJob(null);
    setProcessing(false);
    setUploadProgress(0);
  };

  const onDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (uploading || project) return;
    const candidate = event.dataTransfer.files?.[0];
    if (candidate) acceptFile(candidate);
  };

  const reset = () => {
    if (processing) return;
    setFile(null);
    setProject(null);
    setJob(null);
    setName("");
    setSettings(DEFAULT_CONVERSION_SETTINGS);
    setError(null);
    setPollNote(null);
    setUploadProgress(0);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const upload = () => {
    if (!file || uploading) return;
    setError(null);
    setUploading(true);
    setUploadProgress(0);

    const form = new FormData();
    form.set("file", file);
    form.set("name", name.trim() || stripExtension(file.name));
    form.set("settings", JSON.stringify(settings));

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/import");
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        setUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setError("Không thể tải tệp lên. Kiểm tra kết nối mạng và thử lại.");
      xhrRef.current = null;
    };
    xhr.onabort = () => {
      setUploading(false);
      xhrRef.current = null;
    };
    xhr.onload = () => {
      xhrRef.current = null;
      setUploading(false);
      let payload: ApiResponse<UploadPayload> | null = null;
      try {
        payload = JSON.parse(xhr.responseText) as ApiResponse<UploadPayload>;
      } catch {
        setError("Máy chủ trả về phản hồi không hợp lệ khi tải tệp.");
        return;
      }
      if (!payload || payload.ok === false) {
        setError(
          payload && payload.ok === false
            ? payload.error.message
            : `Tải tệp thất bại (HTTP ${xhr.status}).`,
        );
        return;
      }
      setUploadProgress(100);
      setProject(payload.data.project);
      setSettings(payload.data.project.settings);
      if (payload.data.job) {
        setJob(payload.data.job as JobLike);
        setProcessing(true);
      }
      toast({
        title: "Đã tải tệp lên",
        description:
          payload.data.job
            ? "MathGlass đang xử lý tài liệu."
            : "Kiểm tra cấu hình rồi bắt đầu chuyển đổi.",
        tone: "success",
      });
    };
    xhr.send(form);
  };

  const startConversion = async () => {
    if (!project || processing) return;
    setError(null);
    setPollNote(null);
    setStarting(true);
    try {
      const response = await apiFetch<{ job: JobLike; project: ProjectDetail }>(
        `/api/projects/${project.id}/process`,
        { method: "POST", body: JSON.stringify({ settings }) },
      );
      setProject(response.project);
      setJob(response.job);
      setProcessing(true);
      toast({
        title: "Đã bắt đầu chuyển đổi",
        description: "MathGlass đang phân tích tài liệu. Không có kết quả giả được tạo trong lúc chờ.",
        tone: "info",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể bắt đầu chuyển đổi.");
    } finally {
      setStarting(false);
    }
  };

  const projectId = project?.id;

  React.useEffect(() => {
    if (!projectId || !processing) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;

    const poll = async () => {
      try {
        const data = await apiFetch<JobPayload>(
          `/api/projects/${projectId}/job?includeStructure=true`,
        );
        if (!alive) return;
        failures = 0;
        setJob(data.job);
        setProject(data.project);
        setPollNote(null);
        if (data.job && TERMINAL_STATUSES.has(data.job.status)) {
          setProcessing(false);
          return;
        }
        if (!data.job) {
          setProcessing(false);
          setError("Không tìm thấy tác vụ chuyển đổi. Hãy bắt đầu lại.");
          return;
        }
        timer = setTimeout(poll, 1200);
      } catch (cause) {
        if (!alive) return;
        failures += 1;
        if (failures >= 5) {
          setProcessing(false);
          setError(
            cause instanceof Error
              ? `Không theo dõi được tác vụ: ${cause.message}`
              : "Không theo dõi được tác vụ chuyển đổi.",
          );
          return;
        }
        setPollNote("Kết nối tạm thời gián đoạn, đang thử lại…");
        timer = setTimeout(poll, 1600 * failures);
      }
    };

    void poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, processing]);

  const cancelJob = async () => {
    if (!project) return;
    try {
      const cancelled = await apiFetch<JobLike>(`/api/projects/${project.id}/job/cancel`, {
        method: "POST",
      });
      setJob(cancelled);
      toast({
        title: "Đã gửi yêu cầu hủy",
        description: "Tác vụ sẽ dừng ở điểm kiểm tra an toàn tiếp theo.",
        tone: "warning",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể hủy tác vụ.");
    }
  };

  const terminal = job && TERMINAL_STATUSES.has(job.status);
  const failed = job?.status === "failed" || project?.status === "failed";
  const finished = terminal && !failed;
  const needsReview = project?.status === "needs_review" || job?.status === "needs_review";
  const kind = file ? fileKind(file) : null;

  return (
    <div id="main-content" className="mx-auto max-w-7xl space-y-5">
      <section className="relative overflow-hidden rounded-[22px] border border-[color:var(--mg-border)] bg-[color:var(--mg-glass-strong)] p-5 backdrop-blur-xl sm:p-6">
        <div
          className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-[radial-gradient(circle,rgba(108,168,245,0.3),transparent_65%)]"
          aria-hidden
        />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mg-primary)]/20 bg-[color:var(--mg-highlight)] px-2.5 py-1 text-[11px] font-semibold text-primary">
              <Sparkles className="size-3.5" />
              Import Studio
            </p>
            <h1 className="mt-3 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
              Tải tài liệu, rồi chuyển đổi khi cấu hình đã sẵn sàng
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              MathGlass chỉ bắt đầu phân tích sau khi bạn xác nhận. Tệp nguồn được kiểm tra chữ ký
              thật, mọi nội dung chưa chắc chắn được đưa vào Accuracy Lab thay vì tự sửa.
            </p>
          </div>
          <div className="shrink-0 rounded-[14px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)] px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Giới hạn hiện tại</p>
            <p>
              {formatBytes(maxUploadBytes)} / tệp · tối đa {maxPages} trang
            </p>
            <p className="mt-1">
              PDF/DOCX · PNG/JPG cần OCR provider để có nội dung văn bản.
            </p>
          </div>
        </div>
      </section>

      {health.data?.database.ephemeral ? (
        <Alert tone="warning" title="Workspace đang dùng lưu trữ tạm thời">
          Dữ liệu có thể mất sau khi máy chủ khởi động lại. Hãy xuất `.tex`/`.zip` sau khi chuyển
          đổi, hoặc cấu hình `MATHGLASS_DATA_DIR` (adapter Supabase chưa được triển khai).
        </Alert>
      ) : null}

      {!providerReady && file?.type.startsWith("image/") ? (
        <Alert tone="info" title="Ảnh sẽ chưa được nhận diện văn bản">
          Chưa cấu hình vision provider. MathGlass vẫn có thể tạo dự án và giữ ảnh gốc, nhưng sẽ
          đánh dấu trang là cần OCR — không tạo nội dung giả.{" "}
          <Link href="/settings" className="font-semibold text-primary hover:underline">
            Cấu hình provider
          </Link>
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger" title="Không thể tiếp tục">
          {error}
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => setError(null)}>
              Đóng
            </Button>
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Tệp nguồn</CardTitle>
              <CardDescription>
                {file
                  ? `${file.name} · ${formatBytes(file.size)}`
                  : "Chọn PDF, DOCX hoặc ảnh đề bài để bắt đầu."}
              </CardDescription>
            </div>
            {project ? (
              <StatusBadge status={project.status} />
            ) : file ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={uploading}
                onClick={reset}
              >
                <X className="size-3.5" /> Bỏ chọn
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {!file ? (
              <label
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`flex min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-[18px] border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  dragging
                    ? "border-primary bg-[color:var(--mg-highlight)]"
                    : "border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)]/55 hover:border-[color:var(--mg-primary)]/45"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS.join(",")}
                  className="sr-only"
                  onChange={(event) => {
                    const candidate = event.target.files?.[0];
                    if (candidate) acceptFile(candidate);
                  }}
                />
                <span className="grid size-14 place-items-center rounded-[18px] bg-[color:var(--mg-highlight)] text-primary">
                  <UploadCloud className="size-7" />
                </span>
                <p className="mt-4 text-base font-semibold">Kéo thả tệp vào đây</p>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                  Hoặc bấm để chọn tệp. Hỗ trợ `.pdf`, `.docx`, `.png`, `.jpg` — tối đa{" "}
                  {formatBytes(maxUploadBytes)}.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded-full border border-[color:var(--mg-border-subtle)] px-2.5 py-1">
                    PDF text layer hoặc scan
                  </span>
                  <span className="rounded-full border border-[color:var(--mg-border-subtle)] px-2.5 py-1">
                    DOCX + OMML
                  </span>
                  <span className="rounded-full border border-[color:var(--mg-border-subtle)] px-2.5 py-1">
                    Ảnh có đánh dấu OCR
                  </span>
                </div>
              </label>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)] px-3 py-2.5">
                  <span className="grid size-9 place-items-center rounded-[10px] bg-[color:var(--mg-highlight)] text-primary">
                    {kind === "image" ? (
                      <FileImage className="size-4" />
                    ) : kind === "docx" ? (
                      <Files className="size-4" />
                    ) : (
                      <FileText className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{file.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatBytes(file.size)} ·{" "}
                      {kind === "pdf" ? "PDF" : kind === "docx" ? "Word OOXML" : "Hình ảnh"}
                      {project?.pageCount ? ` · ${project.pageCount} trang` : ""}
                    </p>
                  </div>
                  {project ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-[color:var(--mg-success)]">
                      <CheckCircle2 className="size-3.5" /> Đã tải lên
                    </span>
                  ) : uploading ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-[color:var(--mg-info)]">
                      <Loader2 className="size-3.5 animate-spin" /> {uploadProgress}%
                    </span>
                  ) : null}
                </div>

                {kind === "pdf" && previewUrl ? (
                  <PdfPreview
                    url={previewUrl}
                    title={file.name}
                    className="h-[540px]"
                    onPageChange={() => undefined}
                  />
                ) : kind === "image" && previewUrl ? (
                  <div className="mg-scrollbar flex max-h-[540px] min-h-[260px] items-center justify-center overflow-auto rounded-[16px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-canvas)] p-3">
                    {/* Local object URL preview of the selected image. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt={`Xem trước ${file.name}`}
                      className="max-h-[500px] max-w-full rounded-[6px] bg-white shadow-lg"
                    />
                  </div>
                ) : (
                  <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)]/60 p-6 text-center">
                    <Files className="size-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-semibold">DOCX không có preview trực quan trong trình duyệt</p>
                      <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                        MathGlass đọc trực tiếp OOXML/OMML để giữ công thức. Bản xem trước theo block
                        sẽ xuất hiện sau khi chuyển đổi, kèm cảnh báo cho cấu trúc chưa hỗ trợ.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {file ? (
            <Card>
              <CardHeader>
                <CardTitle>Cấu hình chuyển đổi</CardTitle>
                <CardDescription>
                  Bạn có thể thay đổi cấu hình trước khi bấm bắt đầu. PDF cần số trang thật từ máy
                  chủ; DOCX chỉ biết sau khi phân tích.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="project-name">Tên dự án</Label>
                  <Input
                    id="project-name"
                    value={name}
                    maxLength={160}
                    disabled={uploading || processing || Boolean(project)}
                    onChange={(event) => setName(event.target.value)}
                  />
                  {project ? (
                    <p className="text-[11px] text-muted-foreground">
                      Tên đã lưu trong dự án. Có thể đổi trong Thư viện sau khi hoàn tất.
                    </p>
                  ) : null}
                </div>

                <ConversionSettingsForm
                  value={settings}
                  onChange={setSettings}
                  pageCount={project?.pageCount ?? null}
                  disabled={processing || starting}
                />

                <Separator />

                <div className="space-y-3">
                  {!project ? (
                    <>
                      <Button
                        type="button"
                        size="lg"
                        className="w-full"
                        loading={uploading}
                        loadingLabel={`Đang tải lên ${uploadProgress}%`}
                        onClick={upload}
                      >
                        <UploadCloud className="size-4" />
                        Tải tệp lên
                      </Button>
                      {uploading ? (
                        <div className="space-y-1.5">
                          <Progress value={uploadProgress} aria-label="Tiến độ tải tệp" />
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>Đang tải tệp lên máy chủ…</span>
                            <button
                              type="button"
                              className="font-semibold text-primary hover:underline"
                              onClick={() => xhrRef.current?.abort()}
                            >
                              Hủy tải lên
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          Tải lên chưa bắt đầu phân tích. Sau khi hoàn tất, bạn sẽ xác nhận lần nữa
                          để chạy chuyển đổi.
                        </p>
                      )}
                    </>
                  ) : processing ? (
                    <div className="space-y-3 rounded-[14px] border border-[color:var(--mg-info)]/25 bg-[color:var(--mg-info-soft)] p-4">
                      <div className="flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin text-[color:var(--mg-info)]" />
                        <p className="text-sm font-semibold">
                          {job?.stage || "Đang xử lý tài liệu"}
                        </p>
                      </div>
                      <Progress value={job?.progressPercent ?? 0} aria-label="Tiến độ chuyển đổi" />
                      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                        <span>{job?.progressPercent ?? 0}% · {job?.stageDetail || "Tác vụ chạy trên máy chủ"}</span>
                        {job?.cancelRequested ? (
                          <span>Đang hủy…</span>
                        ) : (
                          <button
                            type="button"
                            onClick={cancelJob}
                            className="font-semibold text-[color:var(--mg-danger)] hover:underline"
                          >
                            Hủy tác vụ
                          </button>
                        )}
                      </div>
                      {pollNote ? <p className="text-[11px] text-muted-foreground">{pollNote}</p> : null}
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Không đóng trình duyệt nếu cần theo dõi ngay. Tác vụ được lưu trên máy chủ;
                        bạn có thể mở lại dự án từ Thư viện.
                      </p>
                    </div>
                  ) : finished ? (
                    <div
                      className={`space-y-3 rounded-[14px] border p-4 ${
                        needsReview
                          ? "border-[color:var(--mg-warning)]/30 bg-[color:var(--mg-warning-soft)]"
                          : "border-[color:var(--mg-success)]/30 bg-[color:var(--mg-success-soft)]"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {needsReview ? (
                          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-[color:var(--mg-warning)]" />
                        ) : (
                          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[color:var(--mg-success)]" />
                        )}
                        <div>
                          <p className="text-sm font-semibold">
                            {needsReview ? "Đã chuyển đổi — cần giáo viên kiểm tra" : "Đã chuyển đổi thành công"}
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            {project.blockCount} block · {project.mathBlockCount} block có công thức
                            {project.needsReviewCount > 0
                              ? ` · ${project.needsReviewCount} mục cần xác nhận`
                              : " · không có mục tồn đọng"}
                            . Không có nội dung nào được tự sửa.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm">
                          <Link href={`/accuracy/${project.id}`}>
                            <ScanSearch className="size-3.5" />
                            {needsReview ? "Mở Accuracy Lab" : "Đối chiếu nguồn"}
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="secondary">
                          <Link href={`/studio/${project.id}`}>
                            <Code2 className="size-3.5" /> Mở LaTeX Studio
                          </Link>
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={reset}>
                          Chuyển tệp khác <ArrowRight className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : failed ? (
                    <div className="space-y-3 rounded-[14px] border border-[color:var(--mg-danger)]/30 bg-[color:var(--mg-danger-soft)] p-4">
                      <div className="flex items-start gap-2.5">
                        <XCircle className="mt-0.5 size-5 shrink-0 text-[color:var(--mg-danger)]" />
                        <div>
                          <p className="text-sm font-semibold">Chuyển đổi thất bại</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {job?.errorMessage || project.description || "Tác vụ không hoàn tất."}
                          </p>
                          {job?.errorCode ? (
                            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                              Mã lỗi: {job.errorCode}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={starting}
                          onClick={startConversion}
                        >
                          Thử lại chuyển đổi
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={reset}>
                          Chọn tệp khác
                        </Button>
                      </div>
                    </div>
                  ) : job?.status === "cancelled" ? (
                    <Alert tone="warning" title="Tác vụ đã bị hủy">
                      Dữ liệu đã ghi nhận trước khi hủy vẫn được giữ. Bạn có thể chạy lại chuyển đổi.
                      <div className="mt-3">
                        <Button size="sm" variant="secondary" onClick={startConversion} loading={starting}>
                          Chạy lại
                        </Button>
                      </div>
                    </Alert>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="lg"
                        className="w-full"
                        loading={starting}
                        loadingLabel="Đang bắt đầu"
                        onClick={startConversion}
                      >
                        <Sparkles className="size-4" />
                        Bắt đầu chuyển đổi
                      </Button>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        MathGlass sẽ phân tích tệp nguồn và tạo LaTeX từ nội dung thật. Trang scan
                        hoặc ảnh chưa OCR sẽ được đánh dấu cần kiểm tra — không có dữ liệu giả.
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Quy trình minh bạch</CardTitle>
                <CardDescription>Ba bước, không có trạng thái “thành công” giả.</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3 text-xs leading-relaxed text-muted-foreground">
                  <li className="flex gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[color:var(--mg-highlight)] text-[11px] font-semibold text-primary">1</span>
                    <span><strong className="text-foreground">Tải tệp thật.</strong> Máy chủ kiểm tra MIME, chữ ký tệp và giới hạn dung lượng; tệp riêng tư không phải URL công khai.</span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[color:var(--mg-highlight)] text-[11px] font-semibold text-primary">2</span>
                    <span><strong className="text-foreground">Xác nhận cấu hình.</strong> Chế độ, template và phạm vi trang được áp dụng trước khi phân tích.</span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[color:var(--mg-highlight)] text-[11px] font-semibold text-primary">3</span>
                    <span><strong className="text-foreground">Đối chiếu và sửa.</strong> Accuracy Lab so sánh nguồn với từng block; LaTeX Studio chỉ chỉnh sửa khi bạn quyết định.</span>
                  </li>
                </ol>
                <Separator className="my-4" />
                <div className="flex items-start gap-2 rounded-[12px] border border-[color:var(--mg-border-subtle)] bg-[color:var(--mg-bg-soft)] p-3 text-[11px] leading-relaxed text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[color:var(--mg-warning)]" />
                  Biên dịch PDF yêu cầu dịch vụ TeX sandbox độc lập và hiện{" "}
                  {health.data?.compiler.configured ? "đã được cấu hình" : "chưa được cấu hình"}. Bạn
                  luôn có thể xuất `.tex` và `.zip`.
                </div>
              </CardContent>
            </Card>
          )}

          {project ? (
            <Card>
              <CardHeader>
                <CardTitle>Thông tin tác vụ</CardTitle>
                <CardDescription>Trạng thái lấy trực tiếp từ job trên máy chủ.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Dự án</dt>
                    <dd className="mt-0.5 font-mono text-[10px] break-all">{project.id.slice(0, 8)}…</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Trạng thái</dt>
                    <dd className="mt-1"><StatusBadge status={project.status} /></dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Trang</dt>
                    <dd className="mt-0.5 font-semibold">{project.pageCount ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Block</dt>
                    <dd className="mt-0.5 font-semibold">{project.blockCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Cần kiểm tra</dt>
                    <dd className="mt-0.5 font-semibold text-[color:var(--mg-warning)]">
                      {project.needsReviewCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Job</dt>
                    <dd className="mt-1"><StatusBadge status={job?.status ?? "queued"} /></dd>
                  </div>
                </dl>
                <Separator className="my-3" />
                <div className="flex flex-col gap-1.5">
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/library?project=${project.id}`}>
                      Mở trong Thư viện <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                  {project.blockCount > 0 ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/studio/${project.id}`}>
                        <Code2 className="size-3.5" /> Mở LaTeX Studio
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

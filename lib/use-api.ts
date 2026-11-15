"use client";

import * as React from "react";
import { apiFetch } from "@/lib/api-client";

export function useApi<T>(url: string, options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(enabled);
  const [revision, setRevision] = React.useState(0);

  const refresh = React.useCallback(() => setRevision((value) => value + 1), []);

  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let alive = true;
    const frame = requestAnimationFrame(() => {
      if (!alive) return;
      setLoading(true);
      setError(null);
    });
    apiFetch<T>(url, { signal: controller.signal })
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((cause: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Không tải được dữ liệu.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      controller.abort();
    };
  }, [url, enabled, revision]);

  return { data, error, loading: enabled ? loading : false, refresh, setData };
}

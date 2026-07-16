"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

export function AnalysisPanel({
  endpoint,
  payload,
  buttonLabel,
  title,
}: {
  endpoint: string;
  payload: Record<string, unknown>;
  buttonLabel: string;
  title: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat analisis.");
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
        <button
          onClick={generate}
          disabled={loading}
          className="rounded-md bg-series-1 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Menganalisis..." : result ? "Analisis Ulang" : buttonLabel}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</div>
      )}

      {!error && !result && !loading && (
        <p className="text-sm text-ink-muted">Klik tombol di atas untuk membuat analisis dengan AI berdasarkan data ini.</p>
      )}

      {loading && <p className="text-sm text-ink-muted">Memanggil model AI, mohon tunggu...</p>}

      {result && (
        <div className="prose prose-sm max-w-none text-ink-secondary prose-headings:text-ink-primary prose-strong:text-ink-primary">
          <ReactMarkdown>{result}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

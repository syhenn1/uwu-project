"use client";

import { useState } from "react";

interface CheckResult {
  todayHari: number;
  totalSignatures: number;
  newCount: number;
  firstRun: boolean;
  notified: boolean;
  channels: string[];
  notifyError?: string;
  newItems: string[];
}

export function NotifyPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notify-check");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengecek.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink-primary">Notifikasi Otomatis</h3>
        <button
          onClick={check}
          disabled={loading}
          className="rounded-md bg-series-1 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Mengecek..." : "Cek Sekarang"}
        </button>
      </div>

      {error && <div className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</div>}

      {result && (
        <div className="flex flex-col gap-2 text-sm">
          {result.firstRun ? (
            <p className="text-ink-secondary">
              Baseline pertama disimpan: {result.totalSignatures} temuan tercatat per Hari {result.todayHari}. Belum
              ada yang dikirim - pengecekan berikutnya baru akan memberitahukan yang benar-benar baru.
            </p>
          ) : result.newCount === 0 ? (
            <p className="text-status-good">Tidak ada temuan baru sejak pengecekan terakhir.</p>
          ) : (
            <>
              <p className="text-ink-secondary">
                {result.newCount} temuan baru terdeteksi.{" "}
                {result.notified ? (
                  <span className="text-status-good">Terkirim lewat: {result.channels.join(", ")}.</span>
                ) : (
                  <span className="text-status-warning">Belum terkirim - {result.notifyError}</span>
                )}
              </p>
              <ul className="list-disc pl-5 text-xs text-ink-muted">
                {result.newItems.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {!result && !error && (
        <p className="text-sm text-ink-muted">
          Memindai anomali &amp; checkpoint yang belum sesuai, lalu mengirim ke channel yang dikonfigurasi (lihat
          .env.local.example: <code className="font-mono">NOTIFY_WEBHOOK_URL</code> atau{" "}
          <code className="font-mono">RESEND_API_KEY</code>) hanya untuk temuan yang baru sejak pengecekan
          sebelumnya.
        </p>
      )}
    </div>
  );
}

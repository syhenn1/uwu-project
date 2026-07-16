"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type ItemStatus = "pending" | "loading" | "done" | "error";

interface ResultEntry {
  hari: number;
  status: ItemStatus;
  result?: string;
  error?: string;
}

function keyOf(hari: number) {
  return String(hari);
}

/** localStorage supaya hasil generate tidak hilang kalau tab di-refresh/ditutup
 * nggak sengaja - sama seperti pola di BulkAnalysisRunner. */
const STORAGE_KEY = "rekap-harian-entries-v1";

function loadStoredEntries(): Record<string, ResultEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ResultEntry>;
    for (const key of Object.keys(parsed)) {
      if (parsed[key].status === "loading") {
        parsed[key] = { ...parsed[key], status: "error", error: "Terputus (tab ditutup/refresh) - generate ulang." };
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  async function next(): Promise<void> {
    const i = cursor++;
    if (i >= items.length) return;
    await worker(items[i]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
}

/**
 * Versi bulk dari panel "Ringkasan AI" di Dashboard (lib/prompts.ts -
 * buildDailySummaryMessages via /api/analyze/summary): generate ringkasan
 * kondisi SELURUH fasilitator (bukan per orang) untuk setiap hari dalam
 * siklus sekaligus, mencakup analisis kuantitatif (Nilai Risiko & checkpoint)
 * maupun kualitatif (catatan Kendala/lapangan) untuk hari itu.
 */
export function DailySummaryBulkRunner({
  days,
  todayHari,
  totalFasilitator,
}: {
  days: number[];
  todayHari: number;
  totalFasilitator: number;
}) {
  const [entries, setEntries] = useState<Record<string, ResultEntry>>(loadStoredEntries);
  const [concurrency, setConcurrency] = useState(2);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // localStorage penuh/nggak tersedia (mis. private browsing) - abaikan,
      // generate tetap jalan normal, cuma nggak ke-persist.
    }
  }, [entries]);

  function clearStored() {
    setEntries({});
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // abaikan
    }
  }

  const list = days.map((d) => entries[keyOf(d)]).filter((e): e is ResultEntry => !!e);
  const doneCount = list.filter((e) => e.status === "done").length;
  const errorCount = list.filter((e) => e.status === "error").length;
  const totalStarted = list.length;
  const total = days.length;
  const pct = total ? Math.round(((doneCount + errorCount) / total) * 100) : 0;

  async function generateOne(hari: number) {
    const key = keyOf(hari);
    setEntries((prev) => ({ ...prev, [key]: { hari, status: "loading" } }));
    try {
      const res = await fetch("/api/analyze/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hari }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat ringkasan.");
      setEntries((prev) => ({ ...prev, [key]: { hari, status: "done", result: data.result } }));
    } catch (err) {
      setEntries((prev) => ({
        ...prev,
        [key]: { hari, status: "error", error: err instanceof Error ? err.message : "Gagal." },
      }));
    }
  }

  async function startAll(onlyFailed = false) {
    setRunning(true);
    cancelRef.current = false;
    const queue = onlyFailed ? list.filter((e) => e.status === "error").map((e) => e.hari) : days;
    await runWithConcurrency(queue, concurrency, async (hari) => {
      if (cancelRef.current) return;
      await generateOne(hari);
    });
    setRunning(false);
  }

  function stop() {
    cancelRef.current = true;
    setRunning(false);
  }

  function combinedText() {
    return days
      .map((d) => {
        const e = entries[keyOf(d)];
        const body = e?.status === "done" ? e.result : e?.status === "error" ? `_Gagal: ${e.error}_` : "_Belum digenerate._";
        return `# Hari ${d}${d > todayHari ? " (belum terjadi)" : ""}\n\n${body}`;
      })
      .join("\n\n---\n\n");
  }

  function exportJson() {
    download(
      "rekap-harian.json",
      JSON.stringify(days.map((d) => entries[keyOf(d)] ?? { hari: d, status: "pending" }), null, 2),
      "application/json"
    );
  }

  function exportMarkdown() {
    download("rekap-harian.md", combinedText(), "text/markdown");
  }

  async function copyAll() {
    await navigator.clipboard.writeText(combinedText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-sm text-ink-secondary">
          Ini akan memanggil model AI sebanyak <strong>{total}x</strong> (1 ringkasan per hari, merangkum kondisi
          seluruh {totalFasilitator} fasilitator hari itu - analisis kuantitatif berdasar Nilai Risiko & checkpoint,
          maupun kualitatif berdasar catatan Kendala/lapangan). Bisa memakan waktu cukup lama dan menggunakan kuota
          provider AI Anda (otomatis fallback ke provider berikutnya kalau salah satu habis/gagal). Hari setelah Hari{" "}
          {todayHari} (hari ini) belum benar-benar terjadi - datanya baru placeholder, jadi hasilnya belum tentu
          bermakna.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            Paralel:
            <select
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              disabled={running}
              className="rounded border border-border bg-background px-2 py-1"
            >
              {[1, 2, 4, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => startAll(false)}
            disabled={running}
            className="rounded-md bg-series-1 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {running ? "Sedang generate..." : totalStarted > 0 ? "Generate Ulang Semua" : `Generate Semua (${total})`}
          </button>
          {running && (
            <button onClick={stop} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary">
              Hentikan
            </button>
          )}
          {!running && errorCount > 0 && (
            <button
              onClick={() => startAll(true)}
              className="rounded-md border border-status-critical/40 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
            >
              Coba Ulang yang Gagal ({errorCount})
            </button>
          )}
          {doneCount > 0 && (
            <>
              <button onClick={copyAll} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary">
                {copied ? "Tersalin!" : "Salin Semua sebagai Teks"}
              </button>
              <button onClick={exportJson} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary">
                Unduh JSON
              </button>
              <button onClick={exportMarkdown} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary">
                Unduh Markdown
              </button>
              <button
                onClick={() => {
                  if (window.confirm("Hapus semua hasil yang tersimpan di browser ini? Tidak bisa dibatalkan.")) clearStored();
                }}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-status-critical"
              >
                Hapus Hasil Tersimpan
              </button>
            </>
          )}
        </div>
        {totalStarted > 0 && (
          <p className="mt-2 text-xs text-ink-muted">
            Hasil otomatis tersimpan di browser ini (localStorage) - tetap ada walau di-refresh atau tab ditutup dan
            dibuka lagi, sampai kamu hapus manual atau clear data browser.
          </p>
        )}

        {totalStarted > 0 && (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-background">
              <div className="h-full bg-series-1 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {doneCount} selesai, {errorCount} gagal, dari {total} ({pct}%)
            </p>
          </div>
        )}
      </div>

      {totalStarted > 0 && (
        <div className="flex flex-col gap-3">
          {days.map((d) => {
            const e = entries[keyOf(d)];
            if (!e) return null;
            const isOpen = expanded === d;
            const future = d > todayHari;
            return (
              <div key={d} className="overflow-hidden rounded-lg border border-border bg-surface">
                <button
                  onClick={() => setExpanded(isOpen ? null : d)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-background"
                >
                  <span className="text-sm font-medium text-ink-primary">
                    Hari {d}
                    {future && <span className="ml-2 text-xs font-normal text-ink-muted">(belum terjadi)</span>}
                  </span>
                  <span className="text-xs">
                    {e.status === "loading" && <span className="text-ink-muted">Memproses...</span>}
                    {e.status === "pending" && <span className="text-ink-muted">Menunggu</span>}
                    {e.status === "done" && <span className="text-status-good">Selesai</span>}
                    {e.status === "error" && <span className="text-status-critical">Gagal</span>}
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-border px-4 py-3">
                    {e.status === "done" && (
                      <div className="prose prose-sm max-w-none text-ink-secondary prose-headings:text-ink-primary prose-strong:text-ink-primary">
                        <ReactMarkdown>{e.result}</ReactMarkdown>
                      </div>
                    )}
                    {e.status === "error" && <p className="text-sm text-status-critical">{e.error}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

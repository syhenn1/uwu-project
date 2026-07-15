"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface FacilitatorRef {
  kodeFasil: string;
  namaFasil: string;
}

type ItemStatus = "pending" | "loading" | "done" | "error";

interface ResultEntry {
  kodeFasil: string;
  namaFasil: string;
  hari: number;
  status: ItemStatus;
  result?: string;
  error?: string;
}

function keyOf(kodeFasil: string, hari: number) {
  return `${kodeFasil}__${hari}`;
}

/** localStorage supaya hasil generate tidak hilang kalau tab di-refresh/ditutup
 * nggak sengaja - generate ulang 420x itu mahal (waktu & kuota provider AI). */
const STORAGE_KEY = "analisis-massal-entries-v1";

function loadStoredEntries(): Record<string, ResultEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ResultEntry>;
    // Entri yang masih "loading" saat tab ditutup/refresh sebenarnya sudah
    // terputus - tandai gagal supaya tidak nyangkut selamanya di "Memproses...".
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

type HariFilter = "all" | number;

export function BulkAnalysisRunner({ facilitators, days }: { facilitators: FacilitatorRef[]; days: number[] }) {
  const latestDay = days[days.length - 1];
  const [hariFilter, setHariFilter] = useState<HariFilter>(latestDay ?? "all");

  const combos = useMemo(
    () =>
      hariFilter === "all"
        ? facilitators.flatMap((f) => days.map((hari) => ({ ...f, hari })))
        : facilitators.map((f) => ({ ...f, hari: hariFilter })),
    [facilitators, days, hariFilter]
  );

  const [entries, setEntries] = useState<Record<string, ResultEntry>>(loadStoredEntries);
  const [concurrency, setConcurrency] = useState(4);
  const [excludeAplikasi, setExcludeAplikasi] = useState(false);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveInfo, setSaveInfo] = useState<{ updated: number; notFound: string[] } | null>(null);
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

  const list = combos.map((c) => entries[keyOf(c.kodeFasil, c.hari)]).filter((e): e is ResultEntry => !!e);
  const doneCount = list.filter((e) => e.status === "done").length;
  const errorCount = list.filter((e) => e.status === "error").length;
  const totalStarted = list.length;
  const total = combos.length;
  const pct = total ? Math.round(((doneCount + errorCount) / total) * 100) : 0;

  async function generateOne(item: FacilitatorRef & { hari: number }) {
    const key = keyOf(item.kodeFasil, item.hari);
    setEntries((prev) => ({
      ...prev,
      [key]: { kodeFasil: item.kodeFasil, namaFasil: item.namaFasil, hari: item.hari, status: "loading" },
    }));
    try {
      const res = await fetch("/api/analyze/facilitator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kodeFasil: item.kodeFasil, hari: item.hari, excludeAplikasi }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat analisis.");
      setEntries((prev) => ({
        ...prev,
        [key]: { kodeFasil: item.kodeFasil, namaFasil: item.namaFasil, hari: item.hari, status: "done", result: data.result },
      }));
    } catch (err) {
      setEntries((prev) => ({
        ...prev,
        [key]: {
          kodeFasil: item.kodeFasil,
          namaFasil: item.namaFasil,
          hari: item.hari,
          status: "error",
          error: err instanceof Error ? err.message : "Gagal.",
        },
      }));
    }
  }

  async function startAll(onlyFailed = false) {
    setRunning(true);
    cancelRef.current = false;
    const queue = onlyFailed ? list.filter((e) => e.status === "error").map((e) => ({ kodeFasil: e.kodeFasil, namaFasil: e.namaFasil, hari: e.hari })) : combos;
    await runWithConcurrency(queue, concurrency, async (item) => {
      if (cancelRef.current) return;
      await generateOne(item);
    });
    setRunning(false);
  }

  function stop() {
    cancelRef.current = true;
    setRunning(false);
  }

  function exportJson() {
    download(
      "analisis-massal.json",
      JSON.stringify(
        combos.map((c) => entries[keyOf(c.kodeFasil, c.hari)] ?? { ...c, status: "pending" }),
        null,
        2
      ),
      "application/json"
    );
  }

  function exportMarkdown() {
    const parts = combos.map((c) => {
      const e = entries[keyOf(c.kodeFasil, c.hari)];
      const body = e?.status === "done" ? e.result : e?.status === "error" ? `_Gagal: ${e.error}_` : "_Belum digenerate._";
      return `# ${c.namaFasil} (${c.kodeFasil}) - Hari ${c.hari}\n\n${body}\n`;
    });
    download("analisis-massal.md", parts.join("\n---\n\n"), "text/markdown");
  }

  async function pushToSheet() {
    setSaveState("saving");
    setSaveError(null);
    setSaveInfo(null);
    try {
      const items = list
        .filter((e) => e.status === "done")
        .map((e) => ({ kodeFasil: e.kodeFasil, namaFasil: e.namaFasil, hari: e.hari, hasil: e.result }));
      const res = await fetch("/api/analyze/save-to-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan ke spreadsheet.");

      const updated = typeof data.updated === "number" ? data.updated : 0;
      const notFound = Array.isArray(data.notFound) ? data.notFound : [];
      setSaveInfo({ updated, notFound });

      // Webhook boleh jadi bilang "ok" tapi 0 baris ketemu (mis. karena salah
      // link spreadsheet/webhook) - itu bukan sukses beneran, jangan disamarkan
      // jadi pesan hijau biasa.
      if (updated === 0 && notFound.length > 0) {
        setSaveState("error");
        setSaveError(
          `0 dari ${items.length} tersimpan - semua kombinasi Kode Fasil + Hari tidak ditemukan di spreadsheet tujuan webhook. Kemungkinan WRITE_SHEETS_WEBHOOK_URL mengarah ke spreadsheet yang berbeda dari SHEET_CSV_URL - cek lagi link-nya.`
        );
      } else {
        setSaveState("done");
      }
    } catch (err) {
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : "Gagal menyimpan ke spreadsheet.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-sm text-ink-secondary">
          Ini akan memanggil model AI sebanyak <strong>{total}x</strong> ({facilitators.length} fasilitator ×{" "}
          {days.length} hari). Bisa memakan waktu cukup lama dan menggunakan kuota provider AI Anda (otomatis fallback ke
          provider berikutnya kalau salah satu habis/gagal). Setiap
          kombinasi fasilitator+hari punya data berbeda (checkpoint yang berlaku & catatan kualitatif per hari),
          jadi hasilnya seharusnya berbeda satu sama lain - meskipun untuk fasilitator yang sama, beberapa hari
          bisa terdengar mirip kalau metrik angkanya memang belum berubah di sheet.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            Sampai Hari ke-:
            <select
              value={hariFilter}
              onChange={(e) => setHariFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              disabled={running}
              className="rounded border border-border bg-background px-2 py-1"
            >
              <option value="all">Semua Hari ({facilitators.length * days.length}x panggilan)</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  Hari {d} ({facilitators.length}x panggilan)
                </option>
              ))}
            </select>
          </label>
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
          <label
            className="flex items-center gap-1.5 text-xs text-ink-secondary"
            title='Buang seluruh checkpoint/persentase ber-sumber "Aplikasi Revit" (Login Aplikasi, Biodata, Dokumen Admin/Teknis, RAB) dari data yang dikirim ke AI - analisis jadi fokus ke checkpoint LK Fasil & catatan Kendala saja.'
          >
            <input
              type="checkbox"
              checked={excludeAplikasi}
              onChange={(e) => setExcludeAplikasi(e.target.checked)}
              disabled={running}
              className="rounded border-border"
            />
            Kecualikan data Aplikasi
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
              <button onClick={exportJson} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary">
                Unduh JSON
              </button>
              <button onClick={exportMarkdown} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary">
                Unduh Markdown
              </button>
              <button
                onClick={pushToSheet}
                disabled={saveState === "saving"}
                className="rounded-md bg-series-2 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saveState === "saving" ? "Menyimpan..." : "Tambahkan ke Spreadsheet"}
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

        {saveState === "done" && saveInfo && saveInfo.notFound.length === 0 && (
          <p className="mt-2 text-xs text-status-good">Berhasil disimpan {saveInfo.updated} analisis ke spreadsheet.</p>
        )}
        {saveState === "done" && saveInfo && saveInfo.notFound.length > 0 && (
          <p className="mt-2 text-xs text-status-warning">
            {saveInfo.updated} tersimpan, {saveInfo.notFound.length} tidak ditemukan di spreadsheet tujuan:{" "}
            {saveInfo.notFound.slice(0, 5).join(", ")}
            {saveInfo.notFound.length > 5 ? ` (+${saveInfo.notFound.length - 5} lagi)` : ""}.
          </p>
        )}
        {saveState === "error" && (
          <p className="mt-2 text-xs text-status-critical">{saveError}</p>
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
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-ink-secondary">
                <th className="px-3 py-2">Fasilitator</th>
                <th className="px-3 py-2">Hari</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ringkasan</th>
              </tr>
            </thead>
            <tbody>
              {combos.map((c) => {
                const key = keyOf(c.kodeFasil, c.hari);
                const e = entries[key];
                if (!e) return null;
                const isOpen = expanded === key;
                return (
                  <tr key={key} className="cursor-pointer border-b border-gridline last:border-0 hover:bg-background" onClick={() => setExpanded(isOpen ? null : key)}>
                    <td className="px-3 py-2">
                      {c.namaFasil}
                      <div className="text-xs text-ink-muted">{c.kodeFasil}</div>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-ink-secondary">Hari {c.hari}</td>
                    <td className="px-3 py-2">
                      {e.status === "loading" && <span className="text-ink-muted">Memproses...</span>}
                      {e.status === "pending" && <span className="text-ink-muted">Menunggu</span>}
                      {e.status === "done" && <span className="text-status-good">Selesai</span>}
                      {e.status === "error" && <span className="text-status-critical">Gagal</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {e.status === "done" && (
                        <div className={isOpen ? "" : "line-clamp-1"}>{e.result}</div>
                      )}
                      {e.status === "error" && <span className="text-status-critical">{e.error}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { LK_SUMMARY_COLUMNS } from "@/lib/facilitatorLk";

/** Kolom yang di-freeze (sticky) di kiri tabel supaya tetap kelihatan saat
 * scroll horizontal ke 43 kolom lainnya - ini konteks utama tiap baris. */
const FROZEN_COL = "Nama Sekolah";

export function LkFasilPanel({
  kodeFasil,
  hari,
  editUrl,
}: {
  kodeFasil: string;
  /** Kosongkan untuk tampilkan semua baris (semua hari), bukan hari tertentu saja. */
  hari?: number;
  editUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);

  async function load() {
    if (rows || loading) return;
    setLoading(true);
    setError(null);
    try {
      const hariQuery = typeof hari === "number" ? `&hari=${hari}` : "";
      const res = await fetch(`/api/lk-fasil?kodeFasil=${encodeURIComponent(kodeFasil)}${hariQuery}`);
      const data = await res.json();
      if (!data.available) throw new Error(data.error || "Data LK tidak tersedia.");
      setRows(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data LK.");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-primary hover:text-series-1"
        >
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          LK Fasilitator ({typeof hari === "number" ? `Hari ${hari}` : "Semua Hari"})
        </button>
        {editUrl && (
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-ink-secondary hover:border-series-1 hover:text-series-1"
          >
            Buka Spreadsheet ↗
          </a>
        )}
      </div>

      {open && (
        <div className="mt-3">
          {loading && <p className="text-xs text-ink-muted">Memuat data LK...</p>}
          {error && (
            <div className="rounded-md bg-status-warning/10 px-3 py-2 text-xs text-[#8a5a00]">
              {error}
              {!editUrl && " Fasilitator ini juga belum punya link sheet LK yang terpetakan."}
            </div>
          )}
          {rows && rows.length === 0 && !error && (
            <p className="text-xs text-ink-muted">
              Tidak ada baris sekolah {typeof hari === "number" ? `untuk Hari ${hari} ` : ""}di sheet LK ini.
            </p>
          )}
          {rows && rows.length > 0 && (
            <>
              <p className="mb-1.5 text-[10px] text-ink-muted">
                {rows.length} baris · {new Set(rows.map((r) => r["Nama Sekolah"])).size} sekolah
                {typeof hari !== "number" && " × hari yang tercatat"}.
              </p>
              <div className="max-h-[28rem] overflow-auto rounded-md border border-gridline">
                <table className="w-full min-w-[3600px] border-collapse text-xs">
                  <thead>
                    <tr>
                      {LK_SUMMARY_COLUMNS.map((col) => {
                        const frozen = col === FROZEN_COL;
                        return (
                          <th
                            key={col}
                            className={`sticky top-0 whitespace-nowrap border-b border-border bg-background px-2 py-1.5 text-left font-medium text-ink-secondary ${
                              frozen ? "left-0 z-20 shadow-[2px_0_0_0_var(--color-gridline)]" : "z-10"
                            }`}
                          >
                            {col}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-gridline last:border-0 hover:bg-background">
                        {LK_SUMMARY_COLUMNS.map((col) => {
                          const frozen = col === FROZEN_COL;
                          return (
                            <td
                              key={col}
                              className={`max-w-[200px] truncate px-2 py-1.5 text-ink-primary ${
                                frozen ? "sticky left-0 z-10 bg-surface shadow-[2px_0_0_0_var(--color-gridline)]" : ""
                              }`}
                              title={r[col]}
                            >
                              {r[col] || <span className="text-ink-muted">-</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="mt-2 text-[10px] text-ink-muted">
            Menampilkan kolom A-AQ ({LK_SUMMARY_COLUMNS.length} dari total 112 kolom LK Fasil mentah) - seluruh
            bagian wawancara kepatuhan. Kolom AR ke atas (kondisi fisik bangunan, kebutuhan rehab) beda domain,
            buka spreadsheet-nya langsung untuk lihat itu.
          </p>
        </div>
      )}
    </div>
  );
}

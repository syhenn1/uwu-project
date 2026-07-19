"use client";

import { useMemo, useState } from "react";
import { SKOR_AKHIR_COLUMNS, percentCellColorClass, skorAkhirColorClass } from "@/lib/skorAkhirColumns";
import type { FacilRow } from "@uwu/core/types";
import { deriveKampus } from "@uwu/core/metrics";
import Link from "next/link";

type SortKey = "nama" | "koordinator" | "skorAkhir";

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "skorAkhir", label: "Skor Akhir" },
  { key: "nama", label: "Nama Fasilitator (A-Z)" },
  { key: "koordinator", label: "Koordinator (A-Z)" },
];

function formatPercentDisplay(raw: string): string {
  const match = raw.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (!match) return raw;
  const num = parseFloat(match[1]);
  return Number.isInteger(num) ? `${num}%` : `${num.toFixed(2)}%`;
}

export function AllFasilRawMatriksTable({ rows }: { rows: FacilRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("skorAkhir");
  const [asc, setAsc] = useState(false);
  const [kampus, setKampus] = useState<string>("semua");
  const [koordinator, setKoordinator] = useState<string>("semua");

  const kampusOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => deriveKampus(r.kodeFasil)))).sort(),
    [rows]
  );
  const koordinatorOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.namaKoor))).sort(),
    [rows]
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) => (kampus === "semua" || deriveKampus(r.kodeFasil) === kampus) && (koordinator === "semua" || r.namaKoor === koordinator)
      ),
    [rows, kampus, koordinator]
  );

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let diff = 0;
      if (sortKey === "nama") diff = a.namaFasil.localeCompare(b.namaFasil);
      if (sortKey === "koordinator") diff = a.namaKoor.localeCompare(b.namaKoor);
      if (sortKey === "skorAkhir") diff = (typeof a.skorAkhir === "number" ? a.skorAkhir : -1) - (typeof b.skorAkhir === "number" ? b.skorAkhir : -1);
      return asc ? diff : -diff;
    });
    return copy;
  }, [filtered, sortKey, asc]);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="mb-3 text-sm font-semibold text-ink-primary">
        Tabel Persentase Mentah (Semua Fasilitator)
      </h2>
      
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 text-ink-secondary">
          Kampus:
          <select
            value={kampus}
            onChange={(e) => setKampus(e.target.value)}
            className="rounded border border-border bg-surface px-2 py-1 text-ink-primary"
          >
            <option value="semua">Semua</option>
            {kampusOptions.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-ink-secondary">
          Koordinator:
          <select
            value={koordinator}
            onChange={(e) => setKoordinator(e.target.value)}
            className="max-w-[220px] rounded border border-border bg-surface px-2 py-1 text-ink-primary"
          >
            <option value="semua">Semua</option>
            {koordinatorOptions.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-ink-secondary">
          Urutkan:
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded border border-border bg-surface px-2 py-1 text-ink-primary"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => setAsc(!asc)}
            title={asc ? "Menaik (klik untuk menurun)" : "Menurun (klik untuk menaik)"}
            className="rounded border border-border bg-surface px-2 py-1 text-ink-primary hover:bg-background"
          >
            {asc ? "▲" : "▼"}
          </button>
        </label>
        {(kampus !== "semua" || koordinator !== "semua") && (
          <button
            onClick={() => {
              setKampus("semua");
              setKoordinator("semua");
            }}
            className="text-xs text-series-1 hover:underline"
          >
            Reset filter
          </button>
        )}
        <span className="text-xs text-ink-muted">
          Menampilkan {sorted.length} dari {rows.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-md max-h-[480px] overflow-y-auto relative">
        <table className="w-full text-left text-xs text-ink-secondary">
          <thead className="sticky top-0 z-20 border-b border-border bg-background/95 text-[10px] uppercase text-ink-muted backdrop-blur-sm">
            <tr>
              <th className="sticky left-0 z-30 min-w-[64px] whitespace-normal bg-background/95 px-2 py-1.5 font-medium shadow-[1px_1px_0_0_var(--tw-shadow-color)] shadow-border text-center">
                Skor Akhir
              </th>
              <th className="sticky left-[64px] z-30 min-w-[150px] whitespace-normal bg-background/95 px-2 py-1.5 font-medium shadow-[1px_1px_0_0_var(--tw-shadow-color)] shadow-border">
                Fasilitator
              </th>
              {SKOR_AKHIR_COLUMNS.map((col, idx) => (
                <th
                  key={idx}
                  className="min-w-[80px] max-w-[110px] whitespace-normal px-1.5 py-1.5 font-medium leading-snug text-center align-bottom shadow-[0_1px_0_0_var(--tw-shadow-color)] shadow-border"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((row, rowIdx) => {
              if (!row.raw || Object.keys(row.raw).length === 0) return null;
              const skorColor = skorAkhirColorClass(row.skorAkhir);

              return (
                <tr key={rowIdx} className="transition-colors hover:bg-background/40">
                  <td className={`sticky left-0 z-10 whitespace-nowrap px-2 py-1 text-center shadow-[1px_0_0_0_var(--tw-shadow-color)] shadow-border bg-surface/95 backdrop-blur-sm ${skorColor}`}>
                    {row.skorAkhir != null ? (Number.isInteger(row.skorAkhir) ? `${row.skorAkhir}%` : `${row.skorAkhir.toFixed(2)}%`) : "-"}
                  </td>
                  <td className="sticky left-[64px] z-10 whitespace-normal bg-surface/95 px-2 py-1 font-medium backdrop-blur-sm shadow-[1px_0_0_0_var(--tw-shadow-color)] shadow-border">
                    <div className="flex flex-col">
                      <Link
                        href={`/fasilitator/${row.kodeFasil}`}
                        className="text-series-1 hover:underline truncate max-w-[140px]"
                        title={row.namaFasil}
                      >
                        {row.namaFasil}
                      </Link>
                      <span className="text-[10px] text-ink-muted">{row.kodeFasil}</span>
                    </div>
                  </td>
                  {SKOR_AKHIR_COLUMNS.map((col, idx) => {
                    const rawValue = row.raw[col.header] ?? "-";
                    return (
                      <td key={idx} className={`whitespace-nowrap px-1.5 py-1 text-center ${percentCellColorClass(rawValue)}`}>
                        {formatPercentDisplay(rawValue)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FacilRow } from "@/lib/types";
import { deriveKampus } from "@/lib/metrics";
import { DOCUMENT_STAGE_METRICS, metricFor, type DocStage } from "@/lib/documentProgress";
import { SeverityValue } from "./SeverityBadge";

type SortKey = "nama" | keyof FacilRow;

const STAGES: DocStage[] = ["Terunggah", "Terverifikasi", "Sesuai"];

function numOrNeg(v: FacilRow[keyof FacilRow]): number {
  return typeof v === "number" ? v : -1;
}

export function DocumentProgressTable({ rows, hari }: { rows: FacilRow[]; hari: number }) {
  const router = useRouter();
  const adminSesuaiKolom = metricFor("Admin", "Sesuai").kolom;
  const [sortKey, setSortKey] = useState<SortKey>(adminSesuaiKolom);
  const [asc, setAsc] = useState(true);
  const [kampus, setKampus] = useState<string>("semua");
  const [koordinator, setKoordinator] = useState<string>("semua");

  const kampusOptions = useMemo(() => Array.from(new Set(rows.map((r) => deriveKampus(r.kodeFasil)))).sort(), [rows]);
  const koordinatorOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.namaKoor))).sort(), [rows]);

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
      const diff = sortKey === "nama" ? a.namaFasil.localeCompare(b.namaFasil) : numOrNeg(a[sortKey]) - numOrNeg(b[sortKey]);
      return asc ? diff : -diff;
    });
    return copy;
  }, [filtered, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(key === "nama");
    }
  }

  const headerBtn = (key: SortKey, label: string) => (
    <button onClick={() => toggleSort(key)} className="flex items-center gap-1 text-left text-xs font-medium text-ink-secondary hover:text-ink-primary">
      {label}
      {sortKey === key && <span className="text-ink-muted">{asc ? "▲" : "▼"}</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 text-ink-secondary">
          Kampus:
          <select value={kampus} onChange={(e) => setKampus(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-ink-primary">
            <option value="semua">Semua</option>
            {kampusOptions.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
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
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
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
          Menampilkan {sorted.length} dari {rows.length} fasilitator
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gridline">
              <th className="px-3 py-1.5" rowSpan={2}></th>
              <th className="border-l border-gridline px-3 py-1.5 text-center text-xs font-semibold text-ink-primary" colSpan={3}>
                Dokumen Admin
              </th>
              <th className="border-l border-gridline px-3 py-1.5 text-center text-xs font-semibold text-ink-primary" colSpan={3}>
                Dokumen Teknis
              </th>
            </tr>
            <tr className="border-b border-border">
              <th className="px-3 py-2">{headerBtn("nama", "Fasilitator")}</th>
              {(["Admin", "Teknis"] as const).flatMap((kategori) =>
                STAGES.map((stage, i) => {
                  const m = metricFor(kategori, stage);
                  return (
                    <th key={m.kolom} className={`px-3 py-2 ${i === 0 ? "border-l border-gridline" : ""}`}>
                      {headerBtn(m.kolom, stage)}
                    </th>
                  );
                })
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.kodeFasil}
                onClick={() => router.push(`/fasilitator/${r.kodeFasil}?hari=${hari}`)}
                className="cursor-pointer border-b border-gridline last:border-0 hover:bg-background"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/fasilitator/${r.kodeFasil}?hari=${hari}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-series-1 hover:underline"
                  >
                    {r.namaFasil}
                  </Link>
                  <div className="text-xs text-ink-muted">
                    {r.kodeFasil} · {r.namaKoor}
                  </div>
                </td>
                {DOCUMENT_STAGE_METRICS.map((m, i) => (
                  <td key={m.kolom} className={`px-3 py-2 ${i === 0 || i === 3 ? "border-l border-gridline" : ""}`}>
                    <SeverityValue value={typeof r[m.kolom] === "number" ? (r[m.kolom] as number) : null} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { FacilRow } from "@/lib/types";
import { riskLevel } from "@/lib/metrics";
import { RiskBadge } from "./RiskBadge";

type SortKey = "nama" | "risiko" | "belumLoginApp" | "belumDihubungi";

function numOrNeg(v: FacilRow[keyof FacilRow]): number {
  return typeof v === "number" ? v : -1;
}

export function FacilitatorTable({ rows, hari }: { rows: FacilRow[]; hari: number }) {
  const [sortKey, setSortKey] = useState<SortKey>("risiko");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let diff = 0;
      if (sortKey === "nama") diff = a.namaFasil.localeCompare(b.namaFasil);
      if (sortKey === "risiko") diff = numOrNeg(a.nilaiRisiko) - numOrNeg(b.nilaiRisiko);
      if (sortKey === "belumLoginApp") diff = numOrNeg(a.pctSekolahBelumLoginAplikasi) - numOrNeg(b.pctSekolahBelumLoginAplikasi);
      if (sortKey === "belumDihubungi") diff = numOrNeg(a.pctSekolahBelumDihubungi) - numOrNeg(b.pctSekolahBelumDihubungi);
      return asc ? diff : -diff;
    });
    return copy;
  }, [rows, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(false);
    }
  }

  const headerBtn = (key: SortKey, label: string) => (
    <button
      onClick={() => toggleSort(key)}
      className="flex items-center gap-1 text-left text-xs font-medium text-ink-secondary hover:text-ink-primary"
    >
      {label}
      {sortKey === key && <span className="text-ink-muted">{asc ? "▲" : "▼"}</span>}
    </button>
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2">{headerBtn("nama", "Fasilitator")}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-ink-secondary">Koordinator</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-ink-secondary">Login LK</th>
            <th className="px-3 py-2">{headerBtn("belumLoginApp", "% Belum Login App")}</th>
            <th className="px-3 py-2">{headerBtn("belumDihubungi", "% Belum Dihubungi")}</th>
            <th className="px-3 py-2">{headerBtn("risiko", "Nilai Risiko")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.kodeFasil} className="border-b border-gridline last:border-0 hover:bg-background">
              <td className="px-3 py-2">
                <Link href={`/fasilitator/${r.kodeFasil}?hari=${hari}`} className="font-medium text-series-1 hover:underline">
                  {r.namaFasil}
                </Link>
                <div className="text-xs text-ink-muted">{r.kodeFasil}</div>
              </td>
              <td className="px-3 py-2 text-ink-secondary">{r.namaKoor}</td>
              <td className="px-3 py-2">
                {r.fasilBelumLoginLK === "Sudah" ? (
                  <span className="text-status-good">Sudah</span>
                ) : (
                  <span className="text-status-critical">Belum</span>
                )}
              </td>
              <td className="px-3 py-2 tabular-nums text-ink-secondary">
                {typeof r.pctSekolahBelumLoginAplikasi === "number" ? `${r.pctSekolahBelumLoginAplikasi}%` : "-"}
              </td>
              <td className="px-3 py-2 tabular-nums text-ink-secondary">
                {typeof r.pctSekolahBelumDihubungi === "number" ? `${r.pctSekolahBelumDihubungi}%` : "-"}
              </td>
              <td className="px-3 py-2">
                <RiskBadge level={riskLevel(r.nilaiRisiko)} value={typeof r.nilaiRisiko === "number" ? r.nilaiRisiko : null} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

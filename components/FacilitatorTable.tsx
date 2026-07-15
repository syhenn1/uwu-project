"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FacilRow } from "@/lib/types";
import { riskLevel, getEffectiveRisk, deriveKampus } from "@/lib/metrics";
import { RiskBadge } from "./RiskBadge";

type SortKey = "nama" | "koordinator" | "risiko" | "belumLoginApp" | "belumDihubungi" | "loginLK" | "checkpoint";

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "risiko", label: "Nilai Risiko" },
  { key: "nama", label: "Nama Fasilitator (A-Z)" },
  { key: "koordinator", label: "Koordinator (A-Z)" },
  { key: "checkpoint", label: "Checkpoint Belum Sesuai" },
  { key: "loginLK", label: "Status Login LK" },
  { key: "belumLoginApp", label: "% Belum Login App" },
  { key: "belumDihubungi", label: "% Belum Dihubungi" },
];

function numOrNeg(v: FacilRow[keyof FacilRow]): number {
  return typeof v === "number" ? v : -1;
}

export function FacilitatorTable({
  rows,
  hari,
  complianceCounts,
}: {
  rows: FacilRow[];
  hari: number;
  complianceCounts?: Map<string, number>;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("risiko");
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
      if (sortKey === "risiko") diff = (getEffectiveRisk(a).value ?? -1) - (getEffectiveRisk(b).value ?? -1);
      if (sortKey === "belumLoginApp") diff = numOrNeg(a.pctSekolahBelumLoginAplikasi) - numOrNeg(b.pctSekolahBelumLoginAplikasi);
      if (sortKey === "belumDihubungi") diff = numOrNeg(a.pctSekolahBelumDihubungi) - numOrNeg(b.pctSekolahBelumDihubungi);
      if (sortKey === "loginLK") diff = (a.fasilBelumLoginLK === "Belum" ? 1 : 0) - (b.fasilBelumLoginLK === "Belum" ? 1 : 0);
      if (sortKey === "checkpoint") diff = (complianceCounts?.get(a.kodeFasil) ?? 0) - (complianceCounts?.get(b.kodeFasil) ?? 0);
      return asc ? diff : -diff;
    });
    return copy;
  }, [filtered, sortKey, asc, complianceCounts]);

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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 text-ink-secondary">
          Kampus:
          <select
            value={kampus}
            onChange={(e) => setKampus(e.target.value)}
            className="rounded border border-border bg-surface px-2 py-1 text-ink-primary"
          >
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
        <label className="flex items-center gap-1.5 text-ink-secondary">
          Urutkan:
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded border border-border bg-surface px-2 py-1 text-ink-primary"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
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
          Menampilkan {sorted.length} dari {rows.length} fasilitator
        </span>
      </div>

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
              {complianceCounts && <th className="px-3 py-2 text-left text-xs font-medium text-ink-secondary">Checkpoint</th>}
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
                  {(() => {
                    const risk = getEffectiveRisk(r);
                    return <RiskBadge level={riskLevel(risk.value)} value={risk.value} estimated={risk.estimated} />;
                  })()}
                </td>
                {complianceCounts && (
                  <td className="px-3 py-2">
                    {(() => {
                      const count = complianceCounts.get(r.kodeFasil) ?? 0;
                      return count > 0 ? (
                        <span className="text-status-critical">{count} belum sesuai</span>
                      ) : (
                        <span className="text-status-good">Sesuai</span>
                      );
                    })()}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

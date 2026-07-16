"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LkAplikasiRow } from "@/lib/anomalies";

export function LkAplikasiTable({ rows }: { rows: LkAplikasiRow[] }) {
  const router = useRouter();
  const inconsistent = rows.filter((r) => !r.konsisten);
  const total = rows.length;

  return (
    <div>
      {total > 0 && inconsistent.length / total >= 0.8 && (
        <div className="mb-3 rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-[#8a5a00] dark:text-status-warning">
          {inconsistent.length} dari {total} baris tidak konsisten untuk indikator yang sama - kemungkinan besar ini
          masalah sistemik (kolom sisi Aplikasi belum terisi di seluruh program), bukan {inconsistent.length} masalah
          fasilitator yang terpisah.
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-ink-secondary">
              <th className="px-3 py-2">Fasilitator</th>
              <th className="px-3 py-2">Indikator</th>
              <th className="px-3 py-2 text-right">Hasil LK</th>
              <th className="px-3 py-2 text-right">Aplikasi</th>
              <th className="px-3 py-2 text-right">Selisih</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                onClick={() => router.push(`/fasilitator/${r.kodeFasil}`)}
                className="cursor-pointer border-b border-gridline last:border-0 hover:bg-background"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/fasilitator/${r.kodeFasil}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-series-1 hover:underline"
                  >
                    {r.namaFasil}
                  </Link>
                </td>
                <td className="px-3 py-2 text-ink-secondary">{r.label}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{r.lk != null ? `${r.lk}%` : "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{r.aplikasi != null ? `${r.aplikasi}%` : "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{r.selisih != null ? `${r.selisih}` : "-"}</td>
                <td className="px-3 py-2">
                  {r.konsisten ? (
                    <span className="text-status-good">Konsisten</span>
                  ) : (
                    <span className="text-status-critical">Tidak konsisten</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { SKOR_AKHIR_COLUMNS } from "@/lib/skorAkhirColumns";
import type { FacilRow } from "@uwu/core/types";
import Link from "next/link";

export function AllFasilRawMatriksTable({ rows }: { rows: FacilRow[] }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="mb-3 text-sm font-semibold text-ink-primary">
        Tabel Persentase Mentah (Semua Fasilitator)
      </h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-md max-h-[600px] overflow-y-auto relative">
        <table className="w-full text-left text-sm text-ink-secondary">
          <thead className="sticky top-0 z-20 border-b border-border bg-background/95 text-xs uppercase text-ink-muted backdrop-blur-sm">
            <tr>
              <th className="sticky left-0 z-30 min-w-[200px] whitespace-normal bg-background/95 px-4 py-3 font-medium shadow-[1px_1px_0_0_var(--tw-shadow-color)] shadow-border">
                Fasilitator
              </th>
              {SKOR_AKHIR_COLUMNS.map((col, idx) => (
                <th
                  key={idx}
                  className="min-w-[130px] max-w-[180px] whitespace-normal px-4 py-3 font-medium leading-snug text-center align-bottom shadow-[0_1px_0_0_var(--tw-shadow-color)] shadow-border"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, rowIdx) => {
              if (!row.raw || Object.keys(row.raw).length === 0) return null;
              
              return (
                <tr key={rowIdx} className="transition-colors hover:bg-background/40">
                  <td className="sticky left-0 z-10 whitespace-normal bg-surface/95 px-4 py-3 font-medium backdrop-blur-sm shadow-[1px_0_0_0_var(--tw-shadow-color)] shadow-border">
                    <div className="flex flex-col">
                      <Link
                        href={`/fasilitator/${row.kodeFasil}`}
                        className="text-series-1 hover:underline truncate max-w-[180px]"
                        title={row.namaFasil}
                      >
                        {row.namaFasil}
                      </Link>
                      <span className="text-xs text-ink-muted">{row.kodeFasil}</span>
                    </div>
                  </td>
                  {SKOR_AKHIR_COLUMNS.map((col, idx) => {
                    const rawValue = row.raw[col.header] ?? "-";

                    let colorClass = "text-ink-primary";
                    if (typeof rawValue === "string" && rawValue.includes("%")) {
                      const num = parseFloat(rawValue);
                      if (!isNaN(num)) {
                        if (num === 100) colorClass = "bg-status-good/20 text-ink-primary font-medium";
                        else if (num < 50) colorClass = "bg-status-critical/20 text-ink-primary font-medium";
                        else if (num < 90) colorClass = "bg-status-warning/20 text-ink-primary font-medium";
                      }
                    }

                    return (
                      <td key={idx} className={`whitespace-nowrap px-4 py-2.5 text-center ${colorClass}`}>
                        {rawValue}
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

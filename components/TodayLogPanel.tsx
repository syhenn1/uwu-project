import { SKOR_AKHIR_COLUMNS, groupSkorAkhirColumns, percentCellColorClass, skorAkhirColorClass } from "@/lib/skorAkhirColumns";
import type { FacilRow } from "@uwu/core/types";
import type { DayLogSnapshot } from "@/lib/sheet";

const LABEL_CELL = "overflow-hidden text-ellipsis whitespace-nowrap px-2 py-2 text-xs font-medium";

const HEADER_GROUPS = groupSkorAkhirColumns();

/** "100.00%" -> "100%", "75.83%" -> "75.83%" - buang desimal ".00" yang cuma
 * bulat, tapi pertahankan desimal yang beneran ada isinya (dari sel mentah). */
function formatPercentDisplay(raw: string): string {
  const match = raw.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (!match) return raw;
  const num = parseFloat(match[1]);
  return Number.isInteger(num) ? `${num}%` : `${num.toFixed(2)}%`;
}

function LogRow({ label, fullLabel, row }: { label: string; fullLabel: string; row: FacilRow | null }) {
  if (!row) {
    return (
      <tr>
        <td className={LABEL_CELL} title={fullLabel}>{label}</td>
        <td colSpan={SKOR_AKHIR_COLUMNS.length + 1} className="px-2 py-2 text-xs text-ink-muted">
          Belum ada data
        </td>
      </tr>
    );
  }
  return (
    <tr className="transition-colors hover:bg-background/40">
      <td className={LABEL_CELL} title={fullLabel}>{label}</td>
      {SKOR_AKHIR_COLUMNS.map((col, idx) => {
        const rawValue = row.raw[col.header] ?? "-";
        return (
          <td
            key={idx}
            title={col.header}
            className={`overflow-hidden text-ellipsis whitespace-nowrap px-1 py-2 text-center text-xs ${percentCellColorClass(rawValue)}`}
          >
            {formatPercentDisplay(rawValue)}
          </td>
        );
      })}
      <td
        title="Nilai Akhir"
        className={`overflow-hidden text-ellipsis whitespace-nowrap border-l border-border/60 px-1 py-2 text-center text-xs ${skorAkhirColorClass(row.skorAkhir)}`}
      >
        {typeof row.skorAkhir === "number" ? (Number.isInteger(row.skorAkhir) ? `${row.skorAkhir}%` : `${row.skorAkhir.toFixed(2)}%`) : "-"}
      </td>
    </tr>
  );
}

/** Menampilkan snapshot Log 1 (07.00 WIB) dan Log 2 (13.30 WIB) untuk HARI
 * INI berdampingan (dua kali isi LK per hari - beda dari histori per-hari di
 * DaySelector yang cuma ambil satu, Log 2 kalau sudah diisi/fallback Log 1,
 * lihat lib/sheet.ts::fetchFacilitatorLog) supaya kelihatan progres dalam
 * satu hari, bukan cuma across hari. Sengaja satu tabel ringkas, BUKAN dua
 * FacilMetricsList penuh - supaya tidak
 * mendorong konten di bawahnya (termasuk sidebar sticky kiri/kanan) terlalu
 * jauh ke bawah. Tidak render apa-apa kalau dua-duanya belum ada data sama
 * sekali (mis. tab "Log" gagal diambil). */
export function TodayLogPanel({
  hari,
  todayHari,
  logs,
}: {
  /** Hari yang lagi ditampilkan (ikut DaySelector), bukan selalu hari ini. */
  hari: number;
  todayHari: number;
  logs: DayLogSnapshot | null;
}) {
  if (!logs || (!logs.log1 && !logs.log2)) return null;

  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold text-ink-primary">
        {hari === todayHari ? `Log Hari Ini (Hari ${hari})` : `Log Hari ${hari}`}
      </h2>
      <div className="w-full rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full table-fixed text-left text-sm text-ink-secondary">
          <thead className="border-b border-border bg-background/50 text-[10px] uppercase text-ink-muted">
            <tr>
              <th rowSpan={2} className="w-16 whitespace-nowrap px-2 py-2 text-left align-bottom font-medium">
                Log
              </th>
              {HEADER_GROUPS.map((g, idx) => (
                <th
                  key={idx}
                  colSpan={g.span}
                  title={`Checkpoint ${g.checkpointNo}. ${g.checkpointName} (aktif sejak Hari ${g.activeFromDay})`}
                  className="border-l border-border/60 px-1 py-1 text-center font-semibold leading-tight"
                >
                  H{g.activeFromDay || "?"}
                  {g.shortCode && <span className="ml-0.5 font-normal text-ink-muted">{g.shortCode}</span>}
                </th>
              ))}
              <th rowSpan={2} className="w-16 whitespace-nowrap border-l border-border/60 px-1 py-2 text-center align-bottom font-medium">
                Nilai Akhir
              </th>
            </tr>
            <tr>
              {HEADER_GROUPS.flatMap((g) =>
                g.cols.map((col, i) => (
                  <th
                    key={`${g.checkpointNo}-${i}`}
                    title={col.header}
                    className="border-l border-border/60 px-1 py-1 text-center font-normal normal-case"
                  >
                    {col.short}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <LogRow label="Log 1" fullLabel="Log 1 · 07.00 WIB" row={logs.log1} />
            <LogRow label="Log 2" fullLabel="Log 2 · 13.30 WIB" row={logs.log2} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

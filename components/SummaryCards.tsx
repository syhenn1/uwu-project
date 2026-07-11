import type { DaySummary } from "@/lib/metrics";
import { StatTile } from "./StatTile";

export function SummaryCards({ summary }: { summary: DaySummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Total Fasilitator" value={String(summary.totalFasilitator)} />
      <StatTile
        label="Belum Login LK"
        value={String(summary.belumLogin)}
        tone={summary.belumLogin > 0 ? "warning" : "default"}
      />
      <StatTile
        label="Rata-rata Nilai Risiko"
        value={summary.avgRisiko != null ? `${summary.avgRisiko.toFixed(1)}%` : "-"}
      />
      <StatTile
        label="Fasilitator Risiko Tinggi"
        value={String(summary.tinggiCount)}
        tone={summary.tinggiCount > 0 ? "critical" : "default"}
      />
    </div>
  );
}

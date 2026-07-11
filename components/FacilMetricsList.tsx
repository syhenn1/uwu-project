import { activeCheckpoints } from "@/lib/knowledge/checkpoints";
import { KEY_TO_HEADER } from "@/lib/columns";
import type { FacilRow } from "@/lib/types";
import { InfoTooltip } from "./InfoTooltip";

function formatValue(v: FacilRow[keyof FacilRow]): string {
  if (v == null) return "-";
  if (typeof v === "number") return `${v}%`;
  return String(v);
}

export function FacilMetricsList({ row }: { row: FacilRow }) {
  const groups = activeCheckpoints(row.hari);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.no} className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h4 className="text-sm font-semibold text-ink-primary">
              {group.no}. {group.name}
            </h4>
            <span className="text-xs text-ink-muted">bobot {group.bobotTotal}</span>
          </div>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {group.indicators.map((ind) => (
              <div key={ind.kolom} className="flex items-center justify-between gap-2 text-sm">
                <dt className="flex items-center text-ink-secondary">
                  {KEY_TO_HEADER[ind.kolom] ?? ind.kolom}
                  <InfoTooltip text={`${ind.definisi} (sumber: ${ind.sumberData ?? "-"})`} />
                </dt>
                <dd className="tabular-nums font-medium text-ink-primary">{formatValue(row[ind.kolom])}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

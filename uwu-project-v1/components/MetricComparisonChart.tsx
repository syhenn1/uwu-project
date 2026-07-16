"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COMPARABLE_METRICS, computeGoodness, goodnessBucket } from "@/lib/chartMetrics";
import type { FacilRow } from "@/lib/types";

const BUCKET_COLOR: Record<string, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  critical: "var(--status-critical)",
};

export function MetricComparisonChart({ rows }: { rows: FacilRow[] }) {
  const [kolom, setKolom] = useState<string>(COMPARABLE_METRICS[0].kolom);
  const metric = COMPARABLE_METRICS.find((m) => m.kolom === kolom) ?? COMPARABLE_METRICS[0];

  const data = useMemo(() => {
    return rows
      .map((r) => {
        const raw = r[metric.kolom as keyof FacilRow];
        if (typeof raw !== "number") return null;
        const goodness = computeGoodness(raw, metric.polarity);
        return {
          nama: r.namaFasil,
          kodeFasil: r.kodeFasil,
          value: raw,
          goodness,
          bucket: goodnessBucket(goodness),
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .sort((a, b) => a.goodness - b.goodness);
  }, [rows, metric]);

  const categories = Array.from(new Set(COMPARABLE_METRICS.map((m) => m.category)));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          Metrik:
          <select
            value={kolom}
            onChange={(e) => setKolom(e.target.value)}
            className="max-w-[320px] rounded border border-border bg-background px-2 py-1 text-ink-primary"
          >
            {categories.map((cat) => (
              <optgroup key={cat} label={cat}>
                {COMPARABLE_METRICS.filter((m) => m.category === cat).map((m) => (
                  <option key={String(m.kolom)} value={String(m.kolom)}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <span className="text-xs text-ink-muted">
          Arah: {metric.polarity === "higherIsBetter" ? "semakin tinggi semakin baik" : "semakin tinggi semakin buruk"} · warna
          selalu berarti sama (hijau = baik, merah = perlu perhatian)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={Math.max(240, data.length * 26 + 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 48, left: 8, bottom: 8 }} barCategoryGap={4}>
          <CartesianGrid stroke="var(--gridline)" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--baseline)" }}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis type="category" dataKey="nama" width={160} tick={{ fill: "var(--ink-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--ink-primary)" }}
            formatter={(value) => [`${value}%`, metric.label]}
          />
          <Bar dataKey="value" maxBarSize={18} radius={[0, 4, 4, 0]}>
            {data.map((d) => (
              <Cell key={d.kodeFasil} fill={BUCKET_COLOR[d.bucket]} />
            ))}
            <LabelList dataKey="value" position="right" formatter={(v) => `${v}%`} style={{ fill: "var(--ink-secondary)", fontSize: 11 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FacilRow } from "@/lib/types";

const SERIES: Array<{ key: keyof FacilRow; label: string; color: string }> = [
  { key: "nilaiRisiko", label: "Nilai Risiko", color: "var(--series-1)" },
  { key: "pctSekolahBelumLoginAplikasi", label: "% Belum Login Aplikasi", color: "var(--series-2)" },
  { key: "pctDokAdminTerunggahDibawah90", label: "% Dok. Admin Terunggah < 90%", color: "var(--series-3)" },
  { key: "pctDokTeknisTerunggahDibawah90", label: "% Dok. Teknis Terunggah < 90%", color: "var(--series-5)" },
];

export function TrendChart({ history }: { history: FacilRow[] }) {
  const data = history.map((r) => ({
    hari: `H${r.hari}`,
    nilaiRisiko: typeof r.nilaiRisiko === "number" ? r.nilaiRisiko : null,
    pctSekolahBelumLoginAplikasi: typeof r.pctSekolahBelumLoginAplikasi === "number" ? r.pctSekolahBelumLoginAplikasi : null,
    pctDokAdminTerunggahDibawah90: typeof r.pctDokAdminTerunggahDibawah90 === "number" ? r.pctDokAdminTerunggahDibawah90 : null,
    pctDokTeknisTerunggahDibawah90: typeof r.pctDokTeknisTerunggahDibawah90 === "number" ? r.pctDokTeknisTerunggahDibawah90 : null,
  }));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis dataKey="hari" tick={{ fill: "var(--ink-muted)", fontSize: 12 }} axisLine={{ stroke: "var(--baseline)" }} tickLine={false} />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "var(--ink-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--ink-primary)" }}
            formatter={(value) => (value == null ? "-" : `${value}%`)}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--ink-secondary)" }} />
          {SERIES.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 4, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

import Link from "next/link";
import { getFacilRows, getTodayHari, isUsingSampleData } from "@/lib/sheet";
import { getAvailableDays, getFacilitators, getRowsForDay, summarizeDay } from "@/lib/metrics";
import { getCheckpointCompliance, countNonCompliant } from "@/lib/compliance";
import { compareLkAplikasi, scanAllAnomalies } from "@/lib/anomalies";
import { countQualitativeActivityByDay } from "@/lib/notes";
import { DaySelector } from "@/components/DaySelector";
import { ModeToggle } from "@/components/ModeToggle";
import { SummaryCards } from "@/components/SummaryCards";
import { StatTile } from "@/components/StatTile";
import { FacilitatorTable } from "@/components/FacilitatorTable";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { QualitativeActivityChart } from "@/components/QualitativeActivityChart";
import { LkAplikasiTable } from "@/components/LkAplikasiTable";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ hari?: string; mode?: string }>;
}) {
  const { hari: hariParam, mode: modeParam } = await searchParams;
  const mode: "alltime" | "harian" = modeParam === "harian" ? "harian" : "alltime";

  const rows = await getFacilRows();
  const days = getAvailableDays(rows);
  const latestDay = days[days.length - 1] ?? 1;
  const todayHari = await getTodayHari();

  const hari = mode === "harian" ? (hariParam ? parseInt(hariParam, 10) : latestDay) : todayHari;
  const dayRows = getRowsForDay(rows, hari);
  const summary = summarizeDay(dayRows);

  const complianceCounts = new Map(
    dayRows.map((r) => [r.kodeFasil, countNonCompliant(getCheckpointCompliance(r, hari))])
  );
  const nonCompliantFacilCount = [...complianceCounts.values()].filter((c) => c > 0).length;
  const hariRelLabel = hari === todayHari ? "hari ini" : hari < todayHari ? "sudah lewat" : "belum terjadi";

  const lkAplikasiRows = compareLkAplikasi(rows, todayHari);
  const anomalyReports = scanAllAnomalies(rows, todayHari);
  const activity = countQualitativeActivityByDay(rows, todayHari);

  return (
    <div className="flex flex-col gap-6">
      {isUsingSampleData() && (
        <div className="rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-[#8a5a00] dark:text-status-warning">
          Menampilkan data contoh (fixtures/sample-sheet.csv). Set <code className="font-mono">SHEET_CSV_URL</code> di{" "}
          <code className="font-mono">.env.local</code> untuk memakai data spreadsheet asli.
        </div>
      )}

      <div>
        <h1 className="text-lg font-semibold">Dashboard Fasilitator</h1>
        <p className="text-sm text-ink-secondary">Pantau kinerja fasilitator selama siklus pendampingan 14 hari.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ModeToggle mode={mode} />
        {mode === "harian" && (
          <DaySelector days={days} current={hari} todayHari={todayHari} extraParams={{ mode: "harian" }} />
        )}
      </div>

      <SummaryCards summary={summary} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label={`Checkpoint Belum Sesuai (per Hari ${hari}, ${hariRelLabel})`}
          value={String(nonCompliantFacilCount)}
          tone={nonCompliantFacilCount > 0 ? "critical" : "default"}
        />
        <Link href="/anomali" className="block">
          <StatTile
            label="Fasilitator dengan Anomali (lihat detail →)"
            value={`${anomalyReports.length}/${getFacilitators(rows).length}`}
            tone={anomalyReports.length > 0 ? "warning" : "default"}
          />
        </Link>
      </div>

      {mode === "alltime" && <QualitativeActivityChart data={activity} />}

      <AnalysisPanel
        endpoint="/api/analyze/summary"
        payload={{ hari }}
        title={mode === "alltime" ? `Ringkasan AI - Kondisi Terkini (Hari ${todayHari})` : `Ringkasan AI - Hari ${hari}`}
        buttonLabel="Buat Ringkasan AI"
      />

      <FacilitatorTable rows={dayRows} hari={hari} complianceCounts={complianceCounts} />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Perbandingan Hasil LK vs Aplikasi</h2>
        <LkAplikasiTable rows={lkAplikasiRows} />
      </div>
    </div>
  );
}

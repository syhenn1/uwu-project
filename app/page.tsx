import { getFacilRows, isUsingSampleData } from "@/lib/sheet";
import { getAvailableDays, getRowsForDay, summarizeDay } from "@/lib/metrics";
import { DaySelector } from "@/components/DaySelector";
import { SummaryCards } from "@/components/SummaryCards";
import { FacilitatorTable } from "@/components/FacilitatorTable";
import { AnalysisPanel } from "@/components/AnalysisPanel";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ hari?: string }>;
}) {
  const { hari: hariParam } = await searchParams;
  const rows = await getFacilRows();
  const days = getAvailableDays(rows);
  const latestDay = days[days.length - 1] ?? 1;
  const hari = hariParam ? parseInt(hariParam, 10) : latestDay;
  const dayRows = getRowsForDay(rows, hari);
  const summary = summarizeDay(dayRows);

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
        <p className="text-sm text-ink-secondary">Pantau kinerja fasilitator per hari selama siklus pendampingan 14 hari.</p>
      </div>

      <DaySelector days={days} current={hari} />
      <SummaryCards summary={summary} />

      <AnalysisPanel
        endpoint="/api/analyze/summary"
        payload={{ hari }}
        title={`Ringkasan AI - Hari ${hari}`}
        buttonLabel="Buat Ringkasan AI"
      />

      <FacilitatorTable rows={dayRows} hari={hari} />
    </div>
  );
}

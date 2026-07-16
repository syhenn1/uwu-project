import { getFacilRows, getTodayHari } from "@/lib/sheet";
import { getFacilitators } from "@/lib/metrics";
import { buildSystemicReport, renderSystemicReportText } from "@/lib/systemicReport";
import { StatTile } from "@/components/StatTile";
import { ReportActions } from "@/components/ReportActions";
import { NotifyPanel } from "@/components/NotifyPanel";

export default async function LaporanPage() {
  const rows = await getFacilRows();
  const todayHari = await getTodayHari();
  const totalFasilitator = getFacilitators(rows).length;
  const report = buildSystemicReport(rows, todayHari, totalFasilitator);
  const text = renderSystemicReportText(report);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Laporan Masalah Data Sistemik</h1>
        <p className="text-sm text-ink-secondary">
          Ringkasan siap-kirim untuk tim data/Aplikasi Revit - masalah yang levelnya program-wide, bukan per
          fasilitator. Dihitung ulang tiap dibuka (per Hari ke-{todayHari}).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Nilai Risiko Terisi" value={`${report.nilaiRisikoTerisi}/${report.totalBaris}`} tone={report.nilaiRisikoTerisi === 0 ? "critical" : "default"} />
        <StatTile label="Belum Login LK" value={String(report.neverLoggedInCount)} />
        <StatTile label="Kolom Nilai Seragam" value={String(report.uniformColumns.length)} tone={report.uniformColumns.length > 0 ? "warning" : "default"} />
        <StatTile
          label="Pasangan LK/Aplikasi Tak Konsisten"
          value={String(report.lkAplikasiMismatchRate.reduce((a, b) => a + b.affected, 0))}
        />
      </div>

      <ReportActions text={text} filename={`laporan-sistemik-hari-${todayHari}.txt`} />

      <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-surface p-4 font-mono text-xs leading-relaxed text-ink-primary">
        {text}
      </pre>

      <NotifyPanel />
    </div>
  );
}

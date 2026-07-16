import { getFacilRows, getTodayHari } from "@/lib/sheet";
import { groupRowsByFacilitator, getCurrentRow } from "@/lib/metrics";
import { DocumentProgressFunnel } from "@/components/DocumentProgressFunnel";
import { DocumentProgressTable } from "@/components/DocumentProgressTable";
import { SeverityLegend } from "@/components/SeverityBadge";

export default async function ProgresDokumenPage() {
  const rows = await getFacilRows();
  const todayHari = await getTodayHari();

  const byFasil = groupRowsByFacilitator(rows);
  const currentRows = [...byFasil.values()]
    .map((history) => getCurrentRow(history, todayHari))
    .filter((r): r is NonNullable<typeof r> => !!r);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Progres Dokumen: Terunggah → Terverifikasi → Sesuai</h1>
        <p className="text-sm text-ink-secondary">
          Kondisi terkini (per Hari ke-{todayHari}) tiap fasilitator, supaya penurunan persentase dari dokumen yang
          sekadar terunggah sampai yang benar-benar dinyatakan sesuai kelihatan jelas per tahap - baik untuk Dokumen
          Admin maupun Dokumen Teknis.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-3.5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Acuan warna</p>
        <SeverityLegend />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DocumentProgressFunnel rows={currentRows} kategori="Admin" />
        <DocumentProgressFunnel rows={currentRows} kategori="Teknis" />
      </div>

      <DocumentProgressTable rows={currentRows} hari={todayHari} />
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { getFacilRows } from "@/lib/sheet";
import { getRowsForFacilitator, riskLevel, hasStagnantMetrics } from "@/lib/metrics";
import { DaySelector } from "@/components/DaySelector";
import { TrendChart } from "@/components/TrendChart";
import { FacilMetricsList } from "@/components/FacilMetricsList";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { RiskBadge } from "@/components/RiskBadge";

const QUALITATIVE_FIELDS = [
  { key: "kendalaKomunikasi", label: "Kendala Komunikasi" },
  { key: "kendalaPanlakFormatTemplate", label: "Kendala Panlak/Format/Template" },
  { key: "kendalaMendapatkanPerencana", label: "Kendala Mendapatkan Perencana" },
  { key: "kendalaVerifikasiBiodata", label: "Kendala Verifikasi Biodata" },
  { key: "kendalaUpdateDapodik", label: "Kendala Update Dapodik" },
  { key: "kendalaPenyusunanDokAdmin", label: "Kendala Penyusunan Dok. Admin" },
  { key: "kendalaVerifikasiDokAdmin", label: "Kendala Verifikasi Dok. Admin" },
  { key: "kendalaPenyusunanDokTeknis", label: "Kendala Penyusunan Dok. Teknis" },
  { key: "kendalaVerifikasiDokTeknis", label: "Kendala Verifikasi Dok. Teknis" },
  { key: "kendalaPenyepakatanRAB", label: "Kendala Penyepakatan RAB" },
  { key: "analisis", label: "Analisis (admin)" },
  { key: "catatanAdmin", label: "Catatan Admin" },
] as const;

export default async function FacilitatorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ kode: string }>;
  searchParams: Promise<{ hari?: string }>;
}) {
  const { kode } = await params;
  const { hari: hariParam } = await searchParams;
  const rows = await getFacilRows();
  const history = getRowsForFacilitator(rows, kode);
  if (history.length === 0) notFound();

  const days = history.map((r) => r.hari);
  const latestDay = days[days.length - 1];
  const hari = hariParam ? parseInt(hariParam, 10) : latestDay;
  const currentRow = history.find((r) => r.hari === hari) ?? history[history.length - 1];
  const stagnant = hasStagnantMetrics(history);

  const notes = history.flatMap((row) =>
    QUALITATIVE_FIELDS.filter((f) => {
      const v = row[f.key];
      return typeof v === "string" && v.trim() !== "" && v !== "Belum Diisi";
    }).map((f) => ({ hari: row.hari, label: f.label, text: row[f.key] as string }))
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/" className="text-sm text-series-1 hover:underline">
          ← Kembali ke Dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">{currentRow.namaFasil}</h1>
          <RiskBadge level={riskLevel(currentRow.nilaiRisiko)} value={typeof currentRow.nilaiRisiko === "number" ? currentRow.nilaiRisiko : null} />
          {stagnant && (
            <span className="rounded-full bg-status-warning/15 px-2.5 py-1 text-xs font-medium text-[#8a5a00] dark:text-status-warning">
              ⚠ Data tidak berubah beberapa hari berturut-turut
            </span>
          )}
        </div>
        <p className="text-sm text-ink-secondary">
          {currentRow.kodeFasil} · Koordinator: {currentRow.namaKoor} ({currentRow.kodeKoor}) · Admin: {currentRow.atmin}
        </p>
      </div>

      <DaySelector days={days} current={hari} basePath={`/fasilitator/${kode}`} />

      <TrendChart history={history} />

      <AnalysisPanel
        endpoint="/api/analyze/facilitator"
        payload={{ kodeFasil: kode, hari }}
        title={`Analisis AI - sampai Hari ${hari}`}
        buttonLabel="Buat Analisis AI"
      />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Detail Metrik - Hari {hari}</h2>
        <FacilMetricsList row={currentRow} />
      </div>

      {notes.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink-primary">Catatan Kualitatif</h2>
          <ul className="flex flex-col gap-2">
            {notes.map((n, i) => (
              <li key={i} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <span className="mr-2 rounded bg-background px-1.5 py-0.5 text-xs text-ink-muted">Hari {n.hari}</span>
                <span className="font-medium text-ink-secondary">{n.label}:</span> <span className="text-ink-primary">{n.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

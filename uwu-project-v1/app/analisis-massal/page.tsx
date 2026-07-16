import { getFacilRows, getTodayHari } from "@/lib/sheet";
import { getFacilitators, getAvailableDays } from "@/lib/metrics";
import { BulkAnalysisRunner } from "@/components/BulkAnalysisRunner";
import { DailySummaryBulkRunner } from "@/components/DailySummaryBulkRunner";
import { AnalysisScopeTabs } from "@/components/AnalysisScopeTabs";
import { isAnyProviderConfigured, configuredProviderNames } from "@/lib/llm";

export default async function AnalisisMassalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const tab: "fasilitator" | "harian" = tabParam === "harian" ? "harian" : "fasilitator";

  const rows = await getFacilRows();
  const facilitators = getFacilitators(rows).map((f) => ({ kodeFasil: f.kodeFasil, namaFasil: f.namaFasil }));
  const days = getAvailableDays(rows);
  const todayHari = await getTodayHari();

  const aiConfigured = isAnyProviderConfigured();
  const providerNames = configuredProviderNames();
  const totalPanggilan = facilitators.length * days.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Analisis Massal</h1>
        <p className="text-sm text-ink-secondary">
          {tab === "fasilitator" ? (
            <>
              Generate analisis AI untuk setiap fasilitator di setiap hari sekaligus ({facilitators.length}{" "}
              fasilitator × {days.length} hari = {totalPanggilan} analisis).
            </>
          ) : (
            <>
              Generate rekap analisis AI kondisi <strong>seluruh {facilitators.length} fasilitator</strong> untuk
              tiap hari sekaligus ({days.length} hari) - mencakup analisis kuantitatif (Nilai Risiko & checkpoint)
              maupun kualitatif (catatan Kendala/lapangan), sama seperti panel &quot;Ringkasan AI&quot; di Dashboard
              tapi untuk semua hari sekali jalan.
            </>
          )}
          {aiConfigured && ` Provider aktif (urutan fallback): ${providerNames.join(" → ")}.`}
        </p>
      </div>
      {!aiConfigured && (
        <div className="rounded-md border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
          Belum ada provider AI dikonfigurasi di <code className="font-mono">.env.local</code> - semua panggilan akan
          langsung gagal. Isi salah satu: <code className="font-mono">HF_TOKEN</code>,{" "}
          <code className="font-mono">GEMINI_API_KEY</code>, atau <code className="font-mono">GROQ_API_KEY</code>.
        </div>
      )}
      <AnalysisScopeTabs tab={tab} />
      {tab === "fasilitator" ? (
        <BulkAnalysisRunner facilitators={facilitators} days={days} />
      ) : (
        <DailySummaryBulkRunner days={days} todayHari={todayHari} totalFasilitator={facilitators.length} />
      )}
    </div>
  );
}

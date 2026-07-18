import { notFound } from "next/navigation";
import Link from "next/link";
import { getFacilRowsForSelectedAdmin, getTodayHari, getFacilitatorLogData } from "@/lib/sheet";
import { fetchAnalisisFromSheet } from "@/lib/writeSheet";
import { auth } from "@/lib/auth";
import { getRowsForFacilitator, riskLevel, getEffectiveRisk, getCurrentRow, getFacilitators } from "@uwu/core/metrics";
import { getCheckpointCompliance, countNonCompliant } from "@uwu/core/compliance";
import { buildNoteRanges, formatHariRange, QUALITATIVE_FIELDS } from "@uwu/core/notes";
import { detectFacilitatorAnomalies } from "@uwu/core/anomalies";
import { TOTAL_HARI_SIKLUS } from "@uwu/core/knowledge/checkpoints";
import type { FacilRow } from "@uwu/core/types";
import { DaySelector } from "@/components/DaySelector";
import { ModeToggle } from "@/components/ModeToggle";
import { FacilitatorAnalysisWorkbench, FacilKendalaPanel } from "@/components/FacilitatorAnalysisWorkbench";
import { RiskBadge } from "@/components/RiskBadge";
import { AnomalyList } from "@/components/AnomalyList";
import { getFacilitatorLkEditUrl } from "@/lib/facilitatorLkLinks";
import { TodayLogPanel } from "@/components/TodayLogPanel";

function hariRelativeLabel(hari: number, todayHari: number): string {
  if (hari === todayHari) return "hari ini";
  if (hari < todayHari) return "sudah lewat";
  return "belum terjadi";
}

export default async function FacilitatorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ kode: string }>;
  searchParams: Promise<{ hari?: string; mode?: string }>;
}) {
  const { kode } = await params;
  const { hari: hariParam, mode: modeParam } = await searchParams;
  const mode: "alltime" | "harian" = modeParam === "alltime" ? "alltime" : "harian";

  const session = await auth();
  // @ts-expect-error accessToken ada di config JWT NextAuth kita
  const accessToken = session?.accessToken;

  // fetchAnalisisFromSheet (sekarang lewat REST API Sheets) TERUKUR cepat
  // karena caching sheet metadata. Tapi tetap kita jalankan paralel.
  const eagerHari = mode === "harian" && hariParam ? parseInt(hariParam, 10) : null;
  const eagerAnalisis = eagerHari != null ? fetchAnalisisFromSheet(kode, eagerHari, accessToken) : null;

  // v2: link LK Fasil pribadi & histori tab "Log" datang dari spreadsheet
  // controller (fetch async), beda dari v1 yang baca env var statis secara
  // sinkron - independen satu sama lain jadi di-fetch paralel.
  const [rows, todayHari, editUrl, logData] = await Promise.all([
    getFacilRowsForSelectedAdmin(),
    getTodayHari(),
    getFacilitatorLkEditUrl(kode),
    getFacilitatorLogData(kode),
  ]);

  // Histori multi-hari dari tab "Log" (kalau ada, lihat lib/sheet.ts) -
  // supaya DaySelector bisa menampilkan semua hari yang datanya sudah ada
  // (mis. Hari 10/11/12), bukan cuma 1 hari terkini seperti tab "Isian".
  // Fallback ke histori 1-baris lama kalau tab "Log" gagal diambil/kosong.
  const history = logData && logData.history.length > 0 ? logData.history : getRowsForFacilitator(rows, kode);
  if (history.length === 0) notFound();

  const days = history.map((r) => r.hari);
  const latestDay = days[days.length - 1];

  let hari: number;
  let currentRow: FacilRow;
  if (mode === "alltime") {
    currentRow = getCurrentRow(history, todayHari) ?? history[history.length - 1];
    hari = currentRow.hari;
  } else {
    hari = hariParam ? parseInt(hariParam, 10) : latestDay;
    currentRow = history.find((r) => r.hari === hari) ?? getCurrentRow(history, todayHari) ?? history[history.length - 1];
  }

  // Ikuti hari yang lagi dipilih (DaySelector), bukan cuma hari ini - supaya
  // panel "Log Hari Ini" berubah juga saat pindah ke hari lain.
  const todayLogs = logData?.logsByHari.get(hari) ?? null;

  // "Keseluruhan" sengaja tidak digating per hari - tunjukkan status SEMUA 14
  // checkpoint terhadap kondisi terkini, bukan cuma yang sudah jatuh tempo.
  const complianceHari = mode === "alltime" ? TOTAL_HARI_SIKLUS : hari;
  const risk = getEffectiveRisk(currentRow);
  const compliance = getCheckpointCompliance(currentRow, complianceHari);
  const nonCompliantCount = countNonCompliant(compliance);
  const relLabel = hariRelativeLabel(hari, todayHari);

  // Isi kolom "Analisis" yang SUDAH ADA di spreadsheet (tabel log harian,
  // bukan tab "Isian" yang di-fetch getFacilRows() - lihat fetchAnalisisFromSheet)
  // untuk Hari yang lagi dilihat, supaya field di FacilitatorAnalysisWorkbench
  // ke-prefill dan bisa diedit lagi, bukan selalu kosong. null (gagal-lunak
  // di banyak kondisi) berarti workbench fallback ke kosong seperti sebelumnya.
  // Pakai hasil eagerAnalisis (sudah jalan paralel di atas) kalau `hari`
  // final cocok dengan eagerHari - cuma fallback sequential kalau belum ada
  // (alltime, atau kunjungan pertama tanpa hariParam di URL).
  const existingAnalisis = eagerHari === hari && eagerAnalisis ? await eagerAnalisis : await fetchAnalisisFromSheet(kode, hari, accessToken);

  const notes = buildNoteRanges(history, QUALITATIVE_FIELDS, (text) => text !== "Belum Diisi");
  const unfilled = buildNoteRanges(history, QUALITATIVE_FIELDS, (text) => text === "Belum Diisi");
  const anomalies = detectFacilitatorAnomalies(history, todayHari);

  // Daftar terurut nama - dipakai untuk navigasi Sebelumnya/Selanjutnya, supaya
  // admin bisa review kendala & isi Analisis satu fasilitator demi satu tanpa
  // harus balik ke Dashboard tiap kali pindah.
  const allFacilitators = getFacilitators(rows);
  const facilIndex = allFacilitators.findIndex((f) => f.kodeFasil === kode);
  const prevFacilitator = facilIndex > 0 ? allFacilitators[facilIndex - 1] : null;
  const nextFacilitator = facilIndex >= 0 && facilIndex < allFacilitators.length - 1 ? allFacilitators[facilIndex + 1] : null;

  return (
    // Halaman ini butuh lebar penuh layar (bukan max-w-6xl bawaan <main> di
    // layout.tsx) - 3 kolom (sidebar kiri + konten + panel Analisis kanan)
    // kalau dipaksa ke 1152px jadi sempit. Trik "full-bleed": lebar 100vw,
    // dipusatkan ulang lewat left-1/2 + -translate-x-1/2, supaya keluar dari
    // batas max-width & centering parent-nya tanpa mengubah layout.tsx global
    // (yang masih dipakai halaman lain).
    <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 py-3 sm:px-6 lg:h-[calc(100vh-52px)] lg:px-8 lg:py-3">
      <div className="flex h-full flex-col gap-3">
      {anomalies.length > 0 && (
        <a
          href="#anomali-terdeteksi"
          className="block w-full shrink-0 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-2 text-sm font-semibold text-status-critical hover:bg-status-critical/15"
        >
          ⚠ {anomalies.length} anomali terdeteksi pada data fasilitator ini - data mungkin tidak akurat, jangan
          langsung dipercaya. Lihat detail di bagian &quot;Anomali Terdeteksi&quot; ↓
        </a>
      )}
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-series-1 hover:underline">
            ← Kembali ke Dashboard
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-semibold">{currentRow.namaFasil}</h1>
            <RiskBadge level={riskLevel(risk.value)} value={risk.value} estimated={risk.estimated} />
            {editUrl && (
              <a
                href={editUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-ink-secondary hover:border-series-1 hover:text-series-1"
              >
                LK Fasil ↗
              </a>
            )}
            {nonCompliantCount > 0 && (
              <span className="rounded-full bg-status-critical/10 px-2.5 py-1 text-xs font-medium text-status-critical">
                ⚠ {nonCompliantCount} checkpoint belum sesuai (
                {mode === "alltime" ? `keseluruhan siklus, kondisi terkini Hari ${todayHari}` : `per Hari ${hari}, ${relLabel}`})
              </span>
            )}
          </div>
          <p className="text-sm text-ink-secondary">
            {currentRow.kodeFasil} · Koordinator: {currentRow.namaKoor} ({currentRow.kodeKoor}) · Admin: {currentRow.atmin}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ModeToggle mode={mode} basePath={`/fasilitator/${kode}`} />
          {mode === "harian" && (
            <DaySelector days={days} current={hari} basePath={`/fasilitator/${kode}`} todayHari={todayHari} />
          )}
        </div>
      </div>

      <div className="shrink-0 lg:max-h-[38vh] lg:overflow-y-auto">
        <TodayLogPanel hari={hari} todayHari={todayHari} logs={todayLogs} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* Baris 2 kartu utama - dipisah dari kendala historis di bawah supaya
         * items-stretch bisa menyamakan tinggi PERSIS antara kartu Kendala &
         * kartu Analisis, tanpa terganggu konten tambahan yang panjangnya
         * bervariasi (anomali/catatan/belum-diisi). */}
        <div className="grid min-h-0 grid-cols-1 gap-3 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_480px] lg:items-stretch">
          <FacilKendalaPanel row={currentRow} history={history} compliance={compliance} hari={hari} />
          <FacilitatorAnalysisWorkbench
            key={`${kode}-${hari}-${mode}`}
            row={currentRow}
            hari={hari}
            mode={mode}
            prevFacilitator={prevFacilitator}
            nextFacilitator={nextFacilitator}
            existingAnalisis={existingAnalisis}
          />
        </div>

        {(anomalies.length > 0 || notes.length > 0 || unfilled.length > 0) && (
          <div className="shrink-0 lg:max-h-[22vh] lg:overflow-y-auto">
            {anomalies.length > 0 && (
              <div id="anomali-terdeteksi" className="mb-2">
                <h2 className="mb-2 text-sm font-semibold text-ink-primary">Anomali Terdeteksi</h2>
                <AnomalyList items={anomalies} />
              </div>
            )}

            {notes.length > 0 && (
              <div className="mb-2">
                <h2 className="mb-1.5 text-xs font-semibold text-ink-primary">Kendala - Catatan Kualitatif</h2>
                <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                  {notes.map((n, i) => (
                    <li key={i} className="rounded-md border border-border bg-surface p-2 text-xs shadow-sm">
                      <span className="mr-1.5 rounded bg-background px-1 py-0.5 text-[10px] text-ink-muted">{formatHariRange(n)}</span>
                      <span className="font-medium text-ink-secondary">{n.label}:</span> <span className="text-ink-primary">{n.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {unfilled.length > 0 && (
              <div>
                <h2 className="mb-1.5 text-xs font-semibold text-ink-primary">Kendala Belum Diisi Fasilitator</h2>
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3">
                  {unfilled.map((n, i) => (
                    <li key={i} className="rounded-md border border-border bg-surface px-2 py-1.5 text-[11px] text-ink-muted shadow-sm">
                      <span className="mr-1.5 rounded bg-background px-1 py-0.5">{formatHariRange(n)}</span>
                      {n.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

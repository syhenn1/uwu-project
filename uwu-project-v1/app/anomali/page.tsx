import Link from "next/link";
import { getFacilRows, getTodayHari } from "@/lib/sheet";
import { scanAllAnomalies } from "@/lib/anomalies";
import { getFacilitators } from "@/lib/metrics";
import { StatTile } from "@/components/StatTile";
import { AnomalyList } from "@/components/AnomalyList";

export default async function AnomaliPage() {
  const rows = await getFacilRows();
  const todayHari = await getTodayHari();
  const reports = scanAllAnomalies(rows, todayHari);
  const totalFacilitators = getFacilitators(rows).length;

  const byType = new Map<string, number>();
  for (const r of reports) for (const item of r.items) byType.set(item.type, (byType.get(item.type) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Deteksi Anomali</h1>
        <p className="text-sm text-ink-secondary">
          Dipindai per Hari ke-{todayHari} (hari ini). Membandingkan status login LK, konsistensi Hasil LK vs
          Aplikasi, catatan Kendala yang kontradiktif, dan data yang mendahului hari ini.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Fasilitator dengan Anomali"
          value={`${reports.length}/${totalFacilitators}`}
          tone={reports.length > 0 ? "warning" : "default"}
        />
        <StatTile label="Belum Login LK" value={String(byType.get("never_logged_in") ?? 0)} />
        <StatTile label="LK vs Aplikasi Tidak Konsisten" value={String(byType.get("lk_aplikasi_mismatch") ?? 0)} />
        <StatTile label="Data Melewati Hari Ini" value={String(byType.get("future_data") ?? 0)} tone={byType.get("future_data") ? "critical" : "default"} />
      </div>

      {(byType.get("lk_aplikasi_mismatch") ?? 0) >= totalFacilitators * 0.8 && (
        <div className="rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-[#8a5a00] dark:text-status-warning">
          Hampir semua fasilitator kena &ldquo;LK vs Aplikasi tidak konsisten&rdquo; untuk indikator Perencana - ini
          kemungkinan besar bukan masalah per-fasilitator, tapi kolom &ldquo;% Sekolah Tidak Memiliki Perencana
          (Aplikasi)&rdquo; yang belum benar-benar terisi di seluruh program (nilainya 100% di semua baris).
        </div>
      )}

      {reports.length === 0 ? (
        <p className="text-sm text-ink-muted">Tidak ada anomali terdeteksi.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((r) => (
            <div key={r.kodeFasil} className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Link href={`/fasilitator/${r.kodeFasil}?hari=${todayHari}`} className="font-medium text-series-1 hover:underline">
                  {r.namaFasil}
                </Link>
                <span className="text-xs text-ink-muted">{r.kodeFasil}</span>
              </div>
              <AnomalyList items={r.items} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import type { FacilRow } from "@/lib/types";
import { averagePct, metricFor, type DocKategori, type DocStage } from "@/lib/documentProgress";
import { classifySeverity } from "@/lib/severity";
import { TIER_STYLES } from "./SeverityBadge";

const STAGES: DocStage[] = ["Terunggah", "Terverifikasi", "Sesuai"];

interface StageBoxData {
  stage: DocStage;
  value: number | null;
  caption: string;
}

function StageBox({ stage, value, caption }: StageBoxData) {
  const s = value == null ? null : TIER_STYLES[classifySeverity(value, "higherIsBetter").tier];
  return (
    <div className={`flex-1 rounded-lg border border-border p-3 ${s?.bg ?? "bg-background"}`}>
      <div className="text-xs text-ink-secondary">{stage}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${s?.text ?? "text-ink-muted"}`}>{value == null ? "-" : `${value}%`}</div>
      <div className="mt-0.5 text-[11px] text-ink-muted">{caption}</div>
    </div>
  );
}

function StageRow({ kategori, boxes }: { kategori: DocKategori; boxes: StageBoxData[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink-primary">Dokumen {kategori}</h3>
      <div className="flex items-stretch gap-2">
        {boxes.map((b, i) => (
          <div key={b.stage} className="flex items-stretch gap-2">
            <StageBox {...b} />
            {i < boxes.length - 1 && <span className="self-center text-ink-muted">→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ringkasan pipeline dokumen (Terunggah -> Terverifikasi -> Sesuai) untuk satu
 * kategori (Admin/Teknis) - rata-rata LINTAS FASILITATOR, supaya penurunan
 * antar tahap kelihatan sekilas tanpa scroll ke tabel detail. Dipakai di
 * halaman /progres-dokumen. Untuk satu fasilitator saja, lihat
 * FacilDocumentFunnel di bawah. */
export function DocumentProgressFunnel({ rows, kategori }: { rows: FacilRow[]; kategori: DocKategori }) {
  const boxes: StageBoxData[] = STAGES.map((stage) => {
    const metric = metricFor(kategori, stage);
    const { avg, n } = averagePct(rows, metric.kolom);
    return { stage, value: avg, caption: `rata-rata dari ${n} sekolah/fasilitator` };
  });
  return <StageRow kategori={kategori} boxes={boxes} />;
}

/** Sama seperti DocumentProgressFunnel, tapi untuk SATU fasilitator (nilai
 * mentah dari baris data terkininya, bukan rata-rata lintas fasilitator) -
 * dipakai di halaman detail /fasilitator/[kode]. */
export function FacilDocumentFunnel({ row, kategori }: { row: FacilRow; kategori: DocKategori }) {
  const boxes: StageBoxData[] = STAGES.map((stage) => {
    const metric = metricFor(kategori, stage);
    const raw = row[metric.kolom];
    return { stage, value: typeof raw === "number" ? raw : null, caption: "Aplikasi Revit" };
  });
  return <StageRow kategori={kategori} boxes={boxes} />;
}

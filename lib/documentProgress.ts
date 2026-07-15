import { CHECKPOINT_GROUPS } from "./knowledge/checkpoints";
import { KEY_TO_HEADER } from "./columns";
import type { FacilRow } from "./types";

export type DocKategori = "Admin" | "Teknis";
export type DocStage = "Terunggah" | "Terverifikasi" | "Sesuai";

export interface DocumentStageMetric {
  kategori: DocKategori;
  stage: DocStage;
  kolom: keyof FacilRow;
  label: string;
  groupNo: number;
}

const STAGE_BY_GROUP_NO: Record<number, { kategori: DocKategori; stage: DocStage }> = {
  8: { kategori: "Admin", stage: "Terunggah" },
  9: { kategori: "Admin", stage: "Terverifikasi" },
  10: { kategori: "Admin", stage: "Sesuai" },
  11: { kategori: "Teknis", stage: "Terunggah" },
  12: { kategori: "Teknis", stage: "Terverifikasi" },
  13: { kategori: "Teknis", stage: "Sesuai" },
};

/** Progres pipeline dokumen (Terunggah -> Terverifikasi -> Sesuai) untuk Admin
 * & Teknis, diturunkan langsung dari checkpoint No.8-13 di knowledge base -
 * supaya kolom & urutannya selalu konsisten dengan lib/knowledge/checkpoints.ts
 * (checkpoint-checkpoint itu masing-masing sekarang cuma punya satu indikator
 * "% Sekolah ..." setelah Min/Rata-rata/<90% dihapus), bukan didaftar ulang manual di sini. */
export const DOCUMENT_STAGE_METRICS: DocumentStageMetric[] = CHECKPOINT_GROUPS.filter((g) => g.no in STAGE_BY_GROUP_NO).map((g) => {
  const { kategori, stage } = STAGE_BY_GROUP_NO[g.no];
  const kolom = g.indicators[0].kolom;
  return { kategori, stage, kolom, label: KEY_TO_HEADER[kolom] ?? String(kolom), groupNo: g.no };
});

export function metricFor(kategori: DocKategori, stage: DocStage): DocumentStageMetric {
  const m = DOCUMENT_STAGE_METRICS.find((x) => x.kategori === kategori && x.stage === stage);
  if (!m) throw new Error(`Tidak ada metrik untuk ${kategori} ${stage}`);
  return m;
}

export function averagePct(rows: FacilRow[], kolom: keyof FacilRow): { avg: number | null; n: number } {
  const values = rows.map((r) => r[kolom]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return { avg: null, n: 0 };
  return { avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10, n: values.length };
}

/** Funnel dokumen (Terunggah -> Terverifikasi -> Sesuai) seharusnya menurun
 * atau tetap, TIDAK PERNAH naik - "sesuai" mensyaratkan sudah "terverifikasi"
 * duluan, dan "terverifikasi" mensyaratkan sudah "terunggah lengkap" duluan.
 * Kalau kebalik (mis. Dok Teknis Terverifikasi 45% padahal Dok Teknis
 * Terunggah Lengkap cuma 10%), itu tanda sheet salah hitung/rumus untuk baris
 * ini - BUKAN kondisi nyata di lapangan, jadi tidak boleh dilaporkan sebagai
 * angka pasti ke admin (lihat lib/prompts.ts - ditandai di sini supaya prompt
 * LLM bisa menggantinya dengan "..." alih-alih angka mentah yang tidak masuk akal). */
export function documentFunnelAnomalies(row: FacilRow): Map<keyof FacilRow, string> {
  const result = new Map<keyof FacilRow, string>();
  for (const kategori of ["Admin", "Teknis"] as const) {
    const terunggahM = metricFor(kategori, "Terunggah");
    const terverifikasiM = metricFor(kategori, "Terverifikasi");
    const sesuaiM = metricFor(kategori, "Sesuai");
    const terunggah = row[terunggahM.kolom];
    const terverifikasi = row[terverifikasiM.kolom];
    const sesuai = row[sesuaiM.kolom];
    if (typeof terunggah === "number" && typeof terverifikasi === "number" && terverifikasi > terunggah + 0.01) {
      result.set(
        terverifikasiM.kolom,
        `${terverifikasiM.label} (${terverifikasi}%) lebih tinggi dari ${terunggahM.label} (${terunggah}%) - tidak logis, tidak mungkin terverifikasi lebih banyak dari yang sudah lengkap terunggah.`
      );
    }
    if (typeof terverifikasi === "number" && typeof sesuai === "number" && sesuai > terverifikasi + 0.01) {
      result.set(
        sesuaiM.kolom,
        `${sesuaiM.label} (${sesuai}%) lebih tinggi dari ${terverifikasiM.label} (${terverifikasi}%) - tidak logis, tidak mungkin "sesuai" tanpa lebih dulu terverifikasi.`
      );
    }
  }
  return result;
}

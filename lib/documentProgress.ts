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

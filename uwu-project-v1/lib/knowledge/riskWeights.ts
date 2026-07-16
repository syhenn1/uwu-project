import { CHECKPOINT_GROUPS } from "./checkpoints";
import type { CheckpointIndicator } from "./checkpoints";
import type { FacilRow } from "../types";

export interface RiskIndicator {
  kolom: keyof FacilRow;
  bobot: number;
  polarity?: "higherIsWorse" | "higherIsBetter";
}

/**
 * Bobot checkpoint No.8-13 KHUSUS untuk menghitung "Nilai Risiko" - beda dari
 * CHECKPOINT_GROUPS (yang indikatornya sudah disederhanakan jadi 1 kolom "%
 * Sekolah ... Lengkap/Terverifikasi/Sesuai" untuk keperluan status/tampilan
 * checkpoint, atas permintaan admin program).
 *
 * Nilai Risiko tetap harus cocok dengan kalkulasi resmi yang dipakai atasan
 * program - dicek lewat perbandingan avg/min/max Nilai Risiko across
 * fasilitator, dan ternyata mereka masih memakai bobot ASLI (Min bobot 4,
 * higherIsBetter + "% Sekolah < 90%" bobot 5) - bukan bobot yang sudah
 * disederhanakan. Jadi dua tujuan ini SENGAJA dipisah:
 * - Status checkpoint (Sesuai/Belum Sesuai) & panel UI -> CHECKPOINT_GROUPS (simpel).
 * - Nilai Risiko (skor 0-100%) -> RISK_INDICATOR_OVERRIDE_8_13 di bawah (bobot asli).
 */
const RISK_INDICATOR_OVERRIDE_8_13: Record<number, CheckpointIndicator[]> = {
  8: [
    { kolom: "minDokAdminTerunggah", definisi: "Export Detail Dokumen di Menu Export - nilai minimum antar sekolah.", sumberData: "Aplikasi Revit", bobot: 4, polarity: "higherIsBetter" },
    { kolom: "pctDokAdminTerunggahDibawah90", definisi: "Export Detail Dokumen di Menu Export - % sekolah dengan dokumen admin terunggah < 90%.", sumberData: "Aplikasi Revit", bobot: 5 },
  ],
  9: [
    { kolom: "minDokAdminTerverifikasi", definisi: "Export Detail Dokumen di Menu Export - nilai minimum antar sekolah.", sumberData: "Aplikasi Revit", bobot: 4, polarity: "higherIsBetter" },
    { kolom: "pctDokAdminTerverifikasiDibawah90", definisi: "Export Detail Dokumen di Menu Export - % sekolah dengan dokumen admin terverifikasi < 90%.", sumberData: "Aplikasi Revit", bobot: 5 },
  ],
  10: [
    { kolom: "minDokAdminSesuai", definisi: "Export Detail Dokumen di Menu Export - nilai minimum antar sekolah.", sumberData: "Aplikasi Revit", bobot: 4, polarity: "higherIsBetter" },
    { kolom: "pctDokAdminSesuaiDibawah90", definisi: "Export Detail Dokumen di Menu Export - % sekolah dengan dokumen admin sesuai < 90%.", sumberData: "Aplikasi Revit", bobot: 5 },
  ],
  11: [
    { kolom: "minDokTeknisTerunggah", definisi: "Export Detail Dokumen di Menu Export - nilai minimum antar sekolah.", sumberData: "Aplikasi Revit", bobot: 4, polarity: "higherIsBetter" },
    { kolom: "pctDokTeknisTerunggahDibawah90", definisi: "Export Detail Dokumen di Menu Export - % sekolah dengan dokumen teknis terunggah < 90%.", sumberData: "Aplikasi Revit", bobot: 5 },
  ],
  12: [
    { kolom: "minDokTeknisTerverifikasi", definisi: "Export Detail Dokumen di Menu Export - nilai minimum antar sekolah.", sumberData: "Aplikasi Revit", bobot: 4, polarity: "higherIsBetter" },
    { kolom: "pctDokTeknisTerverifikasiDibawah90", definisi: "Export Detail Dokumen di Menu Export - % sekolah dengan dokumen teknis terverifikasi < 90%.", sumberData: "Aplikasi Revit", bobot: 5 },
  ],
  13: [
    { kolom: "minDokTeknisSesuai", definisi: "Export Detail Dokumen di Menu Export - nilai minimum antar sekolah.", sumberData: "Aplikasi Revit", bobot: 4, polarity: "higherIsBetter" },
    { kolom: "pctDokTeknisSesuaiDibawah90", definisi: "Export Detail Dokumen di Menu Export - % sekolah dengan dokumen teknis sesuai < 90%.", sumberData: "Aplikasi Revit", bobot: 5 },
  ],
};

/** Indikator penggerak Nilai Risiko yang aktif per Hari ke-N - checkpoint
 * 1-7 & 14 diambil apa adanya dari CHECKPOINT_GROUPS (tidak pernah diubah),
 * checkpoint 8-13 memakai RISK_INDICATOR_OVERRIDE_8_13 (bobot asli Min+<90%)
 * alih-alih indikator "% Sekolah ... Lengkap" yang dipakai status checkpoint. */
export function activeRiskIndicators(hari: number): RiskIndicator[] {
  const result: RiskIndicator[] = [];
  for (const group of CHECKPOINT_GROUPS) {
    if (group.activeFromDay > hari) continue;
    const indicators = RISK_INDICATOR_OVERRIDE_8_13[group.no] ?? group.indicators;
    for (const ind of indicators) {
      result.push({ kolom: ind.kolom, bobot: ind.bobot, polarity: ind.polarity });
    }
  }
  return result;
}

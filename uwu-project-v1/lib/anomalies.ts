import { KEY_TO_HEADER } from "./columns";
import { QUALITATIVE_FIELDS } from "./notes";
import { groupRowsByFacilitator, getCurrentRow } from "./metrics";
import type { FacilRow } from "./types";

export type AnomalyType = "future_data" | "never_logged_in" | "lk_aplikasi_mismatch" | "contradicted_zero";

export interface AnomalyItem {
  type: AnomalyType;
  severity: "tinggi" | "sedang";
  detail: string;
  /** Kolom FacilRow yang jadi sumber anomali ini (kalau anomalinya terikat ke
   * satu kolom spesifik, mis. "future_data" pada kendalaKomunikasi) - dipakai
   * UI (mis. FacilitatorAnalysisWorkbench, MilestoneTimeline) untuk menandai
   * tampilan kolom terkait jadi merah/"ada kendala" tanpa perlu parsing ulang
   * teks `detail`. undefined untuk anomali yang tidak terikat satu kolom
   * (mis. never_logged_in). */
  field?: keyof FacilRow;
}

export interface FacilitatorAnomalyReport {
  kodeFasil: string;
  namaFasil: string;
  items: AnomalyItem[];
}

const BELUM_DIISI_PATTERN = /belum\s*(di\s*)?isi|belum\s+mengisi|belum\s+ada\s+data|kosong/i;

/** Pasangan kolom "Hasil LK" vs "Aplikasi" yang seharusnya menceritakan hal
 * yang sama - kalau bertolak belakang jauh, salah satunya patut dicurigai.
 * Diekspor supaya dipakai ulang oleh tabel perbandingan di dashboard. */
export const LK_APLIKASI_PAIRS: Array<{ lk: keyof FacilRow; aplikasi: keyof FacilRow; label: string }> = [
  { lk: "pctTidakPunyaPerencanaLK", aplikasi: "pctTidakPunyaPerencanaAplikasi", label: "Perencana" },
];

/** Ambang selisih (poin persentase) sebelum sepasang kolom Hasil LK/Aplikasi
 * dianggap "tidak konsisten". */
export const MISMATCH_THRESHOLD = 40;

/** Kolom "% masalah" ber-sumber LK Fasil yang punya kolom Kendala terkait -
 * dipakai untuk mendeteksi 0% yang dikontradiksi catatan "belum diisi".
 * "kendalaPanlakFormatTemplate" menaungi DUA kolom sekaligus (Panlak &
 * Format/Template) - satu catatan gabungan bisa bilang mis. "Panlak belum
 * diisi, Format/Template dokumen belum diisi". `subitemKeyword` dipakai untuk
 * mencocokkan per-klausa supaya "Format/Template belum diisi" saja tidak ikut
 * menuduh Panlak-nya kontradiksi juga (dan sebaliknya) - lihat matchesKendala. */
const ZERO_CHECKS: Array<{ kolom: keyof FacilRow; kendala: keyof FacilRow; subitemKeyword?: RegExp }> = [
  { kolom: "pctTidakPunyaPanlak", kendala: "kendalaPanlakFormatTemplate", subitemKeyword: /panlak/i },
  { kolom: "pctTidakPunyaFormatTemplate", kendala: "kendalaPanlakFormatTemplate", subitemKeyword: /format\s*\/?\s*template/i },
  { kolom: "pctTidakPunyaPerencanaLK", kendala: "kendalaMendapatkanPerencana" },
  { kolom: "pctDapodikTidakSesuaiBelumUpdate", kendala: "kendalaUpdateDapodik" },
];

function matchesKendala(kendalaVal: string, subitemKeyword?: RegExp): boolean {
  if (!subitemKeyword) return BELUM_DIISI_PATTERN.test(kendalaVal);
  return kendalaVal.split(/[,;.]/).some((clause) => subitemKeyword.test(clause) && BELUM_DIISI_PATTERN.test(clause));
}

function label(kolom: keyof FacilRow): string {
  return KEY_TO_HEADER[kolom] ?? String(kolom);
}

/**
 * Mendeteksi anomali untuk satu fasilitator (history = seluruh baris hari
 * yang tersedia, sudah terurut naik). Semua pengecekan "kondisi terkini"
 * dievaluasi dari getCurrentRow(history, todayHari) - hari terakhir yang
 * SUDAH TERJADI - bukan baris terakhir di array (yang bisa jadi placeholder
 * untuk hari yang belum tiba). Ini penting: kalau fasilitator belum login di
 * Hari 2 tapi mulai login di Hari 4, kesimpulan "belum login" tidak boleh
 * terus dipakai untuk Hari 4 dan seterusnya - begitu ada baris yang
 * menunjukkan perubahan, itulah yang dipakai.
 *
 * Empat jenis anomali:
 * 1. future_data - kolom kualitatif sudah berisi konten asli untuk hari yang
 *    belum terjadi (lebih besar dari todayHari).
 * 2. never_logged_in - fasilitator belum pernah login/isi LK sama sekali,
 *    per kondisi TERKINI (bukan cuma di hari-hari awal).
 * 3. lk_aplikasi_mismatch - kolom yang punya versi "Hasil LK" dan "Aplikasi"
 *    saling bertolak belakang jauh (>=40 poin persentase).
 * 4. contradicted_zero - kolom "% masalah" ber-sumber LK Fasil terbaca 0%,
 *    tapi catatan Kendala terkait bilang itu belum diisi.
 */
export function detectFacilitatorAnomalies(history: FacilRow[], todayHari: number): AnomalyItem[] {
  const items: AnomalyItem[] = [];
  const latest = getCurrentRow(history, todayHari);
  if (!latest) return items;

  for (const row of history) {
    if (row.hari <= todayHari) continue;
    for (const field of QUALITATIVE_FIELDS) {
      const v = row[field.key];
      if (typeof v === "string" && v.trim() !== "" && v !== "Belum Diisi") {
        items.push({
          type: "future_data",
          severity: "tinggi",
          detail: `Hari ${row.hari} (belum terjadi, hari ini Hari ${todayHari}) sudah berisi "${field.label}": "${v}"`,
          field: field.key,
        });
      }
    }
  }

  if (latest.fasilBelumLoginLK === "Belum") {
    items.push({ type: "never_logged_in", severity: "tinggi", detail: `Belum login/mengisi LK sama sekali per Hari ${latest.hari}.` });
  }

  for (const pair of LK_APLIKASI_PAIRS) {
    const lkVal = latest[pair.lk];
    const appVal = latest[pair.aplikasi];
    if (typeof lkVal === "number" && typeof appVal === "number" && Math.abs(appVal - lkVal) >= MISMATCH_THRESHOLD) {
      items.push({
        type: "lk_aplikasi_mismatch",
        severity: "sedang",
        detail: `${pair.label}: Hasil LK=${lkVal}% vs Aplikasi=${appVal}% (selisih ${Math.abs(appVal - lkVal)} poin).`,
      });
    }
  }

  if (latest.fasilBelumLoginLK !== "Belum") {
    for (const check of ZERO_CHECKS) {
      const val = latest[check.kolom];
      const kendala = latest[check.kendala];
      if (val === 0 && typeof kendala === "string" && matchesKendala(kendala, check.subitemKeyword)) {
        items.push({
          type: "contradicted_zero",
          severity: "sedang",
          detail: `"${label(check.kolom)}" terbaca 0% tapi catatan "${label(check.kendala)}" bilang: "${kendala}".`,
        });
      }
    }
  }

  return items;
}

/** Kolom-kolom yang punya anomali "future_data" AKTIF (data untuk hari yang
 * belum terjadi) - dipakai UI untuk menandai tampilan kolom terkait (mis.
 * kotak Kendala Komunikasi, baris timeline checkpoint 1) jadi merah/"ada
 * kendala" tanpa perlu parsing ulang teks `detail`. */
export function fieldsWithFutureDataAnomaly(items: AnomalyItem[]): Set<keyof FacilRow> {
  const fields = new Set<keyof FacilRow>();
  for (const item of items) {
    if (item.type === "future_data" && item.field) fields.add(item.field);
  }
  return fields;
}

/** Menjalankan deteksi anomali untuk seluruh fasilitator di `rows` (output
 * getFacilRows()), diurutkan dari yang paling banyak anomalinya. */
export function scanAllAnomalies(rows: FacilRow[], todayHari: number): FacilitatorAnomalyReport[] {
  const byFasil = groupRowsByFacilitator(rows);

  const reports: FacilitatorAnomalyReport[] = [];
  for (const [kodeFasil, history] of byFasil) {
    const sorted = [...history].sort((a, b) => a.hari - b.hari);
    const items = detectFacilitatorAnomalies(sorted, todayHari);
    if (items.length > 0) {
      const latest = getCurrentRow(sorted, todayHari);
      reports.push({ kodeFasil, namaFasil: latest?.namaFasil ?? sorted[sorted.length - 1].namaFasil, items });
    }
  }
  return reports.sort((a, b) => b.items.length - a.items.length);
}

export interface LkAplikasiRow {
  kodeFasil: string;
  namaFasil: string;
  label: string;
  lk: number | null;
  aplikasi: number | null;
  selisih: number | null;
  konsisten: boolean;
}

/** Membandingkan tiap pasangan kolom Hasil LK vs Aplikasi (LK_APLIKASI_PAIRS)
 * untuk kondisi TERKINI setiap fasilitator (hari terakhir yang sudah
 * terjadi, lihat getCurrentRow). Dipakai untuk tabel perbandingan di
 * dashboard. */
export function compareLkAplikasi(rows: FacilRow[], todayHari: number): LkAplikasiRow[] {
  const byFasil = groupRowsByFacilitator(rows);
  const result: LkAplikasiRow[] = [];
  for (const history of byFasil.values()) {
    const row = getCurrentRow(history, todayHari);
    if (!row) continue;
    for (const pair of LK_APLIKASI_PAIRS) {
      const lkVal = row[pair.lk];
      const appVal = row[pair.aplikasi];
      const lk = typeof lkVal === "number" ? lkVal : null;
      const aplikasi = typeof appVal === "number" ? appVal : null;
      const selisih = lk != null && aplikasi != null ? Math.abs(aplikasi - lk) : null;
      result.push({
        kodeFasil: row.kodeFasil,
        namaFasil: row.namaFasil,
        label: pair.label,
        lk,
        aplikasi,
        selisih,
        konsisten: selisih != null ? selisih < MISMATCH_THRESHOLD : true,
      });
    }
  }
  return result.sort((a, b) => (b.selisih ?? -1) - (a.selisih ?? -1));
}

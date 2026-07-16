import type { FacilRow, FacilitatorSummary } from "./types";
import { activeRiskIndicators } from "./knowledge/riskWeights";

export type RiskLevel = "rendah" | "sedang" | "tinggi" | "unknown";

/** Nilai Risiko adalah skor terbobot 0-100% (total bobot seluruh checkpoint = 100). */
export function riskLevel(nilaiRisiko: number | null): RiskLevel {
  if (typeof nilaiRisiko !== "number") return "unknown";
  if (nilaiRisiko <= 5) return "rendah";
  if (nilaiRisiko <= 15) return "sedang";
  return "tinggi";
}

function indicatorRiskContribution(
  row: FacilRow,
  kolom: keyof FacilRow,
  polarity: "higherIsWorse" | "higherIsBetter" = "higherIsWorse"
): number | null {
  const raw = row[kolom];
  if (kolom === "fasilBelumLoginLK") {
    if (raw === "Belum") return 100;
    if (raw === "Sudah") return 0;
    return null;
  }
  if (typeof raw !== "number") return null;
  return polarity === "higherIsBetter" ? 100 - raw : raw;
}

/**
 * Estimasi Nilai Risiko (0-100%) dari bobot indikator risiko yang SUDAH BISA
 * DINILAI pada hari tsb (lihat lib/knowledge/riskWeights.ts - SENGAJA beda
 * dari indikator yang menggerakkan status checkpoint di panel UI, supaya
 * angkanya tetap cocok dengan kalkulasi resmi atasan program), dipakai
 * sebagai fallback kalau kolom "Nilai Risiko" di spreadsheet kosong (formula
 * belum terpasang di sheet). Bukan angka resmi dari sheet - selalu tandai
 * sebagai estimasi di UI (lihat getEffectiveRisk).
 *
 * Dinormalisasi terhadap total bobot indikator yang datanya tersedia
 * (bukan total bobot semua checkpoint yang aktif, apalagi total bobot 100
 * keseluruhan siklus) - supaya hasilnya konsisten 0-100% di hari manapun,
 * bukan "0-77% doang" di Hari 7 misalnya (checkpoint yang belum jatuh tempo
 * di hari itu memang belum bisa dinilai, jadi wajar tidak ikut jadi penyebut).
 * Indikator yang datanya belum ada (bukan checkpoint-nya belum aktif, tapi
 * selnya memang kosong) juga tidak ikut jadi penyebut - sengaja tidak
 * dianggap "aman"/0% cuma karena belum diisi (lihat catatan di lib/compliance.ts
 * soal 0% palsu vs "belum ada data").
 */
export function computeEstimatedRisk(row: FacilRow): number | null {
  let weightedSum = 0;
  let bobotTerukur = 0;
  for (const ind of activeRiskIndicators(row.hari)) {
    if (ind.bobot <= 0) continue;
    const contribution = indicatorRiskContribution(row, ind.kolom, ind.polarity);
    if (contribution == null) continue;
    weightedSum += ind.bobot * (contribution / 100);
    bobotTerukur += ind.bobot;
  }
  return bobotTerukur > 0 ? (weightedSum / bobotTerukur) * 100 : null;
}

export interface EffectiveRisk {
  value: number | null;
  /** true kalau nilai berasal dari estimasi aplikasi, bukan kolom "Nilai Risiko" di sheet. */
  estimated: boolean;
}

export function getEffectiveRisk(row: FacilRow): EffectiveRisk {
  if (typeof row.nilaiRisiko === "number") return { value: row.nilaiRisiko, estimated: false };
  const estimated = computeEstimatedRisk(row);
  return { value: estimated, estimated: estimated != null };
}

export function getAvailableDays(rows: FacilRow[]): number[] {
  return Array.from(new Set(rows.map((r) => r.hari))).sort((a, b) => a - b);
}

export function getRowsForDay(rows: FacilRow[], hari: number): FacilRow[] {
  return rows.filter((r) => r.hari === hari);
}

export function getRowsForFacilitator(rows: FacilRow[], kodeFasil: string): FacilRow[] {
  return rows.filter((r) => r.kodeFasil === kodeFasil).sort((a, b) => a.hari - b.hari);
}

export function groupRowsByFacilitator(rows: FacilRow[]): Map<string, FacilRow[]> {
  const map = new Map<string, FacilRow[]>();
  for (const r of rows) {
    if (!map.has(r.kodeFasil)) map.set(r.kodeFasil, []);
    map.get(r.kodeFasil)!.push(r);
  }
  return map;
}

/**
 * Baris yang mewakili kondisi "sekarang" untuk satu fasilitator: hari
 * TERAKHIR YANG SUDAH TERJADI (hari <= todayHari), bukan sekadar baris
 * terakhir di array. Sheet punya baris placeholder untuk semua 14 hari
 * sekaligus (termasuk hari yang belum tiba) - kalau dipilih tanpa
 * mempertimbangkan todayHari, kesimpulan dari hari awal (mis. "belum login")
 * bisa "terkunci" seolah masih berlaku di hari-hari setelahnya, padahal
 * begitu ada baris yang menunjukkan perubahan (mis. mulai login di Hari 4),
 * itulah yang seharusnya dipakai untuk Hari 4 dan seterusnya.
 */
export function getCurrentRow(history: FacilRow[], todayHari: number): FacilRow | undefined {
  if (history.length === 0) return undefined;
  const happened = history.filter((r) => r.hari <= todayHari);
  const pool = happened.length > 0 ? happened : history;
  return pool.reduce((latest, r) => (r.hari > latest.hari ? r : latest), pool[0]);
}

export function getFacilitators(rows: FacilRow[]): FacilitatorSummary[] {
  const map = new Map<string, FacilitatorSummary>();
  for (const r of rows) {
    if (!map.has(r.kodeFasil)) {
      map.set(r.kodeFasil, {
        kodeFasil: r.kodeFasil,
        namaFasil: r.namaFasil,
        kodeKoor: r.kodeKoor,
        namaKoor: r.namaKoor,
        atmin: r.atmin,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.namaFasil.localeCompare(b.namaFasil));
}

/** "PNJ-Fasil-45" -> "PNJ". Kode fasil dipakai sebagai proksi kampus/institusi
 * karena tidak ada kolom "Kampus" terpisah di sheet. */
export function deriveKampus(kodeFasil: string): string {
  const match = kodeFasil.match(/^([A-Za-z]+)-/);
  return match ? match[1] : kodeFasil;
}

export function sortByRiskDesc(rows: FacilRow[]): FacilRow[] {
  return [...rows].sort((a, b) => {
    const av = getEffectiveRisk(a).value ?? -1;
    const bv = getEffectiveRisk(b).value ?? -1;
    return bv - av;
  });
}

export interface DaySummary {
  hari: number;
  totalFasilitator: number;
  belumLogin: number;
  avgRisiko: number | null;
  maxRisiko: number | null;
  tinggiCount: number;
}

export function summarizeDay(rowsForDay: FacilRow[]): DaySummary {
  const risikoValues = rowsForDay
    .map((r) => getEffectiveRisk(r).value)
    .filter((v): v is number => typeof v === "number");
  return {
    hari: rowsForDay[0]?.hari ?? 0,
    totalFasilitator: rowsForDay.length,
    belumLogin: rowsForDay.filter((r) => r.fasilBelumLoginLK === "Belum").length,
    avgRisiko: risikoValues.length ? risikoValues.reduce((a, b) => a + b, 0) / risikoValues.length : null,
    maxRisiko: risikoValues.length ? Math.max(...risikoValues) : null,
    tinggiCount: rowsForDay.filter((r) => riskLevel(getEffectiveRisk(r).value) === "tinggi").length,
  };
}

/** Mendeteksi pola "data tidak berubah sama sekali" antar hari berturut-turut
 * untuk kolom numerik utama - salah satu indikasi anomali yang disebutkan
 * pemilik program (mis. fasilitator berhenti mengisi LK tapi angka tetap sama). */
export function hasStagnantMetrics(history: FacilRow[], minConsecutiveDays = 4): boolean {
  if (history.length < minConsecutiveDays) return false;
  const key = (r: FacilRow) => JSON.stringify([r.pctDokAdminTerunggahLengkap, r.pctDokTeknisTerunggahLengkap, r.fasilBelumLoginLK]);
  let streak = 1;
  for (let i = 1; i < history.length; i++) {
    if (key(history[i]) === key(history[i - 1])) {
      streak++;
      if (streak >= minConsecutiveDays) return true;
    } else {
      streak = 1;
    }
  }
  return false;
}

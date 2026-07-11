import type { FacilRow, FacilitatorSummary } from "./types";

export type RiskLevel = "rendah" | "sedang" | "tinggi" | "unknown";

/** Nilai Risiko adalah skor terbobot 0-100% (total bobot seluruh checkpoint = 100). */
export function riskLevel(nilaiRisiko: FacilRow["nilaiRisiko"]): RiskLevel {
  if (typeof nilaiRisiko !== "number") return "unknown";
  if (nilaiRisiko <= 5) return "rendah";
  if (nilaiRisiko <= 15) return "sedang";
  return "tinggi";
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

export function sortByRiskDesc(rows: FacilRow[]): FacilRow[] {
  return [...rows].sort((a, b) => {
    const av = typeof a.nilaiRisiko === "number" ? a.nilaiRisiko : -1;
    const bv = typeof b.nilaiRisiko === "number" ? b.nilaiRisiko : -1;
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
    .map((r) => r.nilaiRisiko)
    .filter((v): v is number => typeof v === "number");
  return {
    hari: rowsForDay[0]?.hari ?? 0,
    totalFasilitator: rowsForDay.length,
    belumLogin: rowsForDay.filter((r) => r.fasilBelumLoginLK === "Belum").length,
    avgRisiko: risikoValues.length ? risikoValues.reduce((a, b) => a + b, 0) / risikoValues.length : null,
    maxRisiko: risikoValues.length ? Math.max(...risikoValues) : null,
    tinggiCount: rowsForDay.filter((r) => riskLevel(r.nilaiRisiko) === "tinggi").length,
  };
}

/** Mendeteksi pola "data tidak berubah sama sekali" antar hari berturut-turut
 * untuk kolom numerik utama - salah satu indikasi anomali yang disebutkan
 * pemilik program (mis. fasilitator berhenti mengisi LK tapi angka tetap sama). */
export function hasStagnantMetrics(history: FacilRow[], minConsecutiveDays = 4): boolean {
  if (history.length < minConsecutiveDays) return false;
  const key = (r: FacilRow) => JSON.stringify([r.nilaiRisiko, r.pctDokAdminTerunggahDibawah90, r.pctDokTeknisTerunggahDibawah90]);
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

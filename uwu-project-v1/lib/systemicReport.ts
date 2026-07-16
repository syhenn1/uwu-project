import { CHECKPOINT_GROUPS } from "./knowledge/checkpoints";
import { KEY_TO_HEADER } from "./columns";
import { compareLkAplikasi, MISMATCH_THRESHOLD } from "./anomalies";
import { groupRowsByFacilitator, getCurrentRow } from "./metrics";
import type { FacilRow } from "./types";

export interface UniformColumnIssue {
  kolom: keyof FacilRow;
  label: string;
  sumberData: string | null;
  value: number;
  sampleSize: number;
  totalRows: number;
}

/**
 * Mencari kolom indikator yang nilainya SAMA PERSIS di seluruh baris yang
 * punya data, dan nilai itu adalah kondisi "terburuk" (100% untuk kolom
 * "% masalah", 0% untuk kolom "Min (...)"/completion). Pola ini ditemukan
 * pertama kali secara manual pada "% Sekolah Belum Login Aplikasi" dan
 * "% Sekolah Tidak Memiliki Perencana (Aplikasi)" - kemungkinan besar
 * formula/sumber data itu belum benar-benar terhubung di seluruh program,
 * bukan performa asli tiap fasilitator.
 */
export function detectUniformWorstCaseColumns(rows: FacilRow[]): UniformColumnIssue[] {
  const issues: UniformColumnIssue[] = [];
  const seen = new Set<keyof FacilRow>();

  for (const group of CHECKPOINT_GROUPS) {
    for (const ind of group.indicators) {
      if (seen.has(ind.kolom)) continue;
      seen.add(ind.kolom);

      const values = rows.map((r) => r[ind.kolom]).filter((v): v is number => typeof v === "number");
      if (values.length < rows.length * 0.9) continue;
      const unique = new Set(values);
      if (unique.size !== 1) continue;

      const val = [...unique][0];
      const isWorstCase = ind.polarity === "higherIsBetter" ? val === 0 : val === 100;
      if (!isWorstCase) continue;

      issues.push({
        kolom: ind.kolom,
        label: KEY_TO_HEADER[ind.kolom] ?? String(ind.kolom),
        sumberData: ind.sumberData,
        value: val,
        sampleSize: values.length,
        totalRows: rows.length,
      });
    }
  }
  return issues;
}

export interface SystemicReport {
  generatedHari: number;
  totalFasilitator: number;
  totalBaris: number;
  nilaiRisikoTerisi: number;
  uniformColumns: UniformColumnIssue[];
  lkAplikasiMismatchRate: { pair: string; affected: number; total: number }[];
  neverLoggedInCount: number;
}

export function buildSystemicReport(rows: FacilRow[], todayHari: number, totalFasilitator: number): SystemicReport {
  const nilaiRisikoTerisi = rows.filter((r) => typeof r.nilaiRisiko === "number").length;
  const uniformColumns = detectUniformWorstCaseColumns(rows);

  const lkAplikasi = compareLkAplikasi(rows, todayHari);
  const byLabel = new Map<string, { affected: number; total: number }>();
  for (const r of lkAplikasi) {
    const bucket = byLabel.get(r.label) ?? { affected: 0, total: 0 };
    bucket.total += 1;
    if (!r.konsisten) bucket.affected += 1;
    byLabel.set(r.label, bucket);
  }

  const byFasil = groupRowsByFacilitator(rows);
  const currentRows = [...byFasil.values()].map((history) => getCurrentRow(history, todayHari)).filter((r): r is FacilRow => !!r);
  const neverLoggedInCount = currentRows.filter((r) => r.fasilBelumLoginLK === "Belum").length;

  return {
    generatedHari: todayHari,
    totalFasilitator,
    totalBaris: rows.length,
    nilaiRisikoTerisi,
    uniformColumns,
    lkAplikasiMismatchRate: [...byLabel.entries()].map(([pair, v]) => ({ pair, ...v })),
    neverLoggedInCount,
  };
}

/** Merender laporan jadi teks polos siap tempel ke email/chat. */
export function renderSystemicReportText(report: SystemicReport): string {
  const lines: string[] = [];
  lines.push(`LAPORAN MASALAH DATA SISTEMIK - Sistem Monitoring Fasilitator`);
  lines.push(`Per Hari ke-${report.generatedHari} dari siklus 14 hari · ${report.totalFasilitator} fasilitator, ${report.totalBaris} baris data`);
  lines.push("");
  lines.push(`Ringkasan:`);
  lines.push(`- Kolom "Nilai Risiko" terisi di ${report.nilaiRisikoTerisi}/${report.totalBaris} baris.`);
  lines.push(`- ${report.neverLoggedInCount} fasilitator belum pernah login/mengisi LK sama sekali.`);
  lines.push(`- ${report.uniformColumns.length} kolom terindikasi belum terhubung (nilai seragam kondisi terburuk di semua baris).`);
  lines.push("");

  if (report.nilaiRisikoTerisi === 0) {
    lines.push(`1. KOLOM "NILAI RISIKO" KOSONG TOTAL`);
    lines.push(`   Semua ${report.totalBaris} baris di sheet "Level Fasil" kosong untuk kolom ini. Aplikasi ini`);
    lines.push(`   memakai skor estimasi dari bobot checkpoint sebagai gantinya, tapi idealnya formula aslinya`);
    lines.push(`   dipasang di sheet supaya jadi satu sumber kebenaran.`);
    lines.push("");
  }

  if (report.uniformColumns.length > 0) {
    lines.push(`2. KOLOM DENGAN NILAI SERAGAM (KEMUNGKINAN BELUM TERHUBUNG)`);
    for (const c of report.uniformColumns) {
      lines.push(`   - "${c.label}" (sumber: ${c.sumberData ?? "-"}) = ${c.value}% di semua ${c.sampleSize}/${c.totalRows} baris berdata.`);
    }
    lines.push(`   Rekomendasi: cek apakah formula/integrasi kolom ini ke "Aplikasi Revit" sudah benar-benar jalan,`);
    lines.push(`   karena tidak masuk akal semua fasilitator punya nilai identik persis.`);
    lines.push("");
  }

  if (report.lkAplikasiMismatchRate.length > 0) {
    lines.push(`3. KETIDAKCOCOKAN HASIL LK VS APLIKASI`);
    for (const m of report.lkAplikasiMismatchRate) {
      lines.push(`   - Indikator "${m.pair}": ${m.affected}/${m.total} fasilitator selisih >= ${MISMATCH_THRESHOLD} poin antara versi Hasil LK dan Aplikasi.`);
    }
    lines.push("");
  }

  lines.push(`Detail per fasilitator ada di halaman "Anomali" pada dashboard.`);
  return lines.join("\n");
}

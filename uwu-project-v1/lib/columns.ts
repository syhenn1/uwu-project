import type { FacilRow } from "./types";

/**
 * Maps the exact spreadsheet header text (as exported to CSV) to a FacilRow key.
 * Keep header strings identical to the source sheet - papaparse (header: true)
 * uses these verbatim as object keys.
 */
export const COLUMN_MAP: Array<{ header: string; key: keyof FacilRow }> = [
  { header: "Atmin", key: "atmin" },
  { header: "Hari ke", key: "hariLabel" },
  { header: "Kode Fasil", key: "kodeFasil" },
  { header: "Nama Fasil", key: "namaFasil" },
  { header: "Kode Koor", key: "kodeKoor" },
  { header: "Nama Koor", key: "namaKoor" },
  { header: "Fasil Belum Login LK", key: "fasilBelumLoginLK" },
  { header: "% Sekolah Belum Dihubungi/Terhubung", key: "pctSekolahBelumDihubungi" },
  { header: "% Sekolah Belum Login Aplikasi", key: "pctSekolahBelumLoginAplikasi" },
  { header: "Frekuensi komunikasi", key: "frekuensiKomunikasi" },
  { header: "% Sekolah Tidak Memiliki Panlak", key: "pctTidakPunyaPanlak" },
  { header: "% Sekolah Tidak Memiliki Format/Template", key: "pctTidakPunyaFormatTemplate" },
  { header: "% Sekolah Biodata Belum Terverifikasi Sesuai", key: "pctBiodataBelumTerverifikasi" },
  { header: "% Sekolah Tidak Memiliki Perencana (Hasil LK)", key: "pctTidakPunyaPerencanaLK" },
  { header: "% Sekolah Tidak Memiliki Perencana (Aplikasi)", key: "pctTidakPunyaPerencanaAplikasi" },
  { header: "% Sekolah Dapodik Tidak Sesuai Kebutuhan, tetapi Belum Update", key: "pctDapodikTidakSesuaiBelumUpdate" },
  { header: "% Sekolah Sudah Update Dapodik", key: "pctSudahUpdateDapodik" },
  { header: "% Sekolah Sudah Upload Bukti Update Dapodik", key: "pctSudahUploadBuktiUpdateDapodik" },
  { header: "Penyusunan Dokumen Admin Revisi/Terkendala (Hasil LK)", key: "penyusunanDokAdminTerkendala" },
  { header: "% Sekolah Dok. Admin Terunggah 100% (Lengkap)", key: "pctDokAdminTerunggahLengkap" },
  { header: "Rata-rata % Dok. Admin Terunggah (aplikasi)", key: "rataDokAdminTerunggah" },
  { header: "Min (% Dok. Admin Terunggah)", key: "minDokAdminTerunggah" },
  { header: "% Sekolah dengan % Dok. Admin Terunggah < 90%", key: "pctDokAdminTerunggahDibawah90" },
  { header: "% Sekolah Dok. Admin Terverifikasi", key: "pctDokAdminTerverifikasi" },
  { header: "Rata-rata % Dok. Admin Terverifikasi", key: "rataDokAdminTerverifikasi" },
  { header: "Min (% Dok. Admin Terverifikasi)", key: "minDokAdminTerverifikasi" },
  { header: "% Sekolah dengan % Dok. Admin Terverifikasi < 90%", key: "pctDokAdminTerverifikasiDibawah90" },
  { header: "% Sekolah Dok. Admin Sesuai", key: "pctDokAdminSesuai" },
  { header: "Rata-rata % Dok. Admin Sesuai", key: "rataDokAdminSesuai" },
  { header: "Min (% Dok. Admin Sesuai)", key: "minDokAdminSesuai" },
  { header: "% Sekolah dengan % Dok. Admin Sesuai < 90%", key: "pctDokAdminSesuaiDibawah90" },
  { header: "Penyusunan Dokumen Teknis Revisi/Terkendala (Hasil LK)", key: "penyusunanDokTeknisTerkendala" },
  { header: "% Sekolah Dok. Teknis Terunggah 100% (Lengkap)", key: "pctDokTeknisTerunggahLengkap" },
  { header: "Rata-rata % Dok. Teknis Terunggah", key: "rataDokTeknisTerunggah" },
  { header: "Min (% Dok. Teknis Terunggah)", key: "minDokTeknisTerunggah" },
  { header: "% Sekolah dengan % Dok. Teknis Terunggah < 90%", key: "pctDokTeknisTerunggahDibawah90" },
  { header: "% Sekolah Dok. Teknis Terverifikasi", key: "pctDokTeknisTerverifikasi" },
  { header: "Rata-rata % Dok. Teknis Terverifikasi", key: "rataDokTeknisTerverifikasi" },
  { header: "Min (% Dok. Teknis Terverifikasi)", key: "minDokTeknisTerverifikasi" },
  { header: "% Sekolah dengan % Dok. Teknis Terverifikasi < 90%", key: "pctDokTeknisTerverifikasiDibawah90" },
  { header: "% Sekolah Dok. Teknis Sesuai", key: "pctDokTeknisSesuai" },
  { header: "Rata-rata % Dok. Teknis Sesuai", key: "rataDokTeknisSesuai" },
  { header: "Min (% Dok. Teknis Sesuai)", key: "minDokTeknisSesuai" },
  { header: "% Sekolah dengan % Dok. Teknis Sesuai < 90%", key: "pctDokTeknisSesuaiDibawah90" },
  { header: "% Sekolah Belum Sepakat RAB", key: "pctBelumSepakatRAB" },
  { header: "Nilai Risiko", key: "nilaiRisiko" },
  { header: "Kendala Komunikasi", key: "kendalaKomunikasi" },
  { header: "Kendala Memiliki Panlak/Format/Template Dokumen", key: "kendalaPanlakFormatTemplate" },
  { header: "Kendala Mendapatkan Perencana", key: "kendalaMendapatkanPerencana" },
  { header: "Kendala Verifikasi Biodata oleh Fasilitator", key: "kendalaVerifikasiBiodata" },
  { header: "Kendala Update Dapodik", key: "kendalaUpdateDapodik" },
  { header: "Kendala Penyusunan Dokumen Admin", key: "kendalaPenyusunanDokAdmin" },
  { header: "Kendala Verifikasi Dokumen Admin oleh Fasilitator", key: "kendalaVerifikasiDokAdmin" },
  { header: "Kendala Penyusunan Dokumen Teknis", key: "kendalaPenyusunanDokTeknis" },
  { header: "Kendala Verifikasi Dokumen Teknis oleh Fasilitator", key: "kendalaVerifikasiDokTeknis" },
  { header: "Kendala Penyepakatan RAB", key: "kendalaPenyepakatanRAB" },
  { header: "Analisis", key: "analisis" },
  { header: "Catatan Admin", key: "catatanAdmin" },
];

/** Reverse lookup: FacilRow key -> original spreadsheet header text (for UI labels). */
export const KEY_TO_HEADER: Partial<Record<keyof FacilRow, string>> = Object.fromEntries(
  COLUMN_MAP.map(({ header, key }) => [key, header])
);

const TEXT_KEYS = new Set<keyof FacilRow>([
  "atmin",
  "kodeFasil",
  "namaFasil",
  "kodeKoor",
  "namaKoor",
]);

/** Parses a raw CSV cell into a number (for percent/numeric cells), or leaves it
 * as trimmed text (for enum flags like "Sudah"/"Belum" and free-text notes).
 * "#DIV/0!" and blank cells become null. */
export function parseCell(raw: string | undefined | null): string | number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "#DIV/0!") return null;
  if (/^-?\d+(\.\d+)?%$/.test(trimmed)) return parseFloat(trimmed.slice(0, -1));
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

/** Parses "Hari 7" -> 7. Returns 0 if it can't be parsed. */
export function parseHariNumber(hariLabel: string | null | undefined): number {
  if (!hariLabel) return 0;
  const match = hariLabel.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Converts one papaparse record (header: true) into a typed FacilRow. */
export function toFacilRow(raw: Record<string, string>): FacilRow {
  const row = { raw } as FacilRow;
  for (const { header, key } of COLUMN_MAP) {
    const value = raw[header];
    row[key] = (TEXT_KEYS.has(key) ? (value ?? "").trim() : parseCell(value)) as never;
  }
  row.hari = parseHariNumber(row.hariLabel as unknown as string);
  return row;
}

import Papa from "papaparse";
import type { CellValue, FacilRow } from "@uwu/core/types";
import { SKOR_AKHIR_COLUMNS, applySkorAkhirColumns, parsePercentCell } from "./skorAkhirColumns";

/**
 * Baca langsung dari MASTER SPREADSHEET (CONTROLLER_SHEET_URL) - dua tab:
 * "Fasilitator" (roster: Atmin, Kode Fasil, Nama Fasil, Kendala...) dan
 * "masterLog" (skor per fasilitator per Hari/Log) - GANTI dari arsitektur
 * lama yang scrape 30 spreadsheet LK individual terpisah (lib/controller.ts,
 * lihat lib/sheet.ts versi sebelumnya). Skema DIKONFIRMASI 2026-07-18 lewat
 * fetch langsung terhadap sheet asli (390 fasilitator, 13 admin/Atmin).
 *
 * SENGAJA TIDAK ikut fetch link "LK Log"/"LK Fasilitator" per baris di tab
 * "Fasilitator" - belum diminta (lihat percakapan 2026-07-18). Isi
 * spreadsheet ini (nama, ID, link) adalah data sensitif - jangan pernah
 * hardcode contoh nilai aslinya di project ini, cuma struktur/nama kolom.
 */

function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function gvizCsvUrl(spreadsheetId: string, sheetName: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?${new URLSearchParams({ tqx: "out:csv", sheet: sheetName }).toString()}`;
}

async function fetchCsv(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// --- Tab "Fasilitator" (roster: Atmin, Kode Fasil, Nama Fasil, Kendala...) -

const ROSTER_SHEET_NAME = "Fasilitator";

/** Kolom "Kendala ..." di tab "Fasilitator", URUTAN PERSIS sama dengan field
 * FacilRow terkait (dikonfirmasi 2026-07-18) - dulu field-field ini dibaca
 * dari tab "Isian" tiap spreadsheet LK individual, sekarang langsung dari
 * roster di master spreadsheet. */
const KENDALA_COLUMNS: { header: string; kolom: keyof FacilRow }[] = [
  { header: "Kendala Komunikasi", kolom: "kendalaKomunikasi" },
  { header: "Kendala Memiliki Panlak/Format/Template Dokumen", kolom: "kendalaPanlakFormatTemplate" },
  { header: "Kendala Mendapatkan Perencana", kolom: "kendalaMendapatkanPerencana" },
  { header: "Kendala Verifikasi Biodata oleh Fasilitator", kolom: "kendalaVerifikasiBiodata" },
  { header: "Kendala Update Dapodik", kolom: "kendalaUpdateDapodik" },
  { header: "Kendala Penyusunan Dokumen Admin", kolom: "kendalaPenyusunanDokAdmin" },
  { header: "Kendala Verifikasi Dokumen Admin oleh Fasilitator", kolom: "kendalaVerifikasiDokAdmin" },
  { header: "Kendala Penyusunan Dokumen Teknis", kolom: "kendalaPenyusunanDokTeknis" },
  { header: "Kendala Verifikasi Dokumen Teknis oleh Fasilitator", kolom: "kendalaVerifikasiDokTeknis" },
  { header: "Kendala Penyepakatan RAB", kolom: "kendalaPenyepakatanRAB" },
];

export interface RosterEntry {
  atmin: string;
  kodeFasil: string;
  namaFasil: string;
  kendala: Partial<Record<keyof FacilRow, string>>;
}

let rosterCache: { at: number; entries: RosterEntry[] } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Daftar semua fasilitator (roster) dari tab "Fasilitator" - [] kalau
 * CONTROLLER_SHEET_URL belum diset ATAU fetch-nya gagal (graceful, sama
 * seperti pola fetch lain di lib/ ini - tidak throw). */
export async function getRosterEntries(): Promise<RosterEntry[]> {
  const url = process.env.CONTROLLER_SHEET_URL;
  if (!url) return [];
  if (rosterCache && Date.now() - rosterCache.at < CACHE_TTL_MS) return rosterCache.entries;

  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) return [];

  const csv = await fetchCsv(gvizCsvUrl(spreadsheetId, ROSTER_SHEET_NAME));
  if (!csv) {
    console.warn(`[masterSheet] Tab "${ROSTER_SHEET_NAME}" tidak bisa diakses - pastikan master spreadsheet sudah di-share "Anyone with the link".`);
    return rosterCache?.entries ?? [];
  }

  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const entries: RosterEntry[] = [];
  for (const row of parsed.data) {
    const kodeFasil = (row["Kode Fasil"] ?? "").trim();
    const namaFasil = (row["Nama Fasil"] ?? "").trim();
    if (!kodeFasil || !namaFasil) continue;
    const kendala: Partial<Record<keyof FacilRow, string>> = {};
    for (const k of KENDALA_COLUMNS) {
      const value = (row[k.header] ?? "").trim();
      if (value) kendala[k.kolom] = value;
    }
    entries.push({ atmin: (row["Atmin"] ?? "").trim(), kodeFasil, namaFasil, kendala });
  }

  rosterCache = { at: Date.now(), entries };
  return entries;
}

// --- Tab "masterLog" (skor per fasilitator, per Hari/Log) ------------------

const MASTER_LOG_SHEET_NAME = "masterLog";

export interface ParsedMasterLogRow {
  tanggal: string;
  logNumber: number;
  hari: number;
  namaFasil: string;
  /** 26 nilai indikator Skor Akhir, FRAKSI 0-1 mentah dari sheet (BEDA dari
   * tab "Isian"/"Log" lama yang sudah "xx.xx%") - dikonversi ke skala 0-100
   * di buildFacilRowFromMasterLog(). */
  values: string[];
  /** Total Skor Akhir - SUDAH skala 0-100 (beda dari 26 kolom values di
   * atas) - dibaca langsung, tidak dihitung ulang. */
  skorAkhirRaw: string;
}

let masterLogCache: { at: number; rows: ParsedMasterLogRow[] } | null = null;

/** Parse satu baris data tab "masterLog" (array kolom mentah, header:false) -
 * layout DIKONFIRMASI 2026-07-18: [Tanggal, Log ke-, Hari ke-, Nama Fasil,
 * ...26 nilai indikator, Skor Akhir total]. Urutan 26 kolom itu PERSIS sama
 * dengan SKOR_AKHIR_COLUMNS (diverifikasi lewat baris header "Checkpoint
 * Hari Ke -->" tab ini, cocok persis dengan activeFromDay tiap indikator di
 * packages/core/knowledge/checkpoints.ts). null kalau bukan baris data
 * valid (dua baris pertama tab ini cuma label header, bukan data). */
function parseMasterLogRow(cols: string[]): ParsedMasterLogRow | null {
  const tanggal = (cols[0] ?? "").trim();
  const namaFasil = (cols[3] ?? "").trim();
  if (!tanggal || !namaFasil) return null;
  const hari = parseInt((cols[2] ?? "").trim(), 10);
  if (!hari) return null;
  return {
    tanggal,
    logNumber: parseInt((cols[1] ?? "").trim(), 10) || 0,
    hari,
    namaFasil,
    values: cols.slice(4, 4 + SKOR_AKHIR_COLUMNS.length),
    skorAkhirRaw: cols[4 + SKOR_AKHIR_COLUMNS.length] ?? "",
  };
}

/** Semua baris tab "masterLog" (belum di-filter/dikelompokkan per
 * fasilitator - itu tanggung jawab pemanggil, lihat lib/sheet.ts). [] kalau
 * CONTROLLER_SHEET_URL belum diset ATAU fetch-nya gagal. */
export async function getMasterLogRows(): Promise<ParsedMasterLogRow[]> {
  const url = process.env.CONTROLLER_SHEET_URL;
  if (!url) return [];
  if (masterLogCache && Date.now() - masterLogCache.at < CACHE_TTL_MS) return masterLogCache.rows;

  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) return [];

  const csv = await fetchCsv(gvizCsvUrl(spreadsheetId, MASTER_LOG_SHEET_NAME));
  if (!csv) {
    console.warn(`[masterSheet] Tab "${MASTER_LOG_SHEET_NAME}" tidak bisa diakses - pastikan master spreadsheet sudah di-share "Anyone with the link".`);
    return masterLogCache?.rows ?? [];
  }

  const parsed = Papa.parse<string[]>(csv, { header: false, skipEmptyLines: false });
  const rows: ParsedMasterLogRow[] = [];
  for (const cols of parsed.data) {
    const row = parseMasterLogRow(cols);
    if (row) rows.push(row);
  }

  masterLogCache = { at: Date.now(), rows };
  return rows;
}

// --- Gabungkan roster + masterLog jadi satu FacilRow ------------------------

function blankFacilRow(): FacilRow {
  return {
    atmin: "", hari: 0, hariLabel: "", kodeFasil: "", namaFasil: "", kodeKoor: "", namaKoor: "",
    fasilBelumLoginLK: null,
    pctSekolahBelumDihubungi: null,
    pctSekolahBelumLoginAplikasi: null,
    frekuensiKomunikasi: null,
    pctTidakPunyaPanlak: null,
    pctTidakPunyaFormatTemplate: null,
    pctBiodataBelumTerverifikasi: null,
    pctTidakPunyaPerencanaLK: null,
    pctTidakPunyaPerencanaAplikasi: null,
    pctDapodikTidakSesuaiBelumUpdate: null,
    pctSudahUpdateDapodik: null,
    pctSudahUploadBuktiUpdateDapodik: null,
    penyusunanDokAdminTerkendala: null,
    pctDokAdminTerunggahLengkap: null,
    rataDokAdminTerunggah: null,
    minDokAdminTerunggah: null,
    pctDokAdminTerunggahDibawah90: null,
    pctDokAdminTerverifikasi: null,
    rataDokAdminTerverifikasi: null,
    minDokAdminTerverifikasi: null,
    pctDokAdminTerverifikasiDibawah90: null,
    pctDokAdminSesuai: null,
    rataDokAdminSesuai: null,
    minDokAdminSesuai: null,
    pctDokAdminSesuaiDibawah90: null,
    penyusunanDokTeknisTerkendala: null,
    pctDokTeknisTerunggahLengkap: null,
    rataDokTeknisTerunggah: null,
    minDokTeknisTerunggah: null,
    pctDokTeknisTerunggahDibawah90: null,
    pctDokTeknisTerverifikasi: null,
    rataDokTeknisTerverifikasi: null,
    minDokTeknisTerverifikasi: null,
    pctDokTeknisTerverifikasiDibawah90: null,
    pctDokTeknisSesuai: null,
    rataDokTeknisSesuai: null,
    minDokTeknisSesuai: null,
    pctDokTeknisSesuaiDibawah90: null,
    pctBelumSepakatRAB: null,
    nilaiRisiko: null,
    kendalaKomunikasi: null,
    kendalaPanlakFormatTemplate: null,
    kendalaMendapatkanPerencana: null,
    kendalaVerifikasiBiodata: null,
    kendalaUpdateDapodik: null,
    kendalaPenyusunanDokAdmin: null,
    kendalaVerifikasiDokAdmin: null,
    kendalaPenyusunanDokTeknis: null,
    kendalaVerifikasiDokTeknis: null,
    kendalaPenyepakatanRAB: null,
    analisis: null,
    catatanAdmin: null,
    skorAkhir: null,
    raw: {},
  };
}

/** Gabungkan satu baris "masterLog" (skor) + entry roster yang cocok (Atmin,
 * Kode Fasil, Kendala...) jadi satu FacilRow lengkap - dicocokkan lewat Nama
 * Fasil (DIKONFIRMASI 2026-07-18: 390/390 nama di kedua tab cocok persis,
 * tanpa duplikat). roster `undefined` kalau namanya tidak ketemu di roster
 * (harusnya tidak pernah terjadi selama kedua tab konsisten - tetap
 * null-safe, kodeFasil/atmin/kendala kosong kalau sampai terjadi). */
export function buildFacilRowFromMasterLog(parsed: ParsedMasterLogRow, roster: RosterEntry | undefined): FacilRow {
  const row = blankFacilRow();
  row.atmin = roster?.atmin ?? "";
  row.hari = parsed.hari;
  row.hariLabel = `Hari ${parsed.hari}`;
  row.kodeFasil = roster?.kodeFasil ?? "";
  row.namaFasil = parsed.namaFasil;

  // 26 kolom masterLog adalah FRAKSI 0-1 (mis. "0.95" = 95%) - beda dari tab
  // "Isian"/"Log" lama yang sudah "xx.xx%". Dikonversi ke skala 0-100 dulu
  // supaya applySkorAkhirColumns() (dan seluruh UI/severity.ts hilir) yang
  // mengasumsikan skala 0-100 tetap konsisten.
  const rawRecord: Record<string, string> = {};
  SKOR_AKHIR_COLUMNS.forEach((col, i) => {
    const raw = parsed.values[i];
    const frac = raw != null && raw !== "" ? parseFloat(raw) : NaN;
    rawRecord[col.header] = Number.isNaN(frac) ? "" : String(frac * 100);
  });
  row.raw = rawRecord;
  Object.assign(row, applySkorAkhirColumns(rawRecord));

  const skorAkhir = parsePercentCell(parsed.skorAkhirRaw);
  if (skorAkhir != null) {
    row.nilaiRisiko = 100 - skorAkhir;
    row.skorAkhir = skorAkhir;
  }

  if (roster) {
    for (const [kolom, value] of Object.entries(roster.kendala)) {
      (row as unknown as Record<string, CellValue>)[kolom] = value;
    }
  }

  return row;
}

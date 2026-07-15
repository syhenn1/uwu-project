import { promises as fs } from "fs";
import path from "path";
import Papa from "papaparse";
import { COLUMN_MAP, toFacilRow } from "./columns";
import type { FacilRow } from "./types";

const HEADER_ANCHOR = `${COLUMN_MAP[0].header},`; // "Atmin,"

/** Accepts whatever URL a user copies from the browser address bar (the normal
 * "edit" link, with or without a #gid fragment) and rewrites it into the CSV
 * export endpoint. Already-correct export URLs pass through unchanged. */
export function normalizeSheetUrl(url: string): string {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return url;
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv&gid=${gid}`;
}

async function loadRawCsv(): Promise<string> {
  const url = process.env.SHEET_CSV_URL;
  if (url) {
    const exportUrl = normalizeSheetUrl(url);
    const res = await fetch(exportUrl, { next: { revalidate: 60 } });
    if (!res.ok) {
      throw new Error(`Gagal mengambil spreadsheet (${res.status} ${res.statusText}). Pastikan SHEET_CSV_URL benar dan sheet dapat diakses publik.`);
    }
    return res.text();
  }
  const fixturePath = path.join(process.cwd(), "fixtures", "sample-sheet.csv");
  return fs.readFile(fixturePath, "utf8");
}

/** Beberapa sheet punya baris filter/judul di atas baris header sebenarnya
 * (mis. baris "Pilih Nama Analis"). Potong semua baris sebelum baris yang
 * benar-benar diawali header kolom pertama, supaya tidak peduli berapa
 * baris tambahan ada di atasnya. */
function stripToHeaderRow(csv: string): string {
  const lines = csv.split(/\r\n|\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith(HEADER_ANCHOR));
  if (headerIdx === -1) {
    throw new Error(
      `Baris header ("${COLUMN_MAP[0].header}, ${COLUMN_MAP[1].header}, ...") tidak ditemukan di CSV. Pastikan SHEET_CSV_URL mengarah ke tab/sheet yang benar (tab "Level Fasil").`
    );
  }
  return lines.slice(headerIdx).join("\n");
}

/** Fetches and parses the facilitator monitoring sheet (public Google Sheet CSV
 * export, or the bundled sample fixture when SHEET_CSV_URL is not configured). */
export async function getFacilRows(): Promise<FacilRow[]> {
  const rawCsv = await loadRawCsv();
  const csv = stripToHeaderRow(rawCsv);
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  // Kalau ada dua kolom di sheet sumber berbagi header text yang sama persis
  // (mis. kolom "Nama Fasil" ke-ganti tidak sengaja jadi "Kode Fasil" lagi),
  // Papaparse diam-diam mengganti nama header duplikatnya ("Kode Fasil_1")
  // alih-alih error - akibatnya kolom yang dicari toFacilRow() lewat COLUMN_MAP
  // jadi undefined dan field terkait kosong TANPA pesan error apapun (mis.
  // Nama Fasil kosong di semua baris, tertukar kesan seolah data lain yang
  // tampil). SENGAJA cuma di-log (bukan throw) - kolom lain yang datanya sehat
  // (checkpoint, risiko, dll) harus tetap bisa dipakai walau satu header di
  // sheet sumber lagi salah ketik, bukan seluruh dashboard ikut down.
  const missingHeaders = COLUMN_MAP.filter((c) => !parsed.meta.fields?.includes(c.header));
  if (missingHeaders.length > 0) {
    console.error(
      `[sheet] Header kolom berikut tidak ditemukan persis di CSV, kolom terkait akan kosong: ${missingHeaders.map((c) => `"${c.header}"`).join(", ")}. ` +
        `Kemungkinan header itu ke-typo/ke-timpa di spreadsheet sumber, atau ada dua kolom dengan judul sama persis (Papaparse otomatis mengganti nama duplikatnya jadi "..._1"). Cek baris header tab "Level Fasil".`
    );
  }
  return parsed.data
    .filter((r) => (r["Kode Fasil"] ?? "").trim() !== "")
    .map(toFacilRow);
}

export function isUsingSampleData(): boolean {
  return !process.env.SHEET_CSV_URL;
}

// --- Jadwal checkpoint (tab "Check Point") -------------------------------

/** gid tab "Check Point" - beda dari SHEET_CSV_URL (tab "Level Fasil") tapi ada
 * di spreadsheet yang sama. Bisa dioverride kalau sheet lain gid-nya beda. */
const CHECKPOINT_SHEET_GID = process.env.SHEET_CHECKPOINT_GID || "34204050";

const INDO_MONTHS: Record<string, number> = {
  januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
  juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
};

function parseIndoDate(text: string): Date | null {
  const match = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!match) return null;
  const month = INDO_MONTHS[match[2].toLowerCase()];
  if (month == null) return null;
  return new Date(parseInt(match[3], 10), month, parseInt(match[1], 10));
}

function checkpointSheetUrl(): string | null {
  const base = process.env.SHEET_CSV_URL;
  if (!base) return null;
  const idMatch = base.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv&gid=${CHECKPOINT_SHEET_GID}`;
}

export interface CheckpointScheduleEntry {
  no: number;
  hari: number;
  checkpoint: string;
  tanggal: Date | null;
}

/** Fetches the "Check Point" tab (No, Tanggal, Hari ke-, Checkpoints) - dipakai
 * untuk menentukan "hari ini" ada di Hari ke berapa dalam siklus 14 hari.
 * Mengembalikan [] kalau SHEET_CSV_URL belum diset (dev pakai data contoh). */
export async function getCheckpointSchedule(): Promise<CheckpointScheduleEntry[]> {
  const url = checkpointSheetUrl();
  if (!url) return [];
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return [];
  const csv = await res.text();
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  return parsed.data
    .filter((r) => (r["Checkpoints"] ?? "").trim() !== "")
    .map((r) => ({
      no: parseInt(r["No"], 10),
      hari: parseInt(r["Hari ke-"], 10),
      checkpoint: (r["Checkpoints"] ?? "").trim(),
      tanggal: parseIndoDate(r["Tanggal"] ?? ""),
    }));
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Jangkar tetap: 6 Juli 2026 = Hari 1 siklus berjalan (dikonfirmasi manual,
 * cocok dengan tanggal "Check Point" No.1 = Selasa 7 Juli 2026 = Hari 2).
 * Dipakai sebagai fallback kalau tab "Check Point" tidak bisa diambil. */
const FALLBACK_ANCHOR = { hari: 1, tanggal: new Date(2026, 6, 6) };

/** Menentukan "Hari ke-" untuk tanggal tertentu (default hari ini), berdasarkan
 * jadwal di tab "Check Point" (linear, 1 hari kalender = 1 "Hari ke-"), dengan
 * fallback ke FALLBACK_ANCHOR kalau sheet tidak tersedia. Hasil di-clamp ke
 * rentang siklus 1-14. */
export async function getTodayHari(referenceDate: Date = new Date()): Promise<number> {
  const schedule = await getCheckpointSchedule();
  const anchorEntry = schedule.find((e) => e.tanggal != null);
  const anchor = anchorEntry?.tanggal ? { hari: anchorEntry.hari, tanggal: anchorEntry.tanggal } : FALLBACK_ANCHOR;

  const base = new Date(anchor.tanggal);
  base.setDate(base.getDate() - (anchor.hari - 1));
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((stripTime(referenceDate).getTime() - stripTime(base).getTime()) / msPerDay);
  return Math.min(14, Math.max(1, diffDays + 1));
}

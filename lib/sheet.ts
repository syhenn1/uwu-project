import { promises as fs } from "fs";
import path from "path";
import Papa from "papaparse";
import { toFacilRow } from "./columns";
import type { FacilRow } from "./types";

async function loadRawCsv(): Promise<string> {
  const url = process.env.SHEET_CSV_URL;
  if (url) {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      throw new Error(`Gagal mengambil spreadsheet (${res.status} ${res.statusText}). Pastikan SHEET_CSV_URL benar dan sheet dapat diakses publik.`);
    }
    return res.text();
  }
  const fixturePath = path.join(process.cwd(), "fixtures", "sample-sheet.csv");
  return fs.readFile(fixturePath, "utf8");
}

/** Fetches and parses the facilitator monitoring sheet (public Google Sheet CSV
 * export, or the bundled sample fixture when SHEET_CSV_URL is not configured). */
export async function getFacilRows(): Promise<FacilRow[]> {
  const csv = await loadRawCsv();
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data
    .filter((r) => (r["Kode Fasil"] ?? "").trim() !== "")
    .map(toFacilRow);
}

export function isUsingSampleData(): boolean {
  return !process.env.SHEET_CSV_URL;
}

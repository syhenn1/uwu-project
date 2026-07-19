import { getControllerEntry } from "./controller";

export interface AnalysisSaveItem {
  kodeFasil: string;
  hari: number;
  hasil: string;
}

export interface WriteSheetResult {
  ok: boolean;
  updated?: number;
  notFound?: string[];
  error?: string;
}

function normalize(v: any) {
  return String(v == null ? "" : v).trim();
}

/** 
 * Cari tabel log harian di seluruh sheet.
 * Karena kita pakai REST API, kita ambil metadata sheet dulu lalu ambil valuesnya.
 */
async function findLogTable(spreadsheetId: string, accessToken: string) {
  // 1. Dapatkan daftar nama sheet
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 60 } // cache metadata sebentar
  });
  if (!metaRes.ok) throw new Error(`Gagal akses spreadsheet (HTTP ${metaRes.status})`);
  const metaData = await metaRes.json();
  const sheets: string[] = metaData.sheets?.map((s: any) => s.properties.title) || [];

  // 2. Fetch data dari tiap sheet secara bergiliran (atau bisa batch, tapi ini lebih aman)
  for (const sheetName of sheets) {
    const range = encodeURIComponent(`${sheetName}!A1:Z500`);
    const valRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store'
    });
    if (!valRes.ok) continue;
    const valData = await valRes.json();
    const values = valData.values || [];
    
    for (let r = 0; r < values.length; r++) {
      let analisisCol = -1;
      let hariCol = -1;
      for (let c = 0; c < values[r].length; c++) {
        const cell = normalize(values[r][c]);
        if (cell === "Analisis") analisisCol = c;
        if (cell.startsWith("Hari Ke")) hariCol = c;
      }
      if (analisisCol !== -1 && hariCol !== -1) {
        return { sheetName, headerRow: r, hariCol, analisisCol, values };
      }
    }
  }
  return null;
}

export async function fetchAnalisisFromSheet(kodeFasil: string, hari: number, accessToken?: string): Promise<string | null> {
  if (!accessToken) return null;
  const entry = await getControllerEntry(kodeFasil);
  if (!entry) return null;

  try {
    const found = await findLogTable(entry.spreadsheetId, accessToken);
    if (!found) return null;

    for (let r = found.headerRow + 1; r < found.values.length; r++) {
      const rowHariRaw = normalize(found.values[r][found.hariCol]);
      const rowHari = parseInt(rowHariRaw, 10);
      if (!isNaN(rowHari) && rowHari === hari) {
        const hasil = normalize(found.values[r][found.analisisCol]);
        return hasil === "" ? null : hasil;
      }
    }
  } catch (err) {
    console.warn(`[writeSheet] fetchAnalisisFromSheet error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return null;
}

/** Mengonversi nomor kolom 0-based jadi huruf (misal: 0 -> A, 25 -> Z, 26 -> AA) */
function colToLetter(col: number): string {
  let temp, letter = '';
  while (col >= 0) {
    temp = col % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = (col - temp) / 26 - 1;
  }
  return letter;
}

export async function pushAnalysisToSheet(items: AnalysisSaveItem[], accessToken?: string): Promise<WriteSheetResult> {
  if (!accessToken) {
    return { ok: false, error: "Kamu belum memberikan izin akses Spreadsheet pada saat login. Silakan login ulang." };
  }

  // Kelompokkan per spreadsheet
  const bySpreadsheet: Record<string, AnalysisSaveItem[]> = {};
  const notFound: string[] = [];

  for (const item of items) {
    const entry = await getControllerEntry(item.kodeFasil);
    if (!entry) {
      notFound.push(`${item.kodeFasil} Hari ${item.hari} (fasilitator tidak ditemukan)`);
      continue;
    }
    const key = entry.spreadsheetId;
    if (!bySpreadsheet[key]) bySpreadsheet[key] = [];
    bySpreadsheet[key].push(item);
  }

  let updated = 0;

  for (const spreadsheetId of Object.keys(bySpreadsheet)) {
    const groupItems = bySpreadsheet[spreadsheetId];
    const label = groupItems[0].kodeFasil || spreadsheetId;

    let found;
    try {
      found = await findLogTable(spreadsheetId, accessToken);
    } catch (err) {
      groupItems.forEach((i) => notFound.push(`${label} Hari ${i.hari} (gagal akses sheet)`));
      continue;
    }

    if (!found) {
      groupItems.forEach((i) => notFound.push(`${label} Hari ${i.hari} (tabel log tidak ketemu)`));
      continue;
    }

    // Persiapkan batchUpdate
    const updateData = [];
    for (const item of groupItems) {
      let rowFound = false;
      for (let r = found.headerRow + 1; r < found.values.length; r++) {
        const rowHariRaw = normalize(found.values[r][found.hariCol]);
        const rowHari = parseInt(rowHariRaw, 10);
        if (!isNaN(rowHari) && rowHari === item.hari) {
          const rowNumber = r + 1;
          const colLetter = colToLetter(found.analisisCol);
          const range = `${found.sheetName}!${colLetter}${rowNumber}`;
          updateData.push({ range, values: [[item.hasil]] });
          rowFound = true;
          updated++;
          break;
        }
      }
      if (!rowFound) {
        notFound.push(`${label} Hari ${item.hari} (baris hari ke-${item.hari} tidak ketemu)`);
      }
    }

    if (updateData.length > 0) {
      const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: updateData,
        }),
      });
      if (!updateRes.ok) {
        groupItems.forEach((i) => notFound.push(`${label} Hari ${i.hari} (gagal nulis nilai)`));
      }
    }
  }

  return { ok: true, updated, notFound };
}

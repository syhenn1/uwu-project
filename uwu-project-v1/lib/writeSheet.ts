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

/**
 * Menulis hasil analisis AI ke kolom "Analisis" di tab "Level Fasil", lewat
 * Apps Script Web App yang di-deploy dari spreadsheet itu sendiri (lihat
 * google-apps-script/save-analisis.gs). Aplikasi ini tidak pernah menyimpan
 * kredensial Google sendiri - webhook Apps Script inilah satu-satunya jalur tulis.
 */
export async function pushAnalysisToSheet(items: AnalysisSaveItem[]): Promise<WriteSheetResult> {
  const url = process.env.WRITE_SHEETS_WEBHOOK_URL;
  const secret = process.env.WRITE_SHEETS_WEBHOOK_SECRET;
  if (!url || !secret) {
    return {
      ok: false,
      error:
        "WRITE_SHEETS_WEBHOOK_URL / WRITE_SHEETS_WEBHOOK_SECRET belum diset di .env.local. Deploy dulu " +
        "google-apps-script/save-analisis.gs sebagai Web App (lihat komentar di file itu), lalu isi URL & secret-nya.",
    };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, items }),
    });
  } catch (err) {
    return { ok: false, error: `Gagal terhubung ke webhook Apps Script: ${err instanceof Error ? err.message : "unknown"}` };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    return { ok: false, error: data?.error || `Webhook Apps Script error ${res.status}` };
  }

  return { ok: true, updated: data.updated, notFound: data.notFound };
}

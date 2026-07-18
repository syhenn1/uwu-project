import { NextRequest, NextResponse } from "next/server";
import { getFacilRowsForSelectedAdmin, getTodayHari } from "@/lib/sheet";
import { getRowsForFacilitator } from "@uwu/core/metrics";
import { detectFacilitatorAnomalies, fieldsWithFutureDataAnomaly } from "@uwu/core/anomalies";
import { buildFacilitatorAnalysisMessages } from "@uwu/core/prompts";
import { callLLM } from "@uwu/core/llm";

export async function POST(req: NextRequest) {
  try {
    const reqBody = await req.json();
    const { kodeFasil, hari, excludeAplikasi, history: clientHistory } = reqBody;
    if (!kodeFasil || typeof kodeFasil !== "string") {
      return NextResponse.json({ error: "kodeFasil wajib diisi." }, { status: 400 });
    }
    console.log(`[API] POST /api/analyze/facilitator - kodeFasil=${kodeFasil} hari=${hari ?? "(semua)"} excludeAplikasi=${!!excludeAplikasi}`);

    const todayHari = await getTodayHari();
    let history = clientHistory;

    // Fallback if client doesn't send history
    if (!history || !Array.isArray(history)) {
      const rows = await getFacilRowsForSelectedAdmin();
      const fullHistory = getRowsForFacilitator(rows, kodeFasil);
      if (fullHistory.length === 0) {
        return NextResponse.json({ error: "Tidak ada data untuk fasilitator ini." }, { status: 404 });
      }
      const boundaryHari = typeof hari === "number" ? Math.min(hari, todayHari) : todayHari;
      history = fullHistory.filter((r) => r.hari <= boundaryHari);
    }

    if (history.length === 0) {
      return NextResponse.json({ error: "Tidak ada data untuk fasilitator ini." }, { status: 404 });
    }

    const anomalyFields = fieldsWithFutureDataAnomaly(detectFacilitatorAnomalies(history, todayHari));

    // targetHari di set ke 'hari' yang diminta (kalau spesifik) atau 'todayHari' kalau mode alltime
    const targetHari = typeof hari === "number" ? hari : todayHari;

    const messages = buildFacilitatorAnalysisMessages(history, { excludeAplikasi: !!excludeAplikasi, anomalyFields, targetHari });
    console.log(`\n\n--- [AI DEBUG] INPUT TO LLM UNTUK ${kodeFasil} ---`);
    console.log(JSON.stringify(messages, null, 2));

    const result = await callLLM(messages);
    
    console.log(`\n\n--- [AI DEBUG] OUTPUT DARI LLM UNTUK ${kodeFasil} ---`);
    console.log(result);
    console.log(`----------------------------------------------------\n\n`);
    
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.";
    console.error(`[API] /api/analyze/facilitator gagal:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getFacilRows } from "@/lib/sheet";
import { getRowsForFacilitator } from "@/lib/metrics";
import { buildFacilitatorAnalysisMessages } from "@/lib/prompts";
import { callLLM } from "@/lib/llm";

export async function POST(req: NextRequest) {
  try {
    const { kodeFasil, hari, excludeAplikasi } = await req.json();
    if (!kodeFasil || typeof kodeFasil !== "string") {
      return NextResponse.json({ error: "kodeFasil wajib diisi." }, { status: 400 });
    }
    console.log(`[API] POST /api/analyze/facilitator - kodeFasil=${kodeFasil} hari=${hari ?? "(semua)"} excludeAplikasi=${!!excludeAplikasi}`);

    const rows = await getFacilRows();
    let history = getRowsForFacilitator(rows, kodeFasil);
    if (typeof hari === "number") {
      history = history.filter((r) => r.hari <= hari);
    }
    if (history.length === 0) {
      return NextResponse.json({ error: "Tidak ada data untuk fasilitator ini." }, { status: 404 });
    }

    const messages = buildFacilitatorAnalysisMessages(history, { excludeAplikasi: !!excludeAplikasi });
    const result = await callLLM(messages);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.";
    console.error(`[API] /api/analyze/facilitator gagal:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

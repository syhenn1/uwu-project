import { NextRequest, NextResponse } from "next/server";
import { getFacilRows } from "@/lib/sheet";
import { getRowsForDay } from "@/lib/metrics";
import { buildDailySummaryMessages } from "@/lib/prompts";
import { callLLM } from "@/lib/llm";

export async function POST(req: NextRequest) {
  try {
    const { hari } = await req.json();
    if (typeof hari !== "number") {
      return NextResponse.json({ error: "hari wajib diisi." }, { status: 400 });
    }
    console.log(`[API] POST /api/analyze/summary - hari=${hari}`);

    const rows = await getFacilRows();
    const dayRows = getRowsForDay(rows, hari);
    if (dayRows.length === 0) {
      return NextResponse.json({ error: "Tidak ada data untuk hari ini." }, { status: 404 });
    }
    const prevDayRows = hari > 1 ? getRowsForDay(rows, hari - 1) : [];

    const messages = buildDailySummaryMessages(dayRows, hari, prevDayRows);
    const result = await callLLM(messages);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.";
    console.error(`[API] /api/analyze/summary gagal:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

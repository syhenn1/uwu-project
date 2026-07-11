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

    const rows = await getFacilRows();
    const dayRows = getRowsForDay(rows, hari);
    if (dayRows.length === 0) {
      return NextResponse.json({ error: "Tidak ada data untuk hari ini." }, { status: 404 });
    }

    const messages = buildDailySummaryMessages(dayRows, hari);
    const result = await callLLM(messages);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

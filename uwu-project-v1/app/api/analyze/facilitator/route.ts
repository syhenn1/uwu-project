import { NextRequest, NextResponse } from "next/server";
import { getFacilRows, getTodayHari } from "@/lib/sheet";
import { getRowsForFacilitator } from "@/lib/metrics";
import { detectFacilitatorAnomalies, fieldsWithFutureDataAnomaly } from "@/lib/anomalies";
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
    const fullHistory = getRowsForFacilitator(rows, kodeFasil);
    if (fullHistory.length === 0) {
      return NextResponse.json({ error: "Tidak ada data untuk fasilitator ini." }, { status: 404 });
    }
    const todayHari = await getTodayHari();
    // Anomali "future_data" (data untuk hari yang belum terjadi) HARUS dideteksi
    // dari history MENTAH (sebelum dipotong ke todayHari di bawah) - kalau
    // dideteksi SETELAH dipotong, baris "masa depan" itu sendiri sudah hilang
    // duluan dan anomalinya tidak akan pernah ketemu.
    const anomalyFields = fieldsWithFutureDataAnomaly(detectFacilitatorAnomalies(fullHistory, todayHari));

    // Sheet punya baris placeholder untuk semua 14 hari sekaligus (termasuk hari
    // yang belum tiba, lihat lib/sheet.ts) - kalau `hari` tidak dikirim (mode
    // "alltime"), JANGAN pakai seluruh history mentah begitu saja, itu bisa
    // membuat analisis membahas hari yang belum sungguh terjadi. Selalu batasi
    // ke `todayHari` (hari nyata siklus berjalan), dan kalau `hari` eksplisit
    // dikirim tapi lebih besar dari itu, clamp ke todayHari juga.
    const boundaryHari = typeof hari === "number" ? Math.min(hari, todayHari) : todayHari;
    const history = fullHistory.filter((r) => r.hari <= boundaryHari);
    if (history.length === 0) {
      return NextResponse.json({ error: "Tidak ada data untuk fasilitator ini." }, { status: 404 });
    }

    const messages = buildFacilitatorAnalysisMessages(history, { excludeAplikasi: !!excludeAplikasi, anomalyFields });
    const result = await callLLM(messages);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.";
    console.error(`[API] /api/analyze/facilitator gagal:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

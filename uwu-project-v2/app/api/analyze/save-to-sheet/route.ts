import { NextRequest, NextResponse } from "next/server";
import { pushAnalysisToSheet } from "@/lib/writeSheet";
import { auth } from "@/lib/auth";

interface SaveItem {
  kodeFasil: string;
  namaFasil: string;
  hari: number;
  hasil: string;
}

/**
 * Menulis hasil analisis AI massal ke kolom "Analisis" di tab "Level Fasil",
 * lewat webhook Apps Script (lib/writeSheet.ts + google-apps-script/save-analisis.gs).
 * Aplikasi ini sendiri tidak punya kredensial Google - kalau webhook belum
 * dikonfigurasi, pushAnalysisToSheet mengembalikan pesan error yang jelas.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  // @ts-expect-error accessToken ada di config JWT NextAuth kita
  const accessToken = session?.accessToken;

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized: Missing Google OAuth token." }, { status: 401 });
  }

  const { items } = (await req.json()) as { items: SaveItem[] };
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Tidak ada hasil analisis untuk disimpan." }, { status: 400 });
  }

  const result = await pushAnalysisToSheet(
    items.map((i) => ({ kodeFasil: i.kodeFasil, hari: i.hari, hasil: i.hasil })),
    accessToken
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ updated: result.updated, notFound: result.notFound });
}

import { NextRequest, NextResponse } from "next/server";
import { getFacilitatorLkRows } from "@/lib/facilitatorLk";

export async function GET(req: NextRequest) {
  const kodeFasil = req.nextUrl.searchParams.get("kodeFasil");
  const hariParam = req.nextUrl.searchParams.get("hari");
  if (!kodeFasil) {
    return NextResponse.json({ error: "kodeFasil wajib diisi." }, { status: 400 });
  }
  const hari = hariParam ? parseInt(hariParam, 10) : undefined;
  const result = await getFacilitatorLkRows(kodeFasil, hari);
  return NextResponse.json(result);
}

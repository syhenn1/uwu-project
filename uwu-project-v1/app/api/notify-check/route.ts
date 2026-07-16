import { NextResponse } from "next/server";
import { getFacilRows, getTodayHari } from "@/lib/sheet";
import { scanAllAnomalies } from "@/lib/anomalies";
import { getCheckpointCompliance } from "@/lib/compliance";
import { getRowsForFacilitator, getFacilitators, getCurrentRow } from "@/lib/metrics";
import { readNotifyState, writeNotifyState } from "@/lib/notifyState";
import { sendNotification } from "@/lib/notify";

/**
 * Mengecek anomali & kepatuhan checkpoint terkini, membandingkan dengan
 * temuan terakhir yang sudah pernah diberitahukan (lib/notifyState.ts), dan
 * mengirim notifikasi HANYA untuk yang baru lewat lib/notify.ts. Dipanggil
 * manual (tombol di halaman Laporan) atau dijadwalkan dari luar (cron/Task
 * Scheduler) - lihat README untuk cara menjadwalkannya.
 */
export async function GET() {
  try {
    const rows = await getFacilRows();
    const todayHari = await getTodayHari();
    const facilitators = getFacilitators(rows);
    const anomalyReports = scanAllAnomalies(rows, todayHari);

    const detailByKey = new Map<string, string>();

    for (const report of anomalyReports) {
      for (const item of report.items) {
        const key = `anomali:${report.kodeFasil}:${item.type}:${item.detail}`;
        detailByKey.set(key, `[Anomali] ${report.namaFasil}: ${item.detail}`);
      }
    }

    for (const f of facilitators) {
      const history = getRowsForFacilitator(rows, f.kodeFasil);
      const latest = getCurrentRow(history, todayHari);
      if (!latest) continue;
      const compliance = getCheckpointCompliance(latest, todayHari);
      for (const c of compliance) {
        if (c.status === "belum-sesuai") {
          const key = `checkpoint:${f.kodeFasil}:${c.group.no}`;
          detailByKey.set(key, `[Checkpoint] ${f.namaFasil}: "${c.group.name}" belum sesuai`);
        }
      }
    }

    const signatures = new Set(detailByKey.keys());
    const state = await readNotifyState();
    const isFirstRun = state.lastCheckedAt === "";
    const seen = new Set(state.seenSignatures);
    const newKeys = [...signatures].filter((k) => !seen.has(k));

    let notifyResult: Awaited<ReturnType<typeof sendNotification>> | null = null;
    if (newKeys.length > 0 && !isFirstRun) {
      notifyResult = await sendNotification({
        title: `${newKeys.length} temuan baru - Monitoring Fasilitator (Hari ${todayHari})`,
        lines: newKeys.slice(0, 20).map((k) => detailByKey.get(k) ?? k),
      });
    }

    await writeNotifyState({ seenSignatures: [...signatures], lastCheckedAt: new Date().toISOString() });

    return NextResponse.json({
      todayHari,
      totalSignatures: signatures.size,
      newCount: newKeys.length,
      firstRun: isFirstRun,
      notified: notifyResult?.sent ?? false,
      channels: notifyResult?.channels ?? [],
      notifyError: notifyResult?.error,
      newItems: newKeys.slice(0, 20).map((k) => detailByKey.get(k)),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." }, { status: 500 });
  }
}

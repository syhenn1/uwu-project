import { promises as fs } from "fs";
import path from "path";

const STATE_DIR = path.join(process.cwd(), ".data");
const STATE_FILE = path.join(STATE_DIR, "notify-state.json");

export interface NotifyState {
  seenSignatures: string[];
  lastCheckedAt: string;
}

const EMPTY_STATE: NotifyState = { seenSignatures: [], lastCheckedAt: "" };

/**
 * Penyimpanan kecil berbasis file lokal, khusus untuk mengingat "temuan mana
 * yang sudah pernah diberitahukan" supaya /api/notify-check bisa mengirim
 * notifikasi hanya untuk yang BARU, bukan mengirim ulang seluruh daftar
 * anomali tiap kali dicek. Ini pengecualian kecil dari keputusan "tanpa
 * database" - lingkupnya cuma state notifikasi, bukan data aplikasi.
 * Tidak bekerja di platform serverless yang disknya tidak persisten antar
 * request (mis. Vercel) - cocoknya untuk deployment yang selalu-hidup
 * (server lokal/VM).
 */
export async function readNotifyState(): Promise<NotifyState> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(raw) as NotifyState;
  } catch {
    return EMPTY_STATE;
  }
}

export async function writeNotifyState(state: NotifyState): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { getRosterEntries, extractSpreadsheetId, gvizCsvUrl } from '@/lib/masterSheet';
import { getTodayHari } from '@/lib/sheet';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Izinkan berjalan maksimal 60 detik (cukup untuk 390 fetch paralel)

function getActiveWindow() {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const h = (utcHours + 7) % 24; // Convert UTC to WIB
  const m = now.getUTCMinutes();
  const mins = h * 60 + m;
  
  if (mins >= 7 * 60 && mins < 11 * 60 + 30) return 1;
  if (mins >= 13 * 60 + 30 && mins < 17 * 60 + 30) return 2;
  return null;
}


export async function GET(request: Request) {
  try {
    // 1. Verifikasi Cron Secret (Keamanan Vercel)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // Jika dipanggil manual dari browser tanpa token, tolak.
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const urlParams = new URL(request.url).searchParams;
    const forceLog = urlParams.get('force') || urlParams.get('forceLog');
    const forceHari = urlParams.get('forceHari');
    
    // 2. Cek apakah sedang dalam jendela waktu aktif (Pagi/Sore)
    const logNumber = forceLog ? parseInt(forceLog, 10) : getActiveWindow();
    
    if (!logNumber) {
      return NextResponse.json({ status: 'skip', message: 'Sedang di luar jendela waktu sinkronisasi (Tidur). Tidak ada data ditarik.' });
    }

    const offsetParam = urlParams.get('offset');
    const limitParam = urlParams.get('limit');
    
    // 3. Ambil Roster & Hari
    const hariKe = forceHari ? parseInt(forceHari, 10) : await getTodayHari();
    const fullRoster = await getRosterEntries();
    
    // Terapkan chunking jika ada offset/limit
    let roster = fullRoster;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const limit = limitParam ? parseInt(limitParam, 10) : fullRoster.length;
    roster = fullRoster.slice(offset, offset + limit);
    
    const payloadRows: (string|number|null)[][] = Array(roster.length).fill([]);
    const targetLabel = logNumber === 1 ? 'Log 1 di 07.00 WIB' : 'Log 2 di 13.30 WIB';
    
    // Waktu pencatatan
    const now = new Date();
    const offsetMs = 7 * 60 * 60 * 1000;
    const wibDate = new Date(now.getTime() + offsetMs);
    const dateStr = wibDate.toISOString().replace('T', ' ').substring(0, 19);

    // 4. Proses Fasil dengan Sliding Window Concurrency
    let successCount = 0;
    let errorCount = 0;

    async function processWithConcurrency(items: typeof roster, maxConcurrent: number) {
      let index = 0;
      const promises: Promise<void>[] = [];

      const worker = async () => {
        while (index < items.length) {
          const currentIndex = index++;
          const entry = items[currentIndex];

          let attempt = 0;
          let success = false;

          while (attempt < 3 && !success) {
            attempt++;
            try {
              if (!entry.urlLK) throw new Error('Tidak ada URL');
              const sid = extractSpreadsheetId(entry.urlLK);
              if (!sid) throw new Error('ID Spreadsheet tidak valid');
              
              const url = gvizCsvUrl(sid, 'Log') + `&t=${Date.now()}`;
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 30000);
              
              let res;
              try {
                res = await fetch(url, { cache: 'no-store', signal: controller.signal });
              } finally {
                clearTimeout(timeoutId);
              }

              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const csv = await res.text();
              
              const parsed = Papa.parse<string[]>(csv, { header: false, skipEmptyLines: true });
              let foundRow: string[] | null = null;
              for (let i = 2; i < parsed.data.length; i++) {
                const row = parsed.data[i];
                if ((row[0] || '').trim() === targetLabel && parseInt((row[1] || '').trim(), 10) === hariKe) {
                  foundRow = row;
                  break;
                }
              }
              
              if (foundRow) {
                payloadRows[currentIndex] = [dateStr, logNumber, hariKe, entry.namaFasil, ...foundRow.slice(6, 6 + 27)];
                successCount++;
              } else {
                errorCount++;
                payloadRows[currentIndex] = [dateStr, logNumber, hariKe, entry.namaFasil, ...Array(27).fill("")];
              }
              success = true;
            } catch (e: any) {
              if (attempt === 3) {
                errorCount++;
                payloadRows[currentIndex] = [dateStr, logNumber, hariKe, entry.namaFasil, ...Array(27).fill("")];
              } else {
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
              }
            }
          }
        }
      };

      for (let i = 0; i < maxConcurrent; i++) {
        promises.push(worker());
      }
      await Promise.all(promises);
    }

    await processWithConcurrency(roster, 10);

    // Jika sistem dipanggil dengan offset/limit, KEMBALIKAN DATA LANGSUNG (tidak perlu tembak webhook)
    // Biarkan script penelepon (cronPinger) yang merangkai dan menyimpannya.
    if (offsetParam || limitParam) {
      return NextResponse.json({
        status: 'success',
        offset,
        limit,
        hariKe,
        logNumber,
        berhasilTarik: successCount,
        belumMengisiAtauError: errorCount,
        rows: payloadRows
      });
    }

    if (payloadRows.length === 0) {
      return NextResponse.json({ status: 'success', message: 'Selesai ditarik. Tapi belum ada satupun fasilitator yang mengisi baris ini.' });
    }

    // 5. Fallback Webhook (Untuk pemanggilan legacy tanpa chunking)
    const webhookUrl = process.env.SYNC_WEBHOOK_URL;
    const webhookSecret = process.env.SYNC_SECRET_KEY;

    if (!webhookUrl || !webhookSecret) {
       return NextResponse.json({ error: 'SYNC_WEBHOOK_URL atau SYNC_SECRET_KEY belum diatur di .env' }, { status: 500 });
    }

    const whRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: webhookSecret,
        hariKe,
        logNumber,
        rows: payloadRows
      })
    });

    const whData = await whRes.json();
    return NextResponse.json({
      status: 'success',
      waktuEksekusi: `${Date.now() - now.getTime()} ms`,
      berhasilTarik: successCount,
      belumMengisiAtauError: errorCount,
      webhookResponse: whData
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

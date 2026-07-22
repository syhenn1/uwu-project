/**
 * =====================================================================
 * SCRIPT PENGGANTI VERCEL CRON (GRATIS TANPA BATAS)
 * =====================================================================
 * Karena Vercel Hobby melarang Cron Job lebih dari 1x sehari,
 * kita gunakan Google Apps Script sebagai "mesin pengetuk pintu".
 * 
 * Script ini berfungsi HANYA untuk mengetuk pintu Vercel (Next.js), 
 * lalu Next.js yang akan melakukan sisa pekerjaan beratnya.
 *
 * CARA PAKAI:
 * 1. Taruh file ini di Google Apps Script (misal: cronPinger.gs)
 * 2. Masuk ke menu Pemicu (Triggers) logo jam alarm di kiri.
 * 3. Buat pemicu baru:
 *    - Fungsi: panggilVercelCron
 *    - Sumber acara: Berdasarkan waktu (Time-driven)
 *    - Tipe: Menit (Minutes timer)
 *    - Interval: Setiap 5 menit (Every 5 minutes)
 * 4. Simpan. Selesai!
 * =====================================================================
 */

function panggilVercelCron() {
  // GANTI INI DENGAN DOMAIN VERCEL-MU YANG AKTIF
  var NEXTJS_CRON_URL = "https://uwu-project.vercel.app/api/cron/sync-logs";
  var CRON_SECRET = "RahasiaVercelCron123!";
  
  // WEBHOOK SYNC RECEIVER (Ambil dari .env)
  var WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxLZq5DyJ01HJFv9Sv1SW7Rl6JEq9xTo93-7-eD5s4qG7qgByfebl-JY-D7ZXmrMT1o/exec";
  var WEBHOOK_SECRET = "UwU_Rahasia_123!";
  
  var totalFasilitator = 390;
  var chunkSize = 75; // Ambil 75 fasil per panggilan (menghindari timeout 60 detik Vercel)
  var allRows = [];
  var hariKe = 0;
  var logNumber = 0;
  var totalBerhasil = 0;
  
  for (var offset = 0; offset < totalFasilitator; offset += chunkSize) {
    var fetchUrl = NEXTJS_CRON_URL + "?offset=" + offset + "&limit=" + chunkSize;
    var options = {
      method: "get",
      headers: { "Authorization": "Bearer " + CRON_SECRET },
      muteHttpExceptions: true
    };
    
    try {
      Logger.log("Mengambil chunk offset " + offset + "...");
      var response = UrlFetchApp.fetch(fetchUrl, options);
      var code = response.getResponseCode();
      var json = JSON.parse(response.getContentText());
      
      if (code === 200 && json.rows) {
        allRows = allRows.concat(json.rows);
        hariKe = json.hariKe;
        logNumber = json.logNumber;
        totalBerhasil += json.berhasilTarik || 0;
      } else {
        Logger.log("Gagal atau skip: " + response.getContentText());
        // Kalau Vercel balas "skip" (di luar jam kerja), langsung hentikan
        if (json.status === "skip") return; 
      }
    } catch (e) {
      Logger.log("Error fetch Vercel chunk " + offset + ": " + e.message);
    }
  }
  
  // Jika berhasil mengumpulkan baris, kirim ke Webhook
  if (allRows.length > 0 && hariKe && logNumber) {
    Logger.log("Berhasil mengumpulkan " + allRows.length + " baris. Mengirim ke Webhook...");
    
    var whOptions = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        secret: WEBHOOK_SECRET,
        hariKe: hariKe,
        logNumber: logNumber,
        rows: allRows
      }),
      muteHttpExceptions: true
    };
    
    try {
      var whResponse = UrlFetchApp.fetch(WEBHOOK_URL, whOptions);
      Logger.log("Webhook response: " + whResponse.getContentText());
    } catch (e) {
      Logger.log("Error kirim webhook: " + e.message);
    }
  }
}

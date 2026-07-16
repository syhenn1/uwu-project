// Apps Script Web App - menerima hasil analisis AI dari dashboard dan
// menuliskannya ke kolom "Analisis" pada tab "Level Fasil", di baris yang
// Kode Fasil + Hari ke-nya cocok.
//
// CARA DEPLOY:
//   1. Buka spreadsheet "Level Fasil" di Google Sheets.
//   2. Menu Extensions > Apps Script.
//   3. Hapus isi default Code.gs, tempel seluruh isi file ini.
//   4. Ganti SAVE_ANALISIS_SECRET di bawah dengan string rahasia bikinanmu sendiri
//      (bebas, asal panjang & tidak gampang ditebak).
//   5. Klik Deploy > New deployment.
//      - Type: Web app
//      - Execute as: Me
//      - Who has access: Anyone
//   6. Klik Deploy, izinkan permission yang diminta (punya-mu sendiri).
//   7. Salin "Web app URL" yang muncul - itu untuk WRITE_SHEETS_WEBHOOK_URL.
//   8. Isi WRITE_SHEETS_WEBHOOK_URL dan WRITE_SHEETS_WEBHOOK_SECRET (= SAVE_ANALISIS_SECRET
//      di bawah) di .env.local aplikasi dashboard.
//
// Kalau nanti ubah kode ini, harus bikin "New deployment" lagi (atau "Manage
// deployments" > edit versi) supaya perubahan ke-apply ke URL yang sama.
//
// DEBUG: kalau muncul error "Kolom Kode Fasil / Hari ke / Analisis tidak
// ditemukan", buka URL Web App-nya langsung di browser (GET, bukan lewat
// aplikasi) sambil nambahin "?secret=SECRET_KAMU" di ujungnya, contoh:
//   https://script.google.com/macros/s/XXXXX/exec?secret=punyaku123
// Itu bakal nampilin JSON isi mentah baris-baris pertama tab-nya (termasuk
// whitespace tersembunyi) plus lokasi persis "Kode Fasil"/"Hari ke"/"Analisis"
// ketemu di mana - jauh lebih cepat daripada nebak-nebak.
//
// PENTING kalau spreadsheet ini SUDAH punya Apps Script lain sebelumnya:
// semua file .gs dalam satu project Apps Script berbagi satu namespace global -
// nama variabel/fungsi di file ini sudah diberi prefix "SAVE_ANALISIS_" biar
// kecil kemungkinan bentrok, TAPI fungsi "doPost" tidak bisa di-prefix (itu nama
// khusus yang wajib persis "doPost" supaya Web App bisa menerima POST). Satu
// project Apps Script cuma boleh punya SATU doPost. Sebelum tempel file ini:
//   - Cek dulu apakah script yang sudah ada punya fungsi "doPost" (cari di semua
//     file .gs yang ada). Kalau TIDAK ada -> aman, tinggal tambah file baru ini.
//   - Kalau SUDAH ada doPost lain (berarti sudah dipakai buat Web App lain) ->
//     JANGAN ditempel apa adanya, nanti bentrok/salah satu ke-timpa. Pilihannya:
//     (a) gabungkan logic di bawah ke dalam doPost yang sudah ada, dibedakan lewat
//         semacam field "action" di body request, atau
//     (b) deploy file ini sebagai project Apps Script BARU yang berdiri sendiri
//         (bikin dari script.google.com atau script.new, bukan lewat Extensions >
//         Apps Script dari spreadsheet ini), lalu ganti baris
//         "SpreadsheetApp.getActiveSpreadsheet()" di bawah jadi
//         "SpreadsheetApp.openById('ID_SPREADSHEET_DI_SINI')" supaya tetap bisa
//         akses spreadsheet yang sama walau scriptnya terpisah.

var SAVE_ANALISIS_SHEET_NAME = "Level Fasil";
var SAVE_ANALISIS_SECRET = "GANTI_DENGAN_SECRET_RAHASIA_MILIKMU";

// Bersihin whitespace/tipe data sebelum dibandingkan - sel header hasil
// copy-paste sering kebawa spasi tersembunyi di depan/belakang yang bikin
// exact-match "===" gagal walau kelihatannya identik di mata.
function saveAnalisisNormalize(v) {
  return String(v == null ? "" : v).trim();
}

function doGet(e) {
  var secret = e.parameter.secret;
  if (secret !== SAVE_ANALISIS_SECRET) {
    return saveAnalisisJsonResponse({ error: 'Secret tidak cocok/belum diisi. Tambahkan "?secret=SECRET_KAMU" di ujung URL.' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    return saveAnalisisJsonResponse({
      error:
        "SpreadsheetApp.getActiveSpreadsheet() kosong - script ini kemungkinan project STANDALONE (tidak nempel ke " +
        "spreadsheet manapun). Ganti baris itu jadi SpreadsheetApp.openById('ID_SPREADSHEET') - lihat komentar di atas.",
    });
  }

  var semuaTab = ss.getSheets().map(function (s) {
    return s.getName();
  });

  var sheet = ss.getSheetByName(SAVE_ANALISIS_SHEET_NAME);
  if (!sheet) {
    return saveAnalisisJsonResponse({
      error: 'Tab "' + SAVE_ANALISIS_SHEET_NAME + '" tidak ditemukan.',
      spreadsheetName: ss.getName(),
      spreadsheetUrl: ss.getUrl(),
      semuaTabYangAda: semuaTab,
    });
  }

  var values = sheet.getDataRange().getValues();
  var totalRows = values.length;
  var totalCols = totalRows > 0 ? values[0].length : 0;

  var previewBarisPertama = [];
  for (var r = 0; r < Math.min(10, totalRows); r++) {
    var row = [];
    for (var c = 0; c < Math.min(6, totalCols); c++) {
      row.push(JSON.stringify(values[r][c])); // JSON.stringify biar spasi/karakter tersembunyi kelihatan
    }
    previewBarisPertama.push({ baris: r + 1, nilai: row });
  }

  function cariDimanaSaja(target) {
    var hits = [];
    for (var rr = 0; rr < Math.min(15, totalRows); rr++) {
      for (var cc = 0; cc < totalCols; cc++) {
        if (saveAnalisisNormalize(values[rr][cc]) === target) hits.push({ baris: rr + 1, kolom: cc + 1, nilaiAsli: JSON.stringify(values[rr][cc]) });
      }
    }
    return hits;
  }

  return saveAnalisisJsonResponse({
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    semuaTabYangAda: semuaTab,
    tabDipakai: SAVE_ANALISIS_SHEET_NAME,
    totalBaris: totalRows,
    totalKolom: totalCols,
    previewBarisPertama_6kolom: previewBarisPertama,
    lokasiPersisSetelahTrim: {
      Atmin: cariDimanaSaja("Atmin"),
      "Kode Fasil": cariDimanaSaja("Kode Fasil"),
      "Hari ke": cariDimanaSaja("Hari ke"),
      Analisis: cariDimanaSaja("Analisis"),
    },
  });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SAVE_ANALISIS_SECRET) {
      return saveAnalisisJsonResponse({ error: "Secret tidak cocok." });
    }

    var items = body.items;
    if (!items || !items.length) {
      return saveAnalisisJsonResponse({ error: "items kosong." });
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAVE_ANALISIS_SHEET_NAME);
    if (!sheet) {
      return saveAnalisisJsonResponse({ error: 'Tab "' + SAVE_ANALISIS_SHEET_NAME + '" tidak ditemukan di spreadsheet ini.' });
    }

    var values = sheet.getDataRange().getValues();

    // Beberapa sheet punya baris filter/judul di atas baris header sebenarnya
    // (mis. baris "Pilih Nama Analis"). Cari baris yang kolom pertamanya (setelah
    // di-trim) "Atmin" - sama seperti stripToHeaderRow() di lib/sheet.ts aplikasi -
    // supaya tidak peduli berapa baris tambahan ada di atasnya.
    var headerRowIndex = -1;
    for (var i = 0; i < values.length; i++) {
      if (saveAnalisisNormalize(values[i][0]) === "Atmin") {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex === -1) {
      return saveAnalisisJsonResponse({
        error: 'Baris header (kolom pertama "Atmin") tidak ditemukan di tab ini. Buka Web App URL ini di browser (GET) + "?secret=..." untuk lihat detail isi sheet-nya.',
      });
    }

    var header = values[headerRowIndex].map(saveAnalisisNormalize);
    var kodeFasilCol = header.indexOf("Kode Fasil");
    var hariCol = header.indexOf("Hari ke");
    var analisisCol = header.indexOf("Analisis");
    if (kodeFasilCol === -1 || hariCol === -1 || analisisCol === -1) {
      return saveAnalisisJsonResponse({
        error: "Kolom Kode Fasil / Hari ke / Analisis tidak ditemukan di baris header.",
        barisHeaderTerpakai: headerRowIndex + 1,
        isiBarisHeader: values[headerRowIndex].map(function (v) {
          return JSON.stringify(v);
        }),
      });
    }

    var updated = 0;
    var notFound = [];

    items.forEach(function (item) {
      var found = false;
      for (var r = headerRowIndex + 1; r < values.length; r++) {
        var rowKode = String(values[r][kodeFasilCol]).trim();
        var hariMatch = String(values[r][hariCol]).match(/\d+/);
        var rowHari = hariMatch ? parseInt(hariMatch[0], 10) : null;
        if (rowKode === item.kodeFasil && rowHari === item.hari) {
          sheet.getRange(r + 1, analisisCol + 1).setValue(item.hasil);
          updated++;
          found = true;
          break;
        }
      }
      if (!found) notFound.push(item.kodeFasil + " Hari " + item.hari);
    });

    return saveAnalisisJsonResponse({ ok: true, updated: updated, notFound: notFound });
  } catch (err) {
    return saveAnalisisJsonResponse({ error: String(err) });
  }
}

function saveAnalisisJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

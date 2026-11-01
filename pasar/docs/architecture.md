# Arsitektur

Frontend HTML/CSS/JavaScript menggunakan API same-origin Express. Integrasi PIHPS dan Vleee berjalan di backend. PostgreSQL opsional untuk impor observasi historis; pencarian langsung tidak memerlukannya.

Controller memvalidasi input dan menggabungkan perbandingan parsial. Service menghitung harga hari terbaru dari observasi sumber. Harga berbeda satuan tidak digabungkan. Katalog wilayah PIHPS menentukan pilihan wilayah yang valid.

`shared-market-cache.js` menyediakan cache persisten satu proses, pembatasan ukuran, TTL, deduplikasi request bersamaan, dan fallback data lama bertanda. Timestamp sumber tidak diganti saat cache hit. Cache browser menghormati kedaluwarsa server; riwayat pribadi tetap lokal.

`provider-runtime.js` menghitung panggilan, sukses/gagal, konkurensi dan cooldown provider tanpa menyimpan isi prompt atau key. Pembatasan lokal tidak menyatakan kuota provider yang tersisa. Klien Vleee membaca SSE secara terbatas, menolak stream terpotong dan mencoba model cadangan pada kegagalan yang sesuai. Kegagalan autentikasi tidak dicoba berulang melalui model lain.

Tavily dihapus atas permintaan pemilik. AI tidak boleh menghasilkan nominal harga tanpa bukti sumber. Kemampuan penelusuran sumber dilaporkan secara jujur; jawaban model dan URL yang dikarang model bukan bukti.

API tidak menyimpan respons dalam cache HTTP; berkas static hanya berasal dari frontend. Error publik/log disanitasi, body dibatasi, request dibatasi per IP dan provider. Server default loopback. Untuk multi-instance, ganti cache berkas dengan penyimpanan bersama yang mendukung koordinasi.

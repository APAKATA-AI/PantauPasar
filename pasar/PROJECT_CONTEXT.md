# Konteks Pantau Pasar

Diperbarui 1 November 2026, Asia/Jakarta.

Kode berasal dari ZIP Sample Lomba (3), dikembangkan dalam folder pasar-umkm. Proyek ini terpisah dari pantaupasar prototipe lama dan MikroWatch produksi. Jangan deploy ke server MikroWatch.

Pemilik meminta penyempurnaan akurasi pencarian harga, provider Vleee, cache, dan UX. Keputusan terbaru: hapus Tavily, gunakan Vleee saja untuk AI. Kunci disimpan di .env lokal ignored; jangan dicetak, diarsipkan, atau dicommit.

PIHPS tetap sumber harga aktual resmi. Harga utama memakai hari observasi terakhir. Harga tidak boleh dikarang AI. Model utama dan cadangan menerima request SSE+JSON pada uji langsung; listing provider tidak mencantumkan kedua ID sehingga identitas model underlying belum dapat dipastikan.

Cache server persisten satu proses, bounded TTL/retention, metadata stale dan timestamp asli; riwayat pribadi tetap browser. Lokasi dari API katalog PIHPS. Health membedakan configured dan verified. UI terang/gelap, HP390 dan desktop1440 diuji dengan PIHPS nyata dan lokasi gagal. Lihat qa/ui-results.json.

Jalankan npm ci, npm test, npm start. Konfigurasi server default loopback. verify:providers memakai API nyata dan kuota akun. Jangan memasukkan .env/data/node_modules ke paket distribusi.

## Pengembangan data dan UI terbaru

48 tes otomatis lulus. Riwayat grafik mempertahankan observasi hingga30hari; nama field tren_7_hari_terakhir dipertahankan untuk kompatibilitas tetapi kini berisi seluruh seri sumber yang tersedia. Cache pencarian memakai versi baru agar seri terpotong lama tidak dipakai kembali.

Parameter bandingkan menerima maksimal dua kota dalam provinsi yang sama, dipisah titik koma. Frontend menyediakan disclosure kota pembanding. Cache browser/server membedakan kombinasi pembanding. Tidak ada keharusan memakai AI untuk memilih pembanding.

Tabel dan ekspor CSV mengikuti periode grafik. CSV menyertakan produk, provinsi, kota, satuan dan URL sumber, dengan pengamanan sel formula. Bukti nyata qa/data-workflow.json:20observasi dalam rentang30hari, perbandingan Surabaya–Kota Malang, unduhan CSV berhasil. Data dapat berubah sesudah pemeriksaan.

UI publication pass: Headings/navigation and advisor copy clarified. Chat has cancellation, retained question on failure, retry and success feedback. AI failures no longer silently become local rule answers. Updated source dialog accurately explains unsupported out-of-catalog prices. Calculator initial values labeled examples; profit labeled gross. Visual review4pages x2widths x2themes, error/retry and Escape dialog verified with mocked advisor; evidence qa/public-ui-results.json. Read-only source/private configuration are unchanged.

Revisi visual terbaru: pemilik menolak tampilan yang terlalu minimalis. Kedua tema kini memiliki komposisi pengantar dan formulir berdampingan, tombol komoditas, dan panel alat usaha yang lebih tegas. Tema terang krem/hijau/terakota; tema gelap biru tinta/mint. Sumber implementasi akhir frontend/css/market-design.css. Pertahankan arah ini saat melanjutkan. Uji terbaru di scripts/verify-design.cjs dan qa/design-ui-results.json mencakup tema tersimpan, fokus tombol komoditas, posisi judul terhadap header, empat halaman, serta kegagalan/retry advisor. Tab browser pemilik tidak dapat direfresh otomatis karena kontrol browser lokal dinonaktifkan; QA memakai browser headless terpisah.

Audit anti-slop lanjutan sudah diterapkan. Form bahan kini berada sebelum lokasi, pilihan cepat menandai pilihan aktif dan membatalkan request lama saat input berubah. Jangan kembalikan opsi autocomplete PIHPS lalu web: provider belum mendukungnya. Warna hasil tersimpan netral, stale/error tetap peringatan. QA meliputi 320/390/768/1440px, dua tema dan empat halaman, keyboard katalog/pembanding, 636 sampel kontras teks; semua lulus. 48 tes unit/backend serta pencarian PIHPS nyata lulus ulang. Lihat docs/UI_REVIEW_2026-11-01.md dan qa/antislop-results.json. Belum deploy publik.

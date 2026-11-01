# Pantau Pasar

Aplikasi pencarian harga dan perhitungan usaha UMKM. Versi ini dikembangkan dari `Sample Lomba (3).zip`, terpisah dari MikroWatch.

## Menjalankan

Gunakan Node.js 20 atau lebih baru:

```
npm ci
npm start
```

Buka http://localhost:3000. Server secara default hanya menerima koneksi komputer ini. Untuk jaringan lokal, atur `HOST=0.0.0.0` pada `.env`. Gunakan `npm run dev` untuk restart otomatis bawaan Node.

Salin `.env.example` ke `.env` bila belum tersedia. Isi `VLEEE_API_KEY` hanya di konfigurasi lokal. Jangan commit atau membagikan `.env`. PostgreSQL opsional; biarkan `DATABASE_ENABLED=false` untuk pencarian langsung tanpa database. Tavily dihapus sesuai permintaan pemilik.

## Data yang ditampilkan

- Komoditas, satuan, wilayah, dan observasi harga berasal dari PIHPS Bank Indonesia.
- Harga utama adalah rata-rata observasi pada **hari terbaru yang tersedia**, bukan rata-rata seluruh periode historis.
- Grafik memakai observasi asli; tanggal tanpa harga tidak diisi angka buatan.
- Daftar provinsi dan kota diambil dari katalog resmi. Lokasi yang tidak dikenal ditolak.
- Perbandingan yang hanya memiliki sebagian data diberi keterangan; harga dengan satuan berbeda tidak digabungkan.
- Vleee membantu memahami pertanyaan, mencocokkan komoditas katalog, dan memberi saran usaha. Jawaban AI saja tidak menjadi bukti harga aktual.
- Pencarian barang di luar katalog hanya boleh menampilkan penawaran apabila bukti sumber dapat diverifikasi. Tanpa kemampuan penelusuran sumber yang terverifikasi, aplikasi menjelaskan bahwa harga belum tersedia.

## Cache dan privasi

Cache bersama server berada di `data/market-cache.json`, maksimal 200 hasil/8 MiB. Data PIHPS segar selama satu jam, penawaran web selama 15 menit. Bila pembaruan gagal, hasil lama dapat ditampilkan dengan peringatan, maksimal tujuh hari tambahan untuk PIHPS atau satu hari untuk web. Waktu pengambilan dan tanggal sumber dipisahkan. Permintaan bersamaan untuk pencarian yang sama digabungkan. Tombol Perbarui dari sumber melewati hasil segar cache bersama.

Cache persisten ini mendukung **satu proses server**. Beberapa instance memerlukan penyimpanan bersama dengan koordinasi seperti Redis/PostgreSQL; jangan menunjuk beberapa worker ke berkas cache yang sama. Kegagalan penyimpanan beralih ke memori dan terlihat pada health.

Browser menyimpan maksimal 30 hasil dan lima riwayat pribadi. Riwayat pribadi tetap berada di browser masing-masing. Gangguan Local Storage tidak menggagalkan pencarian. Log tidak memuat isi pertanyaan, nama barang/lokasi mentah, body, atau kredensial. Cache dan konfigurasi tidak dapat diunduh melalui server static.

## Operasional

`GET /api/health` membedakan konfigurasi provider dari keberhasilan API yang benar-benar teramati, serta menampilkan status cache dan batas lokal provider. Status konfigurasi bukan jaminan model tertentu tersedia. Batas request lokal tidak mewakili sisa kuota atau tagihan akun provider.

Endpoint utama: `/api/market`, `/api/market/products`, `/api/market/regions`, `/api/calculator`, `/api/simulate`, dan `/api/advisor`. Pencarian mendukung `refresh=1`. API memakai respons `no-store`, pembatasan request, validasi input, dan batas body.

Variabel tambahan: `VLEEE_BASE_URL`, `VLEEE_MODEL`, `VLEEE_FALLBACK_MODEL`, `VLEEE_LOCAL_RPM`, `VLEEE_MAX_CONCURRENT`, `MARKET_CACHE_FILE`, `HOST`, dan `PORT`. ID model bawaan adalah konfigurasi yang harus diverifikasi terhadap provider.

## Pemeriksaan

```
npm test
npm run verify:providers
```

`verify:providers` melakukan panggilan nyata yang dapat memakai kuota Vleee, lalu hanya mencetak ringkasan aman. Penerimaan sebuah ID oleh endpoint tidak membuktikan identitas model di balik gateway. Pengujian fallback menggunakan kegagalan utama yang disimulasikan dan permintaan cadangan nyata.

`npm run test:ui` memerlukan Chrome dan Playwright. Atur `PLAYWRIGHT_PATH` ke modul Playwright bila tidak terpasang lokal, dan `QA_BASE_URL` bila server tidak menggunakan port 4186. Pengujian ini menggunakan PIHPS nyata; hasil dapat berubah sesuai ketersediaan sumber. Bukti pemeriksaan tersedia dalam `qa/`.

Sumber resmi: [PIHPS Bank Indonesia](https://www.bi.go.id/hargapangan/). Tidak ada deployment produksi yang dilakukan pada pekerjaan ini.

Pembaruan fungsi: pilihan grafik7/14/30hari kini memakai seluruh histori sumber yang tersedia. Buka Bandingkan dengan kota lain untuk maksimal dua pembanding di provinsi yang sama. Tabel observasi dan Unduh CSV tersedia melalui Lihat tabel dan unduh data di bawah grafik. Dokumentasi visual tersedia di DESIGN.md. Tes terbaru48lulus.

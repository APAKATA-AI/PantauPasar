Gunakan `database/schema.sql` sebagai skema awal pada instalasi lokal baru.
Untuk database yang sudah dibuat, terapkan file bernomor secara berurutan
dengan `psql -d pantau_pasar -f database/migrations/<nama-file>.sql`.
Migration `001_pihps_observations.sql` membuat skor confidence opsional dan
indeks unik untuk mencegah duplikasi saat impor PIHPS dijalankan berulang.
Migration `002_pihps_date_only_observations.sql` menormalkan observasi harian
PIHPS ke tanggal UTC tanpa menyiratkan waktu pengukuran yang tidak disediakan
sumber.
Jangan menaruh data harga uji di skema produksi.

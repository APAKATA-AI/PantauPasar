# Arah desain Pantau Pasar

Pembaruan 1 November 2026 memakai anti-slop-design. Pilihan arah: Warm Tactile untuk alat belanja UMKM, dengan hijau pangan sebagai warna tindakan yang dipertahankan dari produk.

Lima token dasar menggunakan variabel yang sudah ada: kanvas --cloud, permukaan --paper, aksi --primary, teks --ink/--slate, garis --line. Tema gelap mempertahankan makna token. Manrope untuk teks dan angka tabular; heading 36–48px, isi 14–16px. Form utama satu alur: provinsi/kota, barang, Cek harga. Kota pembanding disembunyikan dalam disclosure sampai diperlukan.

Preview harga ganda, strip sumber berulang dan bagian promosi tidak ditampilkan di halaman pencarian. Hasil memiliki satu angka utama, grafik periode tunggal, pembanding dan bukti sumber. Skor keyakinan visual kosong dihilangkan, keterbatasan sumber tetap tertulis. Tabel observasi dan CSV berada di bawah grafik dalam disclosure. Tidak ada angka sumber yang diisi untuk menutup tanggal kosong.

Grid 4/8px, panel minimal16px, kontrol sentuh minimal44px, fokus keyboard terlihat, dan reduced motion dihormati. Gerak masuk halaman/animasi dekorasi dinonaktifkan. Desktop mengikuti urutan pencarian → hasil → tindakan biaya; HP bertumpuk dan memakai navigasi bawah.

Penilaian mandiri 7 sumbu: anti-slop4, kecepatan UX4, tipografi4, jarak4, interaksi4, akses keyboard4, responsif4. Ini penilaian internal, bukan sertifikasi WCAG. Bukti browser pada390/1440 terang/gelap tanpa overflow/error; pembaca layar dan perangkat HP fisik belum diuji.

Publication UI pass:ENERGY2/RHYTHM2/MOTION1. Existing food-market green and Manrope retained. Form-first advisor layout with supporting context after it on mobile, DOM keyboard order follows visual order. Plain Indonesian headings describe the task directly. Chat loading, cancellation, explicit failure, retry, and success are visible. A failed AI request never becomes an unlabeled local answer. Question text remains until a complete answer is received. Advice privacy reminder describes inputs to avoid.

Delivery gate internal review: functionality verified by browser scenarios; no fabricated customer/usage claims; initial calculator values explicitly labeled examples; no unsupported promise of current web prices; four pages tested at390/1440px in both themes, no page overflow or JS errors. Advisor responses in UI regression are mocked and clearly recorded as such, not evidence of live answer quality. Keyboard Escape dialog tested. Seven-axis self-review scores4/5 each; not a WCAG certification or proof of public hosting readiness.

## Revisi visual sesuai arahan pemilik

Pemilik meminta perubahan tampilan yang terlihat jelas dan tidak terlalu minimalis. Revisi ini menggantikan arah visual sebelumnya: ENERGY3/RHYTHM2/MOTION1. Tema terang memakai krem hangat, hijau kebiruan dan aksen terakota; tema malam memakai biru tinta, panel biru bertingkat dan aksi hijau mint. Makna warna tindakan tetap konsisten di seluruh halaman.

Halaman harga memakai pengantar dengan tipografi kuat di sebelah panel pencarian. Empat pilihan komoditas merupakan tombol nyata yang mengisi formulir, bukan kartu statistik dekoratif. Tautan alat usaha berada setelah pencarian. Panel harga, grafik, biaya bahan, hasil margin dan percakapan mendapat pemisahan permukaan yang lebih jelas. HP menumpuk pengantar dan formulir dengan navigasi bawah; urutan elemen tetap mengikuti alur baca. Tidak ada harga contoh baru atau klaim sumber tambahan.

Implementasi utama berada di frontend/css/market-design.css, dimuat paling akhir untuk menjaga kompatibilitas dengan komponen lama. Screenshot design-*.png menunjukkan implementasi aktual. Uji empat halaman pada 390/1440px dalam kedua tema lulus tanpa overflow atau error JavaScript. Judul tidak tertutup header, tombol komoditas memindahkan fokus ke input, pilihan tema bertahan setelah reload, dialog dapat ditutup dengan Escape, dan saran gagal dapat dicoba kembali. Evaluasi internal bukan sertifikasi aksesibilitas atau bukti kesiapan hosting publik.

## Koreksi anti-slop lanjutan

Pengantar kini menyebut tugas secara langsung: Cek harga bahan sebelum belanja. Pilihan komoditas berada di bawah input, memakai aria-pressed dan garis bawah untuk keadaan terpilih. Warna kategori dekoratif serta tombol pencarian kedua di header dihapus. Sumber tetap terlihat di HP. Formulir memakai urutan bahan, pilihan cepat, wilayah, lalu pencarian. Riwayat kosong tidak mengambil ruang. Kontras border kontrol diperkuat melalui --control-line tanpa mengeraskan semua garis pemisah.

Percakapan kosong tidak lagi memaksa tinggi minimum. Kalkulator bertumpuk pada layar kecil. Notifikasi data tersimpan memakai permukaan netral; data kedaluwarsa atau kegagalan pembaruan tetap diberi peringatan. Janji pencarian web pada autocomplete dihapus karena kemampuan itu belum tersedia. ENERGY3/RHYTHM2/MOTION1 tetap berlaku. Alasan keputusan, temuan, bukti dan batas pemeriksaan tersedia di docs/UI_REVIEW_2026-11-01.md.

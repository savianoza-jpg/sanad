# Sanad

**Sistem Laporan Perkembangan Ngaji Privat.**

| Halaman | Alamat |
|---|---|
| Penjelasan sistem | https://savianoza-jpg.github.io/sanad/ |
| Aplikasi ustadzah | https://savianoza-jpg.github.io/sanad/app/ |
| Halaman orang tua | https://savianoza-jpg.github.io/sanad/anak/?t=TOKEN |

## Isi

- `index.html` — landing page, penjelasan cara kerja sistem
- `app/` — aplikasi ustadzah: 9 menu, perlu login
- `anak/` — halaman orang tua: hanya baca, tanpa login, dibuka lewat token
- `sql/01-skema.sql` — skema database Supabase beserta aturan keamanannya
- `PANDUAN-PASANG.md` — cara memasang database, 4 langkah

## Cara memasang

Baca `PANDUAN-PASANG.md`. Ringkasnya: buat proyek Supabase, jalankan
`sql/01-skema.sql`, buat akun ustadzah, lalu isi `app/config.js`.

## Catatan

Tanpa build, tanpa framework — HTML, CSS, dan JavaScript biasa. Sunting
berkasnya, naikkan ke repo ini, GitHub Pages memperbarui sendiri 1–2 menit.

Kunci `anon` di `app/config.js` memang boleh publik; yang menjaga data adalah
aturan RLS di `sql/01-skema.sql`. Kunci `service_role` tidak boleh ada di repo ini.

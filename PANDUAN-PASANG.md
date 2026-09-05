# Sanad — cara memasang database

Empat langkah. Sekali saja, sesudah itu tidak diulang lagi.

---

## Langkah 1 — Buat proyek Supabase

Saya tidak boleh membuatkan akun, jadi bagian ini Bas sendiri:

1. Buka **supabase.com** → **Start your project** → masuk pakai akun GitHub `savianoza-jpg`
2. **New project**
   - Name: `sanad`
   - Database Password: **buat sandi baru, simpan sendiri** — jangan kirim ke saya, tidak dipakai aplikasi
   - Region: **Southeast Asia (Singapore)** — paling dekat dari Wajo
3. Tunggu sekitar 2 menit sampai proyeknya hijau

---

## Langkah 2 — Jalankan skema database

1. Di Supabase, buka menu kiri **SQL Editor** → **New query**
2. Buka berkas `sql/01-skema.sql`, salin **seluruh isinya**
3. Tempel ke SQL Editor → tekan **Run**
4. Berhasil kalau muncul `Success. No rows returned`

Skema ini aman dijalankan berulang kali kalau nanti perlu diulang.

---

## Langkah 3 — Buat akun masuk untuk ustadzah

1. Menu kiri **Authentication** → **Users** → **Add user** → **Create new user**
2. Isi email dan kata sandi ustadzah
3. Centang **Auto Confirm User** — kalau tidak dicentang, akunnya menunggu email konfirmasi dan tidak bisa dipakai masuk

---

## Langkah 4 — Sambungkan aplikasi

1. Menu kiri **Project Settings** → **Data API**
2. Salin dua hal:
   - **Project URL** → bentuknya `https://xxxxx.supabase.co`
   - **anon public** key → panjang, diawali `eyJ`
3. Kirim keduanya ke saya, atau tempel sendiri ke berkas `app/config.js`:

```js
window.SANAD = {
  url: "https://xxxxx.supabase.co",
  anonKey: "eyJ..."
};
```

4. Naikkan ulang ke GitHub, tunggu 1–2 menit

---

## Soal keamanan — dua kunci, jangan tertukar

| Kunci | Boleh publik? | Dipakai untuk |
|---|---|---|
| **anon public** | **Ya** | Ditaruh di `app/config.js`. Memang dirancang untuk dilihat orang. Tanpa login, kunci ini tidak membuka satu baris pun karena dijaga aturan RLS. |
| **service_role** | **TIDAK** | Melewati semua aturan keamanan. Jangan tempel ke berkas mana pun, jangan kirim ke siapa pun — termasuk ke saya. |

Kalau `service_role` pernah terlanjur tersebar: Supabase → Project Settings → Data API → **Reset**.

---

## Sesudah terpasang

| Halaman | Alamat | Siapa yang buka |
|---|---|---|
| Penjelasan sistem | `savianoza-jpg.github.io/sanad/` | siapa saja |
| Aplikasi ustadzah | `savianoza-jpg.github.io/sanad/app/` | ustadzah, pakai email + sandi |
| Halaman anak | `savianoza-jpg.github.io/sanad/anak/?t=…` | orang tua, tanpa login |

Urutan pertama kali pakai:

1. Masuk ke `/app/` pakai akun langkah 3
2. Menu **Pengaturan** — isi nama ustadzah, nama lembaga, harga program
3. Menu **Santri** — tambah santri, pilih programnya, isi nomor WhatsApp orang tua
4. Menu **Orang Tua** — kirim link ke tiap orang tua, sekali saja
5. Mulai membuat laporan setiap selesai mengajar

---

## Batas gratis Supabase

- Database 500 MB — cukup untuk puluhan ribu baris laporan
- **Proyek gratis dijeda kalau tidak disentuh 7 hari berturut-turut.** Selama dipakai harian tidak akan kena. Kalau sempat terjeda, buka dashboard Supabase dan tekan Restore — datanya tidak hilang.

-- =====================================================================
--  SANAD — Skema database
--  Tempel SELURUH isi berkas ini ke Supabase → SQL Editor → Run.
--  Aman dijalankan berulang kali (semua pakai "if not exists").
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABEL SANTRI
-- ---------------------------------------------------------------------
create table if not exists santri (
  id                uuid primary key default gen_random_uuid(),
  nama              text not null,
  wali_nama         text,
  wali_wa           text,                       -- nomor WhatsApp orang tua, format 628xxx
  program_iqro      boolean not null default false,
  program_tahfidz   boolean not null default false,
  jilid_sekarang    smallint,                   -- 1..6, untuk santri Iqro
  halaman_sekarang  smallint,                   -- halaman terakhir yang dicapai
  target_juz        numeric(4,2),               -- capaian hafalan terakhir, mis. 0.5 atau 3
  jadwal_hari       text,                       -- mis. 'Sabtu'
  jadwal_jam        text,                       -- mis. '16.00'
  biaya_bulanan     integer default 0,
  catatan           text,
  token             uuid not null default gen_random_uuid(),  -- kunci link orang tua
  aktif             boolean not null default true,
  dibuat            timestamptz not null default now()
);

create unique index if not exists santri_token_idx on santri (token);
create index if not exists santri_aktif_idx on santri (aktif);

-- ---------------------------------------------------------------------
-- 2. TABEL LAPORAN PERTEMUAN
-- ---------------------------------------------------------------------
create table if not exists laporan (
  id                uuid primary key default gen_random_uuid(),
  santri_id         uuid not null references santri(id) on delete cascade,
  tanggal           date not null default current_date,
  hadir             boolean not null default true,

  -- diisi kalau TIDAK hadir
  alasan            text,
  jadwal_pengganti  text,

  -- program Iqro
  jilid             smallint,
  hal_awal          smallint,
  hal_akhir         smallint,

  -- program Tahfidz
  surah_baru        text,
  ayat_baru_awal    smallint,
  ayat_baru_akhir   smallint,
  surah_murojaah    text,
  ayat_mur_awal     smallint,
  ayat_mur_akhir    smallint,

  -- penilaian 1..5 bintang
  nilai_kelancaran  smallint,
  nilai_fokus       smallint,
  nilai_tajwid      smallint,

  pr                text,
  catatan           text,
  terkirim          boolean not null default false,   -- sudah dikirim ke WA?
  dibuat            timestamptz not null default now()
);

create index if not exists laporan_santri_idx  on laporan (santri_id, tanggal desc);
create index if not exists laporan_tanggal_idx on laporan (tanggal desc);

-- ---------------------------------------------------------------------
-- 3. TABEL UJIAN KENAIKAN
--    capaian Iqro   : 'jilid2'..'jilid6', 'khatam'
--    capaian Tahfidz: '0.25','0.5','1','5','10','15','20','25','30'
-- ---------------------------------------------------------------------
create table if not exists ujian (
  id          uuid primary key default gen_random_uuid(),
  santri_id   uuid not null references santri(id) on delete cascade,
  program     text not null check (program in ('iqro','tahfidz')),
  capaian     text not null,
  tanggal     date,
  nilai       text check (nilai in ('Mumtaz','Jayyid Jiddan','Jayyid','Rosib')),
  catatan     text,
  dibuat      timestamptz not null default now()
);

create unique index if not exists ujian_unik_idx on ujian (santri_id, program, capaian);

-- ---------------------------------------------------------------------
-- 4. TABEL PEMBAYARAN
--    satu baris per santri per bulan, periode format '2026-09'
-- ---------------------------------------------------------------------
create table if not exists pembayaran (
  id            uuid primary key default gen_random_uuid(),
  santri_id     uuid not null references santri(id) on delete cascade,
  periode       text not null,
  nominal       integer not null default 0,
  jatuh_tempo   date,
  lunas         boolean not null default false,
  tanggal_bayar date,
  dibuat        timestamptz not null default now()
);

create unique index if not exists pembayaran_unik_idx on pembayaran (santri_id, periode);
create index if not exists pembayaran_lunas_idx on pembayaran (lunas);

-- ---------------------------------------------------------------------
-- 5. TABEL PENGATURAN (hanya satu baris, id selalu 1)
-- ---------------------------------------------------------------------
create table if not exists pengaturan (
  id                integer primary key default 1 check (id = 1),
  nama_ustadzah     text default 'Ustadzah',
  nama_lembaga      text default 'Sanad',
  harga_iqro        integer default 0,
  harga_tahfidz     integer default 0,
  template_laporan  text,
  template_jadwal   text,
  template_tagihan  text,
  template_lulus    text
);

insert into pengaturan (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 6. KEAMANAN (Row Level Security)
--
--    Aturannya sederhana dan ketat:
--      • Ustadzah yang sudah login  -> boleh baca & ubah SEMUA.
--      • Pengunjung tanpa login     -> TIDAK boleh menyentuh tabel apa pun.
--        Orang tua tetap bisa melihat data anaknya, tetapi HANYA lewat
--        fungsi lihat_anak() di bagian 7 — bukan lewat tabel langsung.
--
--    Ini sebabnya kunci "anon key" boleh ditaruh di repo publik:
--    tanpa login, kunci itu tidak membuka satu baris pun.
-- ---------------------------------------------------------------------
alter table santri     enable row level security;
alter table laporan    enable row level security;
alter table ujian      enable row level security;
alter table pembayaran enable row level security;
alter table pengaturan enable row level security;

drop policy if exists ustadzah_santri     on santri;
drop policy if exists ustadzah_laporan    on laporan;
drop policy if exists ustadzah_ujian      on ujian;
drop policy if exists ustadzah_pembayaran on pembayaran;
drop policy if exists ustadzah_pengaturan on pengaturan;

create policy ustadzah_santri on santri
  for all to authenticated using (true) with check (true);
create policy ustadzah_laporan on laporan
  for all to authenticated using (true) with check (true);
create policy ustadzah_ujian on ujian
  for all to authenticated using (true) with check (true);
create policy ustadzah_pembayaran on pembayaran
  for all to authenticated using (true) with check (true);
create policy ustadzah_pengaturan on pengaturan
  for all to authenticated using (true) with check (true);

-- Hak akses tabel dipertegas: ustadzah boleh, pengunjung tanpa login tidak.
-- (RLS sudah menutup, ini lapis kedua supaya tidak bergantung pada bawaan.)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete
  on santri, laporan, ujian, pembayaran, pengaturan to authenticated;
revoke all on santri, laporan, ujian, pembayaran, pengaturan from anon;

-- ---------------------------------------------------------------------
-- 7. PINTU KHUSUS ORANG TUA
--
--    Satu fungsi, satu pintu. Orang tua mengirim token dari link,
--    fungsi mengembalikan data SATU anak saja — tanpa login, tanpa
--    kemampuan mengubah apa pun, dan tanpa bisa mengintip santri lain.
--    Token berupa uuid acak (2^122 kemungkinan), tidak bisa ditebak.
-- ---------------------------------------------------------------------
create or replace function lihat_anak(t uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  with anak as (
    select * from santri where token = t and aktif = true
  )
  select case when not exists (select 1 from anak) then null else
    json_build_object(
      'santri', (
        select json_build_object(
          'nama', a.nama,
          'program_iqro', a.program_iqro,
          'program_tahfidz', a.program_tahfidz,
          'jilid_sekarang', a.jilid_sekarang,
          'halaman_sekarang', a.halaman_sekarang,
          'target_juz', a.target_juz,
          'jadwal_hari', a.jadwal_hari,
          'jadwal_jam', a.jadwal_jam
        ) from anak a
      ),
      'laporan', coalesce((
        select json_agg(x) from (
          select l.tanggal, l.hadir, l.alasan, l.jilid, l.hal_awal, l.hal_akhir,
                 l.surah_baru, l.ayat_baru_awal, l.ayat_baru_akhir,
                 l.surah_murojaah, l.ayat_mur_awal, l.ayat_mur_akhir,
                 l.nilai_kelancaran, l.nilai_fokus, l.nilai_tajwid, l.pr, l.catatan
          from laporan l where l.santri_id = (select id from anak)
          order by l.tanggal desc limit 10
        ) x
      ), '[]'::json),
      'ujian', coalesce((
        select json_agg(x) from (
          select u.program, u.capaian, u.tanggal, u.nilai, u.catatan
          from ujian u
          where u.santri_id = (select id from anak) and u.tanggal is not null
          order by u.tanggal desc
        ) x
      ), '[]'::json),
      'pembayaran', coalesce((
        select json_agg(x) from (
          select p.periode, p.nominal, p.jatuh_tempo, p.lunas
          from pembayaran p where p.santri_id = (select id from anak)
          order by p.periode desc limit 6
        ) x
      ), '[]'::json),
      'lembaga', (select nama_lembaga from pengaturan where id = 1),
      'ustadzah', (select nama_ustadzah from pengaturan where id = 1)
    )
  end;
$$;

revoke all on function lihat_anak(uuid) from public;
grant execute on function lihat_anak(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. RINGKASAN BERANDA (satu panggilan, bukan lima)
-- ---------------------------------------------------------------------
create or replace function ringkasan_beranda()
returns json
language sql
security invoker
stable
set search_path = public
as $$
  select json_build_object(
    'jumlah_santri', (select count(*) from santri where aktif),
    'belum_dilaporkan', coalesce((
      select json_agg(json_build_object('id', s.id, 'nama', s.nama))
      from santri s
      where s.aktif and not exists (
        select 1 from laporan l
        where l.santri_id = s.id and l.tanggal >= current_date - 7
      )
    ), '[]'::json),
    'belum_lunas', coalesce((
      select json_agg(json_build_object(
        'id', s.id, 'nama', s.nama, 'periode', p.periode,
        'nominal', p.nominal, 'jatuh_tempo', p.jatuh_tempo)
        order by p.jatuh_tempo nulls last)
      from pembayaran p join santri s on s.id = p.santri_id
      where not p.lunas and s.aktif
    ), '[]'::json),
    'tidak_hadir', coalesce((
      select json_agg(json_build_object(
        'id', s.id, 'nama', s.nama, 'tanggal', l.tanggal, 'alasan', l.alasan))
      from santri s
      join lateral (
        select * from laporan where santri_id = s.id order by tanggal desc limit 1
      ) l on true
      where s.aktif and not l.hadir
    ), '[]'::json)
  );
$$;

grant execute on function ringkasan_beranda() to authenticated;

-- =====================================================================
--  SELESAI. Kalau muncul "Success. No rows returned", berarti berhasil.
-- =====================================================================

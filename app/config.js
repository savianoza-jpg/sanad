// =====================================================================
//  SANAD — Sambungan ke Supabase
//
//  Isi dua baris di bawah dengan milik Bas sendiri.
//  Ambilnya di Supabase → Project Settings → Data API:
//
//    url      = "Project URL"        (bentuknya https://xxxxx.supabase.co)
//    anonKey  = "anon public" key    (panjang, diawali eyJ...)
//
//  ---------------------------------------------------------------------
//  BOLEHKAH KUNCI INI DITARUH DI REPO PUBLIK?  Boleh, dan memang begitu
//  cara pakainya. Kunci "anon" memang dirancang untuk dilihat orang.
//  Yang menjaga data adalah aturan RLS di berkas sql/01-skema.sql:
//  tanpa login, kunci ini tidak membuka satu baris pun.
//
//  YANG TIDAK BOLEH ditaruh di sini: kunci "service_role".
//  Kunci itu melewati semua aturan keamanan. Simpan sendiri, jangan
//  pernah tempel ke berkas mana pun di repo, dan jangan kirim ke siapa pun.
// =====================================================================

window.SANAD = {
  url: "",
  anonKey: ""
};

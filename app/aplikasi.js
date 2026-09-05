/* =====================================================================
   SANAD — mesin aplikasi ustadzah
   Tanpa build, tanpa framework. Hanya butuh config.js terisi.
   ===================================================================== */
(function () {
  "use strict";

  // ===================================================================
  // 1. ALAT BANTU
  // ===================================================================
  var $ = function (s, induk) { return (induk || document).querySelector(s); };
  var isi = $("#isi");

  function esc(t) {
    if (t === null || t === undefined) return "";
    return String(t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Tanggal lokal. JANGAN pakai toISOString() — itu memakai UTC dan di
  // Indonesia hasilnya mundur satu hari sesudah jam 07.00 pagi.
  function hariIni() {
    var d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function periodeIni() { return hariIni().slice(0, 7); }

  var NAMA_BULAN = ["Januari","Februari","Maret","April","Mei","Juni",
                    "Juli","Agustus","September","Oktober","November","Desember"];
  var NAMA_HARI = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];

  function tglPanjang(s) {
    if (!s) return "-";
    var b = String(s).split("-");
    if (b.length < 3) return s;
    var d = new Date(+b[0], +b[1] - 1, +b[2]);
    return NAMA_HARI[d.getDay()] + ", " + (+b[2]) + " " + NAMA_BULAN[+b[1] - 1] + " " + b[0];
  }
  function tglPendek(s) {
    if (!s) return "-";
    var b = String(s).split("-");
    if (b.length < 3) return s;
    return (+b[2]) + " " + NAMA_BULAN[+b[1] - 1].slice(0, 3) + " " + b[0];
  }
  function periodePanjang(p) {
    if (!p) return "-";
    var b = String(p).split("-");
    return NAMA_BULAN[+b[1] - 1] + " " + b[0];
  }
  function rupiah(n) {
    return "Rp " + (Number(n) || 0).toLocaleString("id-ID");
  }
  function bintangTeks(n) {
    n = Number(n) || 0;
    return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);
  }
  function nomorWa(no) {
    var d = String(no || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.charAt(0) === "0") d = "62" + d.slice(1);
    if (d.slice(0, 2) !== "62") d = "62" + d;
    return d;
  }

  // pesan melayang
  function kabar(teks, jenis) {
    var wadah = $("#kabar");
    var d = document.createElement("div");
    d.className = "kabar " + (jenis === "bad" ? "kabar-bad" : "kabar-ok");
    d.innerHTML = (jenis === "bad"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4 10-10"/></svg>')
      + "<span>" + esc(teks) + "</span>";
    wadah.appendChild(d);
    setTimeout(function () { d.remove(); }, jenis === "bad" ? 6000 : 3500);
  }

  // kotak tanya (pengganti confirm bawaan)
  function tanya(judul, pesan, labelYa) {
    return new Promise(function (selesai) {
      var dlg = $("#dlg");
      $("#dlg-judul").textContent = judul;
      $("#dlg-pesan").textContent = pesan;
      $("#dlg-ya").textContent = labelYa || "Ya, lanjut";
      function tutup(hasil) {
        $("#dlg-ya").onclick = null;
        $("#dlg-batal").onclick = null;
        dlg.close();
        selesai(hasil);
      }
      $("#dlg-ya").onclick = function () { tutup(true); };
      $("#dlg-batal").onclick = function () { tutup(false); };
      dlg.showModal();
      $("#dlg-batal").focus();   // sorotan awal di Batal, bukan di tombol bahaya
    });
  }

  function memuat() {
    isi.innerHTML = '<div class="memuat"><span class="putar"></span> Memuat&hellip;</div>';
  }
  function kosong(pesan) {
    return '<div class="kosong">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3h9l4 4v14H6z"/><path d="M9 13h6M9 17h4"/></svg>' +
      '<p>' + esc(pesan) + '</p></div>';
  }

  // ===================================================================
  // 2. SAMBUNGAN SUPABASE
  // ===================================================================
  var cfg = window.SANAD || {};
  var sb = null;

  if (!cfg.url || !cfg.anonKey) {
    document.getElementById("layar-masuk").innerHTML =
      '<div class="kotak-masuk"><div class="masuk-kepala"><h1>Sanad</h1>' +
      '<p>Belum tersambung ke database</p></div><div class="masuk-isi">' +
      '<p style="font-size:.94rem;line-height:1.6">Berkas <b>app/config.js</b> masih kosong. ' +
      'Isi <b>url</b> dan <b>anonKey</b> dengan milik proyek Supabase Bas, lalu muat ulang halaman ini.</p>' +
      '<p class="bantuan">Ambil keduanya di Supabase &rarr; Project Settings &rarr; Data API.</p></div></div>';
    return;
  }
  sb = window.supabase.createClient(cfg.url, cfg.anonKey);

  // ===================================================================
  // 3. KEADAAN
  // ===================================================================
  var st = {
    pengguna: null,
    pengaturan: {},
    santri: [],
    terpilih: null      // id santri yang sedang dibuka di Laporan/Ujian
  };

  var BAWAAN = {
    template_laporan:
      "*Laporan Ngaji — {lembaga}*\n" +
      "Ananda: {nama}\n" +
      "{tanggal}\n\n" +
      "Kehadiran: {kehadiran}\n" +
      "{isi}\n" +
      "PR: {pr}\n" +
      "Catatan: {catatan}\n\n" +
      "— {ustadzah}",
    template_jadwal:
      "Assalamu'alaikum.\n" +
      "Mengingatkan jadwal ngaji ananda {nama}: {hari}, pukul {jam}.\n" +
      "Terima kasih.\n\n— {ustadzah}",
    template_tagihan:
      "Assalamu'alaikum.\n" +
      "Mengingatkan pembayaran ngaji ananda {nama} periode {periode} sebesar {nominal}.\n" +
      "Jatuh tempo: {jatuh_tempo}.\n" +
      "Terima kasih.\n\n— {ustadzah}",
    template_lulus:
      "Alhamdulillah 🎉\n" +
      "Ananda {nama} telah lulus ujian {capaian} dengan nilai {nilai}.\n" +
      "Sertifikatnya sudah bisa dilihat di halaman perkembangan ananda.\n" +
      "Barakallahu fiik.\n\n— {ustadzah}"
  };

  function atur(k) { return st.pengaturan[k] || BAWAAN[k] || ""; }

  function isiTemplate(teks, data) {
    return String(teks).replace(/\{(\w+)\}/g, function (cocok, kunci) {
      return (data[kunci] === undefined || data[kunci] === null) ? "" : String(data[kunci]);
    });
  }

  function bukaWa(nomor, teks) {
    var n = nomorWa(nomor);
    if (!n) { kabar("Nomor WhatsApp orang tua belum diisi di menu Santri.", "bad"); return; }
    window.open("https://wa.me/" + n + "?text=" + encodeURIComponent(teks), "_blank", "noopener");
  }

  // ===================================================================
  // 4. CAPAIAN UJIAN
  // ===================================================================
  var CAPAIAN_IQRO = [
    { kode: "jilid2", label: "Naik Jilid 2", tanda: "2" },
    { kode: "jilid3", label: "Naik Jilid 3", tanda: "3" },
    { kode: "jilid4", label: "Naik Jilid 4", tanda: "4" },
    { kode: "jilid5", label: "Naik Jilid 5", tanda: "5" },
    { kode: "jilid6", label: "Naik Jilid 6", tanda: "6" },
    { kode: "khatam", label: "Khatam Iqro", tanda: "✦" }
  ];
  var CAPAIAN_TAHFIDZ = [
    { kode: "0.25", label: "¼ juz", tanda: "¼" },
    { kode: "0.5",  label: "½ juz", tanda: "½" },
    { kode: "1",  label: "1 juz",  tanda: "1" },
    { kode: "5",  label: "5 juz",  tanda: "5" },
    { kode: "10", label: "10 juz", tanda: "10" },
    { kode: "15", label: "15 juz", tanda: "15" },
    { kode: "20", label: "20 juz", tanda: "20" },
    { kode: "25", label: "25 juz", tanda: "25" },
    { kode: "30", label: "30 juz", tanda: "30" }
  ];
  var NILAI = ["Mumtaz", "Jayyid Jiddan", "Jayyid", "Rosib"];

  // ===================================================================
  // 5. MASUK / KELUAR
  // ===================================================================
  var formMasuk = $("#form-masuk");
  formMasuk.addEventListener("submit", function (e) {
    e.preventDefault();
    var tombol = $("#masuk-tombol");
    var galat = $("#masuk-galat");
    galat.hidden = true;
    tombol.disabled = true;
    tombol.textContent = "Memeriksa…";
    sb.auth.signInWithPassword({
      email: $("#masuk-email").value.trim(),
      password: $("#masuk-sandi").value
    }).then(function (r) {
      tombol.disabled = false;
      tombol.textContent = "Masuk";
      if (r.error) {
        galat.textContent = r.error.message === "Invalid login credentials"
          ? "Email atau kata sandi tidak cocok."
          : "Gagal masuk: " + r.error.message;
        galat.hidden = false;
        return;
      }
      mulai(r.data.user);
    });
  });

  $("#tombol-keluar").addEventListener("click", function () {
    tanya("Keluar dari Sanad?", "Bas perlu memasukkan email dan kata sandi lagi nanti.", "Keluar")
      .then(function (ya) {
        if (!ya) return;
        sb.auth.signOut().then(function () { location.reload(); });
      });
  });

  // ===================================================================
  // 6. LACI MENU (layar kecil)
  // ===================================================================
  var laci = $("#laci"), tirai = $("#tirai"), tombolLaci = $("#buka-laci");
  function setLaci(buka) {
    laci.classList.toggle("buka", buka);
    tirai.classList.toggle("buka", buka);
    tombolLaci.setAttribute("aria-expanded", buka ? "true" : "false");
  }
  tombolLaci.addEventListener("click", function () { setLaci(!laci.classList.contains("buka")); });
  tirai.addEventListener("click", function () { setLaci(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setLaci(false); });

  // ===================================================================
  // 7. MEMUAT DATA AWAL
  // ===================================================================
  function muatSantri() {
    return sb.from("santri").select("*").eq("aktif", true).order("nama")
      .then(function (r) {
        if (r.error) throw r.error;
        st.santri = r.data || [];
      });
  }
  function muatPengaturan() {
    return sb.from("pengaturan").select("*").eq("id", 1).single()
      .then(function (r) { st.pengaturan = r.data || {}; });
  }
  function cariSantri(id) {
    for (var i = 0; i < st.santri.length; i++) if (st.santri[i].id === id) return st.santri[i];
    return null;
  }
  function programTeks(s) {
    var p = [];
    if (s.program_iqro) p.push("Iqro");
    if (s.program_tahfidz) p.push("Tahfidz");
    return p.length ? p.join(" + ") : "belum diatur";
  }

  function mulai(pengguna) {
    st.pengguna = pengguna;
    $("#layar-masuk").style.display = "none";
    $("#layar-app").classList.add("tampil");
    $("#nama-user").textContent = pengguna.email;
    memuat();
    Promise.all([muatPengaturan(), muatSantri()])
      .then(function () { rute(); segarkanLencana(); })
      .catch(function (e) {
        isi.innerHTML = kosong("Gagal memuat data: " + e.message +
          ". Pastikan skema SQL sudah dijalankan di Supabase.");
      });
  }

  function segarkanLencana() {
    sb.rpc("ringkasan_beranda").then(function (r) {
      if (r.error || !r.data) return;
      var d = r.data;
      var l1 = $("#lencana-beranda"), n1 = (d.belum_dilaporkan || []).length + (d.tidak_hadir || []).length;
      l1.textContent = n1; l1.hidden = n1 === 0;
      var l2 = $("#lencana-bayar"), n2 = (d.belum_lunas || []).length;
      l2.textContent = n2; l2.hidden = n2 === 0;
    });
  }

  // ===================================================================
  // 8. PENGARAH HALAMAN
  // ===================================================================
  var HALAMAN = {
    beranda: halBeranda, santri: halSantri, laporan: halLaporan, ujian: halUjian,
    progress: halProgress, orangtua: halOrangTua, wa: halWa,
    pembayaran: halPembayaran, pengaturan: halPengaturan
  };

  function rute() {
    var h = (location.hash || "#/beranda").replace(/^#\//, "");
    var bagian = h.split("/");
    var nama = bagian[0] || "beranda";
    if (!HALAMAN[nama]) nama = "beranda";
    var tautan = document.querySelectorAll(".menu-nav a");
    for (var i = 0; i < tautan.length; i++) {
      tautan[i].classList.toggle("aktif", tautan[i].getAttribute("data-menu") === nama);
    }
    setLaci(false);
    window.scrollTo(0, 0);
    memuat();
    HALAMAN[nama](bagian[1]);
  }
  window.addEventListener("hashchange", rute);

  // ===================================================================
  // 9. HALAMAN: BERANDA
  // ===================================================================
  function halBeranda() {
    sb.rpc("ringkasan_beranda").then(function (r) {
      if (r.error) { isi.innerHTML = kosong("Gagal memuat ringkasan: " + r.error.message); return; }
      var d = r.data || {};
      var belumLapor = d.belum_dilaporkan || [];
      var belumBayar = d.belum_lunas || [];
      var tdkHadir = d.tidak_hadir || [];

      var h = '<div class="judul-bagian"><div><p class="eyebrow">' + esc(tglPanjang(hariIni())) + '</p>' +
        '<h1>Beranda</h1></div></div>';

      h += '<div class="ubin-baris">' +
        '<div class="ubin aman"><b>' + (d.jumlah_santri || 0) + '</b><span>santri aktif</span></div>' +
        '<div class="ubin ' + (belumLapor.length ? "perlu" : "aman") + '"><b>' + belumLapor.length + '</b><span>belum dilaporkan 7 hari</span></div>' +
        '<div class="ubin ' + (belumBayar.length ? "perlu" : "aman") + '"><b>' + belumBayar.length + '</b><span>belum lunas</span></div>' +
        '<div class="ubin ' + (tdkHadir.length ? "perlu" : "aman") + '"><b>' + tdkHadir.length + '</b><span>tidak hadir terakhir</span></div>' +
        '</div>';

      function daftar(judul, arr, buatBaris) {
        if (!arr.length) return "";
        var x = '<h2 style="margin:26px 0 12px">' + esc(judul) + '</h2><div class="daftar-tindak">';
        arr.forEach(function (b) { x += buatBaris(b); });
        return x + "</div>";
      }

      h += daftar("Belum dilaporkan", belumLapor, function (b) {
        return '<div class="tindak"><div class="isi"><b>' + esc(b.nama) + '</b>' +
          '<span>belum ada laporan dalam 7 hari terakhir</span></div>' +
          '<a class="btn btn-primary btn-kecil" href="#/laporan/' + esc(b.id) + '">Buat laporan</a></div>';
      });

      h += daftar("Tidak hadir pada pertemuan terakhir", tdkHadir, function (b) {
        return '<div class="tindak"><div class="isi"><b>' + esc(b.nama) + '</b>' +
          '<span>' + esc(tglPendek(b.tanggal)) + (b.alasan ? " &middot; " + esc(b.alasan) : "") + '</span></div>' +
          '<a class="btn btn-ghost btn-kecil" href="#/laporan/' + esc(b.id) + '">Buka</a></div>';
      });

      h += daftar("Pembayaran belum lunas", belumBayar, function (b) {
        return '<div class="tindak"><div class="isi"><b>' + esc(b.nama) + '</b>' +
          '<span class="num">' + esc(periodePanjang(b.periode)) + ' &middot; ' + rupiah(b.nominal) +
          (b.jatuh_tempo ? " &middot; jatuh tempo " + esc(tglPendek(b.jatuh_tempo)) : "") + '</span></div>' +
          '<a class="btn btn-ghost btn-kecil" href="#/pembayaran">Buka</a></div>';
      });

      if (!belumLapor.length && !belumBayar.length && !tdkHadir.length) {
        h += '<div class="kartu" style="margin-top:22px;display:flex;gap:14px;align-items:center">' +
          '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--green)" stroke-width="2"><path d="m5 12 4 4 10-10"/></svg>' +
          '<div><b>Semua beres hari ini.</b><p style="font-size:.9rem;color:var(--muted)">' +
          'Tidak ada laporan tertunda, tidak ada tunggakan, semua hadir.</p></div></div>';
      }
      isi.innerHTML = h;
    });
  }

  // ===================================================================
  // 10. HALAMAN: SANTRI
  // ===================================================================
  function halSantri() {
    var h = '<div class="judul-bagian"><div><p class="eyebrow">Data</p><h1>Santri</h1></div>' +
      '<button class="btn btn-primary" id="tambah-santri" type="button">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>' +
      'Tambah santri</button></div>';

    h += '<div id="wadah-form"></div>';

    if (!st.santri.length) {
      h += kosong("Belum ada santri. Tekan “Tambah santri” untuk memulai — pilih programnya, karena pilihan itu yang menentukan bentuk form laporan dan daftar ujiannya.");
    } else {
      h += '<div class="tabel-bungkus"><table><thead><tr>' +
        '<th>Nama</th><th>Program</th><th>Posisi</th><th>Jadwal</th><th>Orang tua</th><th></th>' +
        '</tr></thead><tbody>';
      st.santri.forEach(function (s) {
        var posisi = [];
        if (s.program_iqro && s.jilid_sekarang) posisi.push("Jilid " + s.jilid_sekarang + (s.halaman_sekarang ? " hal. " + s.halaman_sekarang : ""));
        if (s.program_tahfidz && s.target_juz) posisi.push(Number(s.target_juz) + " juz");
        h += '<tr><td><b>' + esc(s.nama) + '</b></td>' +
          '<td>' + esc(programTeks(s)) + '</td>' +
          '<td class="num">' + (posisi.length ? esc(posisi.join(" · ")) : "—") + '</td>' +
          '<td class="num">' + (s.jadwal_hari ? esc(s.jadwal_hari + " " + (s.jadwal_jam || "")) : "—") + '</td>' +
          '<td>' + (s.wali_nama ? esc(s.wali_nama) : "—") + '<br><span class="num" style="font-size:.8rem;color:var(--muted)">' + esc(s.wali_wa || "") + '</span></td>' +
          '<td class="aksi">' +
          '<button class="btn btn-ghost btn-kecil" data-ubah="' + esc(s.id) + '" type="button">Ubah</button> ' +
          '<button class="btn btn-ghost btn-kecil" data-tutup="' + esc(s.id) + '" type="button">Tutup</button>' +
          '</td></tr>';
      });
      h += "</tbody></table></div>";
      h += '<p class="bantuan" style="margin-top:12px">“Tutup” menyembunyikan santri dari daftar tanpa menghapus riwayat laporan dan ujiannya.</p>';
    }
    isi.innerHTML = h;

    $("#tambah-santri").onclick = function () { formSantri(null); };
    isi.querySelectorAll("[data-ubah]").forEach(function (b) {
      b.onclick = function () { formSantri(cariSantri(b.getAttribute("data-ubah"))); };
    });
    isi.querySelectorAll("[data-tutup]").forEach(function (b) {
      b.onclick = function () {
        var s = cariSantri(b.getAttribute("data-tutup"));
        tanya("Tutup " + s.nama + "?", "Namanya hilang dari daftar, tetapi seluruh laporan, ujian, dan pembayarannya tetap tersimpan.", "Tutup")
          .then(function (ya) {
            if (!ya) return;
            sb.from("santri").update({ aktif: false }).eq("id", s.id).then(function (r) {
              if (r.error) { kabar(r.error.message, "bad"); return; }
              kabar(s.nama + " ditutup.");
              muatSantri().then(rute);
            });
          });
      };
    });
  }

  function formSantri(s) {
    var baru = !s;
    s = s || {};
    var w = $("#wadah-form");
    w.innerHTML = '<div class="kartu" style="margin-bottom:20px">' +
      '<h2 style="margin-bottom:16px">' + (baru ? "Santri baru" : "Ubah " + esc(s.nama)) + '</h2>' +
      '<form id="f-santri" class="baris">' +
        '<div class="baris baris-2">' +
          '<label class="isian"><span>Nama santri</span><input id="s-nama" value="' + esc(s.nama || "") + '" required></label>' +
          '<label class="isian"><span>Nama orang tua</span><input id="s-wali" value="' + esc(s.wali_nama || "") + '"></label>' +
        '</div>' +
        '<div class="baris baris-2">' +
          '<label class="isian"><span>Nomor WhatsApp orang tua</span><input id="s-wa" inputmode="numeric" placeholder="08xxxxxxxxxx" value="' + esc(s.wali_wa || "") + '"><span class="bantuan">Dipakai untuk mengirim laporan dan pengingat.</span></label>' +
          '<label class="isian"><span>Biaya per bulan</span><input id="s-biaya" type="number" min="0" step="1000" value="' + (s.biaya_bulanan || 0) + '"></label>' +
        '</div>' +
        '<fieldset style="border:1px solid var(--line);border-radius:var(--r-md);padding:14px">' +
          '<legend style="font-size:.82rem;font-weight:600;padding:0 6px">Program belajar</legend>' +
          '<div class="pilih-hadir">' +
            '<label><input type="checkbox" id="s-iqro"' + (s.program_iqro ? " checked" : "") + '> Iqro</label>' +
            '<label><input type="checkbox" id="s-tahfidz"' + (s.program_tahfidz ? " checked" : "") + '> Tahfidz</label>' +
          '</div>' +
          '<p class="bantuan">Pilihan ini yang menentukan bentuk form laporan dan daftar ujian santri.</p>' +
        '</fieldset>' +
        '<div class="baris baris-3">' +
          '<label class="isian"><span>Jilid sekarang</span><select id="s-jilid"><option value="">—</option>' +
            [1,2,3,4,5,6].map(function (j) { return '<option value="' + j + '"' + (Number(s.jilid_sekarang) === j ? " selected" : "") + '>Jilid ' + j + '</option>'; }).join("") +
          '</select></label>' +
          '<label class="isian"><span>Halaman terakhir</span><input id="s-hal" type="number" min="1" max="35" value="' + (s.halaman_sekarang || "") + '"></label>' +
          '<label class="isian"><span>Hafalan (juz)</span><input id="s-juz" type="number" min="0" max="30" step="0.25" value="' + (s.target_juz || "") + '"></label>' +
        '</div>' +
        '<div class="baris baris-2">' +
          '<label class="isian"><span>Hari halaqah</span><select id="s-hari"><option value="">—</option>' +
            NAMA_HARI.map(function (d) { return '<option' + (s.jadwal_hari === d ? " selected" : "") + '>' + d + '</option>'; }).join("") +
          '</select></label>' +
          '<label class="isian"><span>Jam</span><input id="s-jam" placeholder="16.00" value="' + esc(s.jadwal_jam || "") + '"></label>' +
        '</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<button class="btn btn-primary" type="submit">Simpan</button>' +
          '<button class="btn btn-ghost" type="button" id="s-batal">Batal</button>' +
        '</div>' +
      '</form></div>';

    $("#s-nama").focus();
    $("#s-batal").onclick = function () { w.innerHTML = ""; };

    $("#f-santri").onsubmit = function (e) {
      e.preventDefault();
      var data = {
        nama: $("#s-nama").value.trim(),
        wali_nama: $("#s-wali").value.trim() || null,
        wali_wa: $("#s-wa").value.trim() || null,
        biaya_bulanan: Number($("#s-biaya").value) || 0,
        program_iqro: $("#s-iqro").checked,
        program_tahfidz: $("#s-tahfidz").checked,
        jilid_sekarang: $("#s-jilid").value ? Number($("#s-jilid").value) : null,
        halaman_sekarang: $("#s-hal").value ? Number($("#s-hal").value) : null,
        target_juz: $("#s-juz").value ? Number($("#s-juz").value) : null,
        jadwal_hari: $("#s-hari").value || null,
        jadwal_jam: $("#s-jam").value.trim() || null
      };
      if (!data.program_iqro && !data.program_tahfidz) {
        kabar("Pilih dulu programnya: Iqro, Tahfidz, atau keduanya.", "bad"); return;
      }
      var kerja = baru
        ? sb.from("santri").insert(data)
        : sb.from("santri").update(data).eq("id", s.id);
      kerja.then(function (r) {
        if (r.error) { kabar(r.error.message, "bad"); return; }
        kabar(baru ? data.nama + " ditambahkan." : "Perubahan disimpan.");
        muatSantri().then(rute);
      });
    };
  }

  // ===================================================================
  // 11. HALAMAN: LAPORAN
  // ===================================================================
  function pemilihSantri(idTerpilih, saring) {
    var daftar = st.santri.filter(saring || function () { return true; });
    if (!daftar.length) return "";
    return '<select id="pilih-santri"><option value="">— pilih santri —</option>' +
      daftar.map(function (s) {
        return '<option value="' + esc(s.id) + '"' + (s.id === idTerpilih ? " selected" : "") +
          '>' + esc(s.nama) + " — " + esc(programTeks(s)) + '</option>';
      }).join("") + "</select>";
  }

  function halLaporan(idParam) {
    var id = idParam || st.terpilih;
    if (!st.santri.length) { isi.innerHTML = kosong("Belum ada santri. Tambahkan dulu di menu Santri."); return; }

    var h = '<div class="judul-bagian"><div><p class="eyebrow">Harian</p><h1>Laporan pertemuan</h1></div></div>' +
      '<label class="isian" style="max-width:460px;margin-bottom:20px"><span>Santri</span>' + pemilihSantri(id) + '</label>' +
      '<div id="wadah-lapor"></div>';
    isi.innerHTML = h;

    $("#pilih-santri").onchange = function () {
      st.terpilih = this.value || null;
      location.hash = "#/laporan" + (st.terpilih ? "/" + st.terpilih : "");
    };
    if (id && cariSantri(id)) { st.terpilih = id; formLaporan(cariSantri(id)); }
  }

  function formLaporan(s) {
    var w = $("#wadah-lapor");
    var punyaIqro = s.program_iqro, punyaTahfidz = s.program_tahfidz;

    var pilihanSurah = '<option value="">— pilih surah —</option>' + window.SURAH.map(function (x, i) {
      return '<option value="' + esc(x[0]) + '" data-ayat="' + x[1] + '">' + (i + 1) + ". " + esc(x[0]) + '</option>';
    }).join("");

    var h = '<div class="baris" style="grid-template-columns:1fr;gap:20px" id="grid-lapor">';

    h += '<form class="kartu" id="f-lapor">' +
      '<div class="baris baris-2" style="margin-bottom:16px">' +
        '<label class="isian"><span>Tanggal pertemuan</span><input type="date" id="l-tgl" value="' + hariIni() + '" required></label>' +
        '<div class="isian"><span>Kehadiran</span><div class="pilih-hadir">' +
          '<label><input type="radio" name="hadir" value="1" checked> Hadir</label>' +
          '<label><input type="radio" name="hadir" value="0"> Tidak hadir</label>' +
        '</div></div>' +
      '</div>' +

      // ---- kalau tidak hadir ----
      '<div id="blok-absen" hidden>' +
        '<div class="baris baris-2">' +
          '<label class="isian"><span>Alasan tidak hadir</span><input id="l-alasan" placeholder="Sakit, ada acara keluarga, …"></label>' +
          '<label class="isian"><span>Catatan jadwal pengganti</span><input id="l-ganti" placeholder="Diganti Ahad 16.00"></label>' +
        '</div>' +
      '</div>' +

      // ---- kalau hadir ----
      '<div id="blok-hadir">';

    if (punyaIqro) {
      h += '<fieldset style="border:1px solid var(--line);border-radius:var(--r-md);padding:14px;margin-bottom:14px">' +
        '<legend style="font-size:.82rem;font-weight:700;padding:0 6px;color:var(--green-text)">Program Iqro</legend>' +
        '<div class="baris baris-3">' +
          '<label class="isian"><span>Jilid</span><select id="l-jilid">' +
            [1,2,3,4,5,6].map(function (j) { return '<option value="' + j + '"' + (Number(s.jilid_sekarang) === j ? " selected" : "") + '>Jilid ' + j + '</option>'; }).join("") +
          '</select></label>' +
          '<label class="isian"><span>Halaman awal</span><input type="number" id="l-hal1" min="1" max="35" value="' + (s.halaman_sekarang ? Number(s.halaman_sekarang) + 1 : "") + '"></label>' +
          '<label class="isian"><span>Halaman akhir</span><input type="number" id="l-hal2" min="1" max="35"></label>' +
        '</div></fieldset>';
    }
    if (punyaTahfidz) {
      h += '<fieldset style="border:1px solid var(--line);border-radius:var(--r-md);padding:14px;margin-bottom:14px">' +
        '<legend style="font-size:.82rem;font-weight:700;padding:0 6px;color:var(--green-text)">Program Tahfidz</legend>' +
        '<p class="eyebrow" style="margin-bottom:8px">Hafalan baru</p>' +
        '<div class="baris baris-3">' +
          '<label class="isian"><span>Surah</span><select id="l-surah-baru">' + pilihanSurah + '</select></label>' +
          '<label class="isian"><span>Ayat awal</span><input type="number" id="l-ayat1" min="1" disabled></label>' +
          '<label class="isian"><span>Ayat akhir</span><input type="number" id="l-ayat2" min="1" disabled></label>' +
        '</div>' +
        '<p class="eyebrow" style="margin:16px 0 8px">Murojaah</p>' +
        '<div class="baris baris-3">' +
          '<label class="isian"><span>Surah</span><select id="l-surah-mur">' + pilihanSurah + '</select></label>' +
          '<label class="isian"><span>Ayat awal</span><input type="number" id="l-mur1" min="1" disabled></label>' +
          '<label class="isian"><span>Ayat akhir</span><input type="number" id="l-mur2" min="1" disabled></label>' +
        '</div></fieldset>';
    }

    h += '<div class="baris baris-3" style="margin-bottom:14px">' +
        bintangIsian("Kelancaran", "kelancaran") +
        bintangIsian("Fokus", "fokus") +
        bintangIsian("Tajwid", "tajwid") +
      '</div>' +
      '<label class="isian" style="margin-bottom:14px"><span>PR untuk di rumah</span><input id="l-pr" placeholder="Ulang halaman 14–15, 3× sehari"></label>' +
      '<label class="isian" style="margin-bottom:16px"><span>Catatan untuk orang tua</span><textarea id="l-catatan"></textarea></label>' +
      '</div>' +

      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<button class="btn btn-primary" type="submit">Simpan laporan</button>' +
        '<button class="btn btn-wa" type="button" id="l-kirim">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.5 12a8.5 8.5 0 1 1-4.2-7.3"/><path d="M3.5 20.5 5 16"/></svg>' +
          'Simpan &amp; kirim WhatsApp</button>' +
      '</div>' +
    '</form>';

    h += '<div class="wa-kotak"><div class="wa-judul">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.5 12a8.5 8.5 0 1 1-4.2-7.3"/><path d="M3.5 20.5 5 16"/></svg>' +
      'Pratinjau pesan &middot; ' + esc(s.wali_nama || "orang tua") + '</div>' +
      '<div class="wa-gelembung" id="l-pratinjau"></div></div>';

    h += "</div>";

    // riwayat singkat
    h += '<h2 style="margin:28px 0 12px">Riwayat terakhir</h2><div id="riwayat-lapor"><div class="memuat"><span class="putar"></span></div></div>';

    w.innerHTML = h;

    if (window.matchMedia("(min-width:1000px)").matches) {
      $("#grid-lapor").style.gridTemplateColumns = "1.15fr .85fr";
      $("#grid-lapor").style.alignItems = "start";
    }

    pasangBintang();
    pasangSurah("l-surah-baru", "l-ayat1", "l-ayat2");
    pasangSurah("l-surah-mur", "l-mur1", "l-mur2");

    // hadir / tidak hadir
    w.querySelectorAll('input[name="hadir"]').forEach(function (r) {
      r.onchange = function () {
        var hadir = w.querySelector('input[name="hadir"]:checked').value === "1";
        $("#blok-hadir").hidden = !hadir;
        $("#blok-absen").hidden = hadir;
        perbaruiPratinjau();
      };
    });

    w.addEventListener("input", perbaruiPratinjau);
    w.addEventListener("change", perbaruiPratinjau);
    perbaruiPratinjau();

    function ambilData() {
      var hadir = w.querySelector('input[name="hadir"]:checked').value === "1";
      var d = {
        santri_id: s.id,
        tanggal: $("#l-tgl").value || hariIni(),
        hadir: hadir,
        alasan: hadir ? null : (($("#l-alasan") || {}).value || "").trim() || null,
        jadwal_pengganti: hadir ? null : (($("#l-ganti") || {}).value || "").trim() || null,
        jilid: null, hal_awal: null, hal_akhir: null,
        surah_baru: null, ayat_baru_awal: null, ayat_baru_akhir: null,
        surah_murojaah: null, ayat_mur_awal: null, ayat_mur_akhir: null,
        nilai_kelancaran: null, nilai_fokus: null, nilai_tajwid: null,
        pr: null, catatan: null
      };
      if (hadir) {
        if (punyaIqro && $("#l-jilid")) {
          d.jilid = Number($("#l-jilid").value) || null;
          d.hal_awal = Number($("#l-hal1").value) || null;
          d.hal_akhir = Number($("#l-hal2").value) || null;
        }
        if (punyaTahfidz && $("#l-surah-baru")) {
          d.surah_baru = $("#l-surah-baru").value || null;
          d.ayat_baru_awal = Number($("#l-ayat1").value) || null;
          d.ayat_baru_akhir = Number($("#l-ayat2").value) || null;
          d.surah_murojaah = $("#l-surah-mur").value || null;
          d.ayat_mur_awal = Number($("#l-mur1").value) || null;
          d.ayat_mur_akhir = Number($("#l-mur2").value) || null;
        }
        d.nilai_kelancaran = nilaiBintang("kelancaran");
        d.nilai_fokus = nilaiBintang("fokus");
        d.nilai_tajwid = nilaiBintang("tajwid");
        d.pr = $("#l-pr").value.trim() || null;
        d.catatan = $("#l-catatan").value.trim() || null;
      }
      return d;
    }

    function susunPesan(d) {
      var isiPesan = [];
      if (d.hadir) {
        if (d.jilid) {
          isiPesan.push("Program: Iqro Jilid " + d.jilid);
          if (d.hal_awal) isiPesan.push("Halaman: " + d.hal_awal + (d.hal_akhir ? "–" + d.hal_akhir : ""));
        }
        if (d.surah_baru) {
          isiPesan.push("Hafalan baru: " + d.surah_baru +
            (d.ayat_baru_awal ? " " + d.ayat_baru_awal + (d.ayat_baru_akhir ? "–" + d.ayat_baru_akhir : "") : ""));
        }
        if (d.surah_murojaah) {
          isiPesan.push("Murojaah: " + d.surah_murojaah +
            (d.ayat_mur_awal ? " " + d.ayat_mur_awal + (d.ayat_mur_akhir ? "–" + d.ayat_mur_akhir : "") : ""));
        }
        if (d.nilai_kelancaran) isiPesan.push("Kelancaran: " + bintangTeks(d.nilai_kelancaran));
        if (d.nilai_fokus) isiPesan.push("Fokus: " + bintangTeks(d.nilai_fokus));
        if (d.nilai_tajwid) isiPesan.push("Tajwid: " + bintangTeks(d.nilai_tajwid));
      } else {
        if (d.alasan) isiPesan.push("Alasan: " + d.alasan);
        if (d.jadwal_pengganti) isiPesan.push("Jadwal pengganti: " + d.jadwal_pengganti);
      }
      return isiTemplate(atur("template_laporan"), {
        lembaga: st.pengaturan.nama_lembaga || "Sanad",
        ustadzah: st.pengaturan.nama_ustadzah || "Ustadzah",
        nama: s.nama,
        tanggal: tglPanjang(d.tanggal),
        kehadiran: d.hadir ? "Hadir" : "Tidak hadir",
        isi: isiPesan.join("\n"),
        pr: d.pr || "—",
        catatan: d.catatan || "—"
      }).replace(/\n{3,}/g, "\n\n");
    }

    function perbaruiPratinjau() {
      $("#l-pratinjau").textContent = susunPesan(ambilData());
    }

    function simpan(lalu) {
      var d = ambilData();
      sb.from("laporan").insert(d).then(function (r) {
        if (r.error) { kabar(r.error.message, "bad"); return; }
        // posisi santri ikut maju kalau ada halaman/juz baru
        var ubah = {};
        if (d.hadir && d.jilid) { ubah.jilid_sekarang = d.jilid; if (d.hal_akhir) ubah.halaman_sekarang = d.hal_akhir; }
        var lanjut = Object.keys(ubah).length
          ? sb.from("santri").update(ubah).eq("id", s.id)
          : Promise.resolve({});
        lanjut.then(function () {
          kabar("Laporan " + s.nama + " tersimpan.");
          muatSantri().then(function () { segarkanLencana(); muatRiwayat(); });
          if (lalu) lalu(d);
        });
      });
    }

    $("#f-lapor").onsubmit = function (e) { e.preventDefault(); simpan(null); };
    $("#l-kirim").onclick = function () {
      simpan(function (d) { bukaWa(s.wali_wa, susunPesan(d)); });
    };

    muatRiwayat();
    function muatRiwayat() {
      sb.from("laporan").select("*").eq("santri_id", s.id).order("tanggal", { ascending: false }).limit(8)
        .then(function (r) {
          var t = $("#riwayat-lapor");
          if (!t) return;
          if (r.error) { t.innerHTML = kosong(r.error.message); return; }
          if (!r.data.length) { t.innerHTML = kosong("Belum ada laporan untuk " + s.nama + "."); return; }
          var x = '<div class="tabel-bungkus"><table><thead><tr><th>Tanggal</th><th>Hadir</th><th>Materi</th><th>Nilai</th></tr></thead><tbody>';
          r.data.forEach(function (l) {
            var materi = [];
            if (l.jilid) materi.push("Jilid " + l.jilid + (l.hal_awal ? " hal. " + l.hal_awal + (l.hal_akhir ? "–" + l.hal_akhir : "") : ""));
            if (l.surah_baru) materi.push(l.surah_baru + " " + (l.ayat_baru_awal || "") + (l.ayat_baru_akhir ? "–" + l.ayat_baru_akhir : ""));
            if (!l.hadir) materi.push(l.alasan || "tidak hadir");
            var n = [l.nilai_kelancaran, l.nilai_fokus, l.nilai_tajwid].filter(Boolean);
            x += '<tr><td class="num">' + esc(tglPendek(l.tanggal)) + '</td>' +
              '<td>' + (l.hadir ? '<span class="pill pill-ok">Hadir</span>' : '<span class="pill pill-bad">Tidak</span>') + '</td>' +
              '<td>' + esc(materi.join(" · ") || "—") + '</td>' +
              '<td style="color:var(--gold)">' + (n.length ? esc(bintangTeks(Math.round(n.reduce(function(a,b){return a+b;},0)/n.length))) : "—") + '</td></tr>';
          });
          t.innerHTML = x + "</tbody></table></div>";
        });
    }
  }

  // --- bintang ---
  function bintangIsian(label, kunci) {
    var b = '<div class="isian"><span>' + esc(label) + '</span><div class="bintang" data-bintang="' + kunci + '" role="group" aria-label="' + esc(label) + '">';
    for (var i = 1; i <= 5; i++) {
      b += '<button type="button" data-nilai="' + i + '" aria-label="' + i + ' dari 5">★</button>';
    }
    return b + '</div></div>';
  }
  function pasangBintang() {
    document.querySelectorAll("[data-bintang]").forEach(function (grup) {
      grup.querySelectorAll("button").forEach(function (b) {
        b.onclick = function () {
          var n = Number(b.getAttribute("data-nilai"));
          var skrg = Number(grup.getAttribute("data-nilai") || 0);
          if (n === skrg) n = 0;                    // klik lagi = kosongkan
          grup.setAttribute("data-nilai", n);
          grup.querySelectorAll("button").forEach(function (x) {
            x.classList.toggle("isi", Number(x.getAttribute("data-nilai")) <= n);
          });
          grup.dispatchEvent(new Event("change", { bubbles: true }));
        };
      });
    });
  }
  function nilaiBintang(kunci) {
    var g = document.querySelector('[data-bintang="' + kunci + '"]');
    var n = g ? Number(g.getAttribute("data-nilai") || 0) : 0;
    return n || null;
  }

  // --- surah: batas ayat menyesuaikan otomatis ---
  function pasangSurah(idSurah, idA, idB) {
    var sel = document.getElementById(idSurah);
    if (!sel) return;
    var a = document.getElementById(idA), b = document.getElementById(idB);
    sel.onchange = function () {
      var opt = sel.options[sel.selectedIndex];
      var maks = Number(opt.getAttribute("data-ayat")) || 0;
      [a, b].forEach(function (x) {
        x.disabled = !maks;
        x.max = maks || "";
        x.value = "";
        x.placeholder = maks ? "1–" + maks : "";
      });
      if (maks) a.setAttribute("aria-describedby", "");
    };
    [a, b].forEach(function (x) {
      x.oninput = function () {
        var maks = Number(x.max) || 0;
        if (maks && Number(x.value) > maks) x.value = maks;
      };
    });
  }

  // ===================================================================
  // 12. HALAMAN: UJIAN
  // ===================================================================
  function halUjian(idParam) {
    var id = idParam || st.terpilih;
    if (!st.santri.length) { isi.innerHTML = kosong("Belum ada santri."); return; }
    isi.innerHTML = '<div class="judul-bagian"><div><p class="eyebrow">Harian</p><h1>Ujian kenaikan</h1></div></div>' +
      '<label class="isian" style="max-width:460px;margin-bottom:20px"><span>Santri</span>' + pemilihSantri(id) + '</label>' +
      '<div id="wadah-ujian"></div>';
    $("#pilih-santri").onchange = function () {
      st.terpilih = this.value || null;
      location.hash = "#/ujian" + (st.terpilih ? "/" + st.terpilih : "");
    };
    if (id && cariSantri(id)) { st.terpilih = id; papanUjian(cariSantri(id)); }
  }

  function papanUjian(s) {
    var w = $("#wadah-ujian");
    w.innerHTML = '<div class="memuat"><span class="putar"></span></div>';
    sb.from("ujian").select("*").eq("santri_id", s.id).then(function (r) {
      if (r.error) { w.innerHTML = kosong(r.error.message); return; }
      var punya = {};
      (r.data || []).forEach(function (u) { punya[u.program + "|" + u.capaian] = u; });

      var h = '<div class="baris" id="grid-ujian" style="gap:20px">';
      if (s.program_iqro) h += trekUjian(s, "iqro", CAPAIAN_IQRO, punya, "Iqro", "Ujian tiap kenaikan jilid, sampai khatam.");
      if (s.program_tahfidz) h += trekUjian(s, "tahfidz", CAPAIAN_TAHFIDZ, punya, "Tahfidz", "Ujian tiap capaian hafalan, dari ¼ juz sampai 30 juz.");
      h += "</div><div id=\"wadah-nilai\"></div>";
      w.innerHTML = h;

      if (window.matchMedia("(min-width:900px)").matches && s.program_iqro && s.program_tahfidz) {
        $("#grid-ujian").style.gridTemplateColumns = "1fr 1fr";
        $("#grid-ujian").style.alignItems = "start";
      }

      w.querySelectorAll("[data-capaian]").forEach(function (b) {
        b.onclick = function () {
          formUjian(s, b.getAttribute("data-program"), b.getAttribute("data-capaian"),
            punya[b.getAttribute("data-program") + "|" + b.getAttribute("data-capaian")]);
        };
      });
    });
  }

  function trekUjian(s, program, daftar, punya, judul, ket) {
    var h = '<div class="kartu"><h3>' + esc(judul) + '</h3>' +
      '<p style="font-size:.86rem;color:var(--muted);margin-bottom:16px">' + esc(ket) + '</p><ul class="rantai">';
    daftar.forEach(function (c) {
      var u = punya[program + "|" + c.kode];
      var lulus = u && u.nilai && u.nilai !== "Rosib";
      var gagal = u && u.nilai === "Rosib";
      var ket2 = u && u.tanggal
        ? tglPendek(u.tanggal) + (u.nilai ? " · " + u.nilai : "")
        : "belum dijadwalkan";
      h += '<li class="mata' + (lulus ? " lulus" : gagal ? " gagal" : "") + '">' +
        '<span class="bulat" aria-hidden="true">' + esc(c.tanda) + '</span>' +
        '<span class="teks"><b>' + esc(c.label) + '</b><span class="num">' + esc(ket2) + '</span></span>' +
        '<button class="btn btn-ghost btn-kecil" data-program="' + program + '" data-capaian="' + esc(c.kode) + '" type="button">' +
        (u ? "Ubah" : "Isi") + '</button></li>';
    });
    return h + "</ul></div>";
  }

  function formUjian(s, program, kodeCapaian, ada) {
    var daftar = program === "iqro" ? CAPAIAN_IQRO : CAPAIAN_TAHFIDZ;
    var label = "";
    daftar.forEach(function (c) { if (c.kode === kodeCapaian) label = c.label; });
    var w = $("#wadah-nilai");
    w.innerHTML = '<div class="kartu" style="margin-top:22px">' +
      '<h2 style="margin-bottom:4px">' + esc(label) + '</h2>' +
      '<p style="font-size:.88rem;color:var(--muted);margin-bottom:16px">' + esc(s.nama) + '</p>' +
      '<form id="f-ujian" class="baris">' +
        '<div class="baris baris-2">' +
          '<label class="isian"><span>Tanggal ujian</span><input type="date" id="u-tgl" value="' + esc((ada && ada.tanggal) || hariIni()) + '" required></label>' +
          '<label class="isian"><span>Nilai</span><select id="u-nilai" required><option value="">— pilih —</option>' +
            NILAI.map(function (n) { return '<option' + (ada && ada.nilai === n ? " selected" : "") + '>' + n + '</option>'; }).join("") +
          '</select></label>' +
        '</div>' +
        '<label class="isian"><span>Catatan</span><textarea id="u-catatan">' + esc((ada && ada.catatan) || "") + '</textarea></label>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<button class="btn btn-primary" type="submit">Simpan hasil</button>' +
          '<button class="btn btn-ghost" type="button" id="u-batal">Batal</button>' +
        '</div>' +
      '</form></div><div id="wadah-sertifikat"></div>';

    w.scrollIntoView({ behavior: "smooth", block: "nearest" });
    $("#u-batal").onclick = function () { w.innerHTML = ""; };

    $("#f-ujian").onsubmit = function (e) {
      e.preventDefault();
      var d = {
        santri_id: s.id, program: program, capaian: kodeCapaian,
        tanggal: $("#u-tgl").value,
        nilai: $("#u-nilai").value,
        catatan: $("#u-catatan").value.trim() || null
      };
      sb.from("ujian").upsert(d, { onConflict: "santri_id,program,capaian" }).then(function (r) {
        if (r.error) { kabar(r.error.message, "bad"); return; }
        kabar("Hasil ujian tersimpan.");
        if (d.nilai !== "Rosib") {
          tampilSertifikat(s, label, d);
        } else {
          $("#wadah-sertifikat").innerHTML =
            '<div class="kartu" style="margin-top:18px;border-color:var(--danger)">' +
            '<b>Belum lulus.</b><p style="font-size:.9rem;color:var(--muted)">' +
            'Sertifikat tidak dibuat. Capaian ini bisa diisi ulang kapan saja setelah ujian berikutnya.</p></div>';
        }
        papanUjian(s);
      });
    };
  }

  function tampilSertifikat(s, label, d) {
    var pesan = isiTemplate(atur("template_lulus"), {
      nama: s.nama, capaian: label, nilai: d.nilai,
      ustadzah: st.pengaturan.nama_ustadzah || "Ustadzah",
      lembaga: st.pengaturan.nama_lembaga || "Sanad"
    });
    $("#wadah-sertifikat").innerHTML =
      '<div class="sertifikat" style="margin-top:18px">' +
        '<p class="kop">' + esc(st.pengaturan.nama_lembaga || "Sanad") + '</p>' +
        '<h2>Sertifikat Kelulusan</h2>' +
        '<p class="ket">Diberikan kepada</p>' +
        '<p class="nama">' + esc(s.nama) + '</p>' +
        '<p class="ket">atas kelulusan ujian <b>' + esc(label) + '</b><br>pada ' + esc(tglPanjang(d.tanggal)) + '</p>' +
        '<p class="nilai">' + esc(d.nilai) + '</p>' +
        '<p class="kaki">' + esc(st.pengaturan.nama_ustadzah || "Ustadzah") + '</p>' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">' +
        '<button class="btn btn-ghost" id="cetak-sertifikat" type="button">Unduh / cetak sertifikat</button>' +
        '<button class="btn btn-wa" id="kirim-lulus" type="button">Kirim ucapan ke orang tua</button>' +
      '</div>';
    $("#cetak-sertifikat").onclick = function () { window.print(); };
    $("#kirim-lulus").onclick = function () { bukaWa(s.wali_wa, pesan); };
  }

  // ===================================================================
  // 13. HALAMAN: PROGRESS
  // ===================================================================
  function halProgress() {
    if (!st.santri.length) { isi.innerHTML = kosong("Belum ada santri."); return; }
    sb.from("laporan").select("santri_id,tanggal,hadir,surah_baru,surah_murojaah,jilid,hal_akhir")
      .order("tanggal", { ascending: false }).limit(400)
      .then(function (r) {
        var terakhir = {};
        (r.data || []).forEach(function (l) { if (!terakhir[l.santri_id]) terakhir[l.santri_id] = l; });

        var h = '<div class="judul-bagian"><div><p class="eyebrow">Data</p><h1>Progress semua santri</h1></div></div>';
        h += '<div class="tabel-bungkus"><table><thead><tr>' +
          '<th>Santri</th><th>Program</th><th style="min-width:190px">Posisi</th><th>Pertemuan terakhir</th>' +
          '</tr></thead><tbody>';

        st.santri.forEach(function (s) {
          var l = terakhir[s.id];
          var kolom = "";
          if (s.program_iqro) {
            var hal = Number(s.halaman_sekarang) || 0;
            var persen = Math.max(0, Math.min(100, Math.round(hal / 32 * 100)));
            kolom += '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted);margin-bottom:4px">' +
              '<span>Jilid ' + (s.jilid_sekarang || "—") + '</span><span class="num">' + (hal || "—") + ' / 32 hal.</span></div>' +
              '<div class="bar"><i style="width:' + persen + '%"></i></div></div>';
          }
          if (s.program_tahfidz) {
            var juz = Number(s.target_juz) || 0;
            var pj = Math.max(0, Math.min(100, Math.round(juz / 30 * 100)));
            kolom += '<div><div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted);margin-bottom:4px">' +
              '<span>Hafalan</span><span class="num">' + (juz || 0) + ' / 30 juz</span></div>' +
              '<div class="bar"><i style="width:' + pj + '%"></i></div>' +
              (l && (l.surah_baru || l.surah_murojaah)
                ? '<p style="font-size:.78rem;color:var(--muted);margin-top:5px">baru: ' + esc(l.surah_baru || "—") +
                  ' · murojaah: ' + esc(l.surah_murojaah || "—") + '</p>' : "") +
              '</div>';
          }
          h += '<tr><td><b>' + esc(s.nama) + '</b></td>' +
            '<td>' + esc(programTeks(s)) + '</td>' +
            '<td>' + (kolom || "—") + '</td>' +
            '<td class="num">' + (l ? esc(tglPendek(l.tanggal)) +
              (l.hadir ? ' <span class="pill pill-ok">Hadir</span>' : ' <span class="pill pill-bad">Tidak</span>') : "—") + '</td></tr>';
        });
        isi.innerHTML = h + "</tbody></table></div>";
      });
  }

  // ===================================================================
  // 14. HALAMAN: ORANG TUA
  // ===================================================================
  function halOrangTua() {
    if (!st.santri.length) { isi.innerHTML = kosong("Belum ada santri."); return; }
    var asal = location.origin + location.pathname.replace(/app\/[^/]*$/, "anak/");
    var h = '<div class="judul-bagian"><div><p class="eyebrow">Data</p><h1>Link orang tua</h1></div></div>' +
      '<p style="max-width:64ch;color:var(--ink-2);margin-bottom:20px">Setiap santri punya satu link tetap. ' +
      'Kirim sekali lewat WhatsApp — sesudah itu orang tua bisa membukanya kapan saja tanpa membuat akun. ' +
      'Link ini hanya menampilkan satu anak dan tidak bisa dipakai mengubah data.</p>' +
      '<div class="tabel-bungkus"><table><thead><tr><th>Santri</th><th>Orang tua</th><th></th></tr></thead><tbody>';
    st.santri.forEach(function (s) {
      var tautan = asal + "?t=" + s.token;
      h += '<tr><td><b>' + esc(s.nama) + '</b></td>' +
        '<td>' + esc(s.wali_nama || "—") + '<br><span class="num" style="font-size:.8rem;color:var(--muted)">' + esc(s.wali_wa || "belum ada nomor") + '</span></td>' +
        '<td class="aksi">' +
        '<button class="btn btn-ghost btn-kecil" data-salin="' + esc(tautan) + '" type="button">Salin link</button> ' +
        '<a class="btn btn-ghost btn-kecil" href="' + esc(tautan) + '" target="_blank" rel="noopener">Lihat</a> ' +
        '<button class="btn btn-wa btn-kecil" data-kirim="' + esc(s.id) + '" data-tautan="' + esc(tautan) + '" type="button">Kirim</button>' +
        '</td></tr>';
    });
    isi.innerHTML = h + "</tbody></table></div>";

    isi.querySelectorAll("[data-salin]").forEach(function (b) {
      b.onclick = function () {
        navigator.clipboard.writeText(b.getAttribute("data-salin")).then(
          function () { kabar("Link disalin. Tinggal tempel di WhatsApp."); },
          function () { kabar("Gagal menyalin. Pakai tombol Lihat lalu salin dari bilah alamat.", "bad"); }
        );
      };
    });
    isi.querySelectorAll("[data-kirim]").forEach(function (b) {
      b.onclick = function () {
        var s = cariSantri(b.getAttribute("data-kirim"));
        bukaWa(s.wali_wa,
          "Assalamu'alaikum.\nIni link untuk memantau perkembangan ngaji ananda " + s.nama + ":\n" +
          b.getAttribute("data-tautan") +
          "\n\nBisa dibuka kapan saja, tidak perlu membuat akun.\n\n— " +
          (st.pengaturan.nama_ustadzah || "Ustadzah"));
      };
    });
  }

  // ===================================================================
  // 15. HALAMAN: WHATSAPP CENTER
  // ===================================================================
  function halWa() {
    if (!st.santri.length) { isi.innerHTML = kosong("Belum ada santri."); return; }
    sb.from("pembayaran").select("*").eq("lunas", false).then(function (r) {
      var tunggak = {};
      (r.data || []).forEach(function (p) { if (!tunggak[p.santri_id]) tunggak[p.santri_id] = p; });

      var h = '<div class="judul-bagian"><div><p class="eyebrow">Harian</p><h1>WhatsApp Center</h1></div></div>' +
        '<p style="max-width:64ch;color:var(--ink-2);margin-bottom:20px">Tiga jenis pesan per santri. ' +
        'Pesan disusun otomatis dari template di menu Pengaturan; Bas yang menekan tombol kirimnya.</p>' +
        '<div class="tabel-bungkus"><table><thead><tr><th>Santri</th><th>Nomor</th><th>Kirim</th></tr></thead><tbody>';

      st.santri.forEach(function (s) {
        var p = tunggak[s.id];
        h += '<tr><td><b>' + esc(s.nama) + '</b><br><span style="font-size:.8rem;color:var(--muted)">' + esc(programTeks(s)) + '</span></td>' +
          '<td class="num">' + (s.wali_wa ? esc(s.wali_wa) : '<span class="pill pill-off">belum ada</span>') + '</td>' +
          '<td class="aksi">' +
          '<a class="btn btn-ghost btn-kecil" href="#/laporan/' + esc(s.id) + '">Laporan</a> ' +
          '<button class="btn btn-ghost btn-kecil" data-jadwal="' + esc(s.id) + '" type="button">Jadwal</button> ' +
          '<button class="btn btn-ghost btn-kecil" data-tagih="' + esc(s.id) + '" type="button"' + (p ? "" : " disabled") + '>Tagihan</button>' +
          '</td></tr>';
      });
      isi.innerHTML = h + '</tbody></table></div>' +
        '<p class="bantuan" style="margin-top:12px">Tombol “Tagihan” hidup hanya untuk santri yang punya tagihan belum lunas.</p>';

      isi.querySelectorAll("[data-jadwal]").forEach(function (b) {
        b.onclick = function () {
          var s = cariSantri(b.getAttribute("data-jadwal"));
          if (!s.jadwal_hari) { kabar("Jadwal " + s.nama + " belum diisi di menu Santri.", "bad"); return; }
          bukaWa(s.wali_wa, isiTemplate(atur("template_jadwal"), {
            nama: s.nama, hari: s.jadwal_hari, jam: s.jadwal_jam || "-",
            ustadzah: st.pengaturan.nama_ustadzah || "Ustadzah",
            lembaga: st.pengaturan.nama_lembaga || "Sanad"
          }));
        };
      });
      isi.querySelectorAll("[data-tagih]").forEach(function (b) {
        b.onclick = function () {
          var s = cariSantri(b.getAttribute("data-tagih"));
          var p = tunggak[s.id];
          bukaWa(s.wali_wa, isiTemplate(atur("template_tagihan"), {
            nama: s.nama, periode: periodePanjang(p.periode), nominal: rupiah(p.nominal),
            jatuh_tempo: p.jatuh_tempo ? tglPanjang(p.jatuh_tempo) : "—",
            ustadzah: st.pengaturan.nama_ustadzah || "Ustadzah",
            lembaga: st.pengaturan.nama_lembaga || "Sanad"
          }));
        };
      });
    });
  }

  // ===================================================================
  // 16. HALAMAN: PEMBAYARAN
  // ===================================================================
  function halPembayaran() {
    if (!st.santri.length) { isi.innerHTML = kosong("Belum ada santri."); return; }
    sb.from("pembayaran").select("*").order("periode", { ascending: false }).then(function (r) {
      if (r.error) { isi.innerHTML = kosong(r.error.message); return; }
      var semua = r.data || [];
      var per = periodeIni();
      var adaBulanIni = {};
      semua.forEach(function (p) { if (p.periode === per) adaBulanIni[p.santri_id] = p; });
      var belum = st.santri.filter(function (s) { return !adaBulanIni[s.id]; });

      var h = '<div class="judul-bagian"><div><p class="eyebrow">Data</p><h1>Pembayaran</h1></div>';
      if (belum.length) {
        h += '<button class="btn btn-primary" id="buat-tagihan" type="button">Buat tagihan ' + esc(periodePanjang(per)) + ' (' + belum.length + ')</button>';
      }
      h += "</div>";

      if (!semua.length) {
        h += kosong("Belum ada tagihan. Tekan tombol di atas untuk membuat tagihan bulan ini bagi semua santri, memakai biaya bulanan yang diisi di menu Santri.");
      } else {
        h += '<div class="tabel-bungkus"><table><thead><tr>' +
          '<th>Santri</th><th>Periode</th><th>Nominal</th><th>Jatuh tempo</th><th>Status</th><th></th>' +
          '</tr></thead><tbody>';
        semua.forEach(function (p) {
          var s = cariSantri(p.santri_id);
          var lewat = !p.lunas && p.jatuh_tempo && p.jatuh_tempo < hariIni();
          h += '<tr><td><b>' + esc(s ? s.nama : "—") + '</b></td>' +
            '<td class="num">' + esc(periodePanjang(p.periode)) + '</td>' +
            '<td class="num">' + rupiah(p.nominal) + '</td>' +
            '<td class="num">' + (p.jatuh_tempo ? esc(tglPendek(p.jatuh_tempo)) : "—") + '</td>' +
            '<td>' + (p.lunas
              ? '<span class="pill pill-ok">Lunas</span>'
              : '<span class="pill ' + (lewat ? "pill-bad" : "pill-warn") + '">' + (lewat ? "Lewat tempo" : "Belum bayar") + '</span>') + '</td>' +
            '<td class="aksi"><button class="btn btn-ghost btn-kecil" data-ubah-bayar="' + esc(p.id) + '" data-lunas="' + (p.lunas ? "1" : "0") + '" type="button">' +
              (p.lunas ? "Batalkan lunas" : "Tandai lunas") + '</button></td></tr>';
        });
        h += "</tbody></table></div>";
      }
      isi.innerHTML = h;

      var tombolBuat = $("#buat-tagihan");
      if (tombolBuat) tombolBuat.onclick = function () {
        var tempo = per + "-10";
        var baris = belum.map(function (s) {
          return { santri_id: s.id, periode: per, nominal: s.biaya_bulanan || 0, jatuh_tempo: tempo, lunas: false };
        });
        tanya("Buat " + baris.length + " tagihan?",
          "Tagihan " + periodePanjang(per) + " dibuat untuk santri yang belum punya, memakai biaya bulanan masing-masing. Jatuh tempo tanggal 10.",
          "Buat tagihan").then(function (ya) {
          if (!ya) return;
          sb.from("pembayaran").insert(baris).then(function (r2) {
            if (r2.error) { kabar(r2.error.message, "bad"); return; }
            kabar(baris.length + " tagihan dibuat.");
            segarkanLencana(); rute();
          });
        });
      };

      isi.querySelectorAll("[data-ubah-bayar]").forEach(function (b) {
        b.onclick = function () {
          var lunasBaru = b.getAttribute("data-lunas") !== "1";
          sb.from("pembayaran").update({
            lunas: lunasBaru,
            tanggal_bayar: lunasBaru ? hariIni() : null
          }).eq("id", b.getAttribute("data-ubah-bayar")).then(function (r2) {
            if (r2.error) { kabar(r2.error.message, "bad"); return; }
            kabar(lunasBaru ? "Ditandai lunas." : "Status lunas dibatalkan.");
            segarkanLencana(); rute();
          });
        };
      });
    });
  }

  // ===================================================================
  // 17. HALAMAN: PENGATURAN
  // ===================================================================
  function halPengaturan() {
    var p = st.pengaturan || {};
    var bantuTag = '<p class="bantuan">Kata dalam kurung kurawal diganti otomatis: ' +
      '<code>{nama}</code> <code>{tanggal}</code> <code>{kehadiran}</code> <code>{isi}</code> ' +
      '<code>{pr}</code> <code>{catatan}</code> <code>{ustadzah}</code> <code>{lembaga}</code></p>';

    isi.innerHTML =
      '<div class="judul-bagian"><div><p class="eyebrow">Lain-lain</p><h1>Pengaturan</h1></div></div>' +
      '<form id="f-atur" class="baris" style="max-width:760px">' +
        '<div class="kartu"><h2 style="margin-bottom:16px">Identitas</h2>' +
          '<div class="baris baris-2">' +
            '<label class="isian"><span>Nama ustadzah</span><input id="p-ustadzah" value="' + esc(p.nama_ustadzah || "") + '"></label>' +
            '<label class="isian"><span>Nama lembaga</span><input id="p-lembaga" value="' + esc(p.nama_lembaga || "") + '"></label>' +
          '</div>' +
          '<div class="baris baris-2" style="margin-top:14px">' +
            '<label class="isian"><span>Harga program Iqro / bulan</span><input type="number" id="p-h-iqro" min="0" step="1000" value="' + (p.harga_iqro || 0) + '"></label>' +
            '<label class="isian"><span>Harga program Tahfidz / bulan</span><input type="number" id="p-h-tahfidz" min="0" step="1000" value="' + (p.harga_tahfidz || 0) + '"></label>' +
          '</div>' +
        '</div>' +

        '<div class="kartu"><h2 style="margin-bottom:6px">Template pesan WhatsApp</h2>' + bantuTag +
          '<label class="isian" style="margin-top:14px"><span>Laporan pertemuan</span>' +
            '<textarea id="p-t-laporan" style="min-height:190px">' + esc(p.template_laporan || BAWAAN.template_laporan) + '</textarea></label>' +
          '<label class="isian" style="margin-top:14px"><span>Pengingat jadwal</span>' +
            '<textarea id="p-t-jadwal">' + esc(p.template_jadwal || BAWAAN.template_jadwal) + '</textarea>' +
            '<span class="bantuan">Tambahan: <code>{hari}</code> <code>{jam}</code></span></label>' +
          '<label class="isian" style="margin-top:14px"><span>Pengingat pembayaran</span>' +
            '<textarea id="p-t-tagihan">' + esc(p.template_tagihan || BAWAAN.template_tagihan) + '</textarea>' +
            '<span class="bantuan">Tambahan: <code>{periode}</code> <code>{nominal}</code> <code>{jatuh_tempo}</code></span></label>' +
          '<label class="isian" style="margin-top:14px"><span>Ucapan kelulusan ujian</span>' +
            '<textarea id="p-t-lulus">' + esc(p.template_lulus || BAWAAN.template_lulus) + '</textarea>' +
            '<span class="bantuan">Tambahan: <code>{capaian}</code> <code>{nilai}</code></span></label>' +
        '</div>' +

        '<div><button class="btn btn-primary" type="submit">Simpan pengaturan</button></div>' +
      '</form>';

    $("#f-atur").onsubmit = function (e) {
      e.preventDefault();
      var d = {
        id: 1,
        nama_ustadzah: $("#p-ustadzah").value.trim() || null,
        nama_lembaga: $("#p-lembaga").value.trim() || null,
        harga_iqro: Number($("#p-h-iqro").value) || 0,
        harga_tahfidz: Number($("#p-h-tahfidz").value) || 0,
        template_laporan: $("#p-t-laporan").value,
        template_jadwal: $("#p-t-jadwal").value,
        template_tagihan: $("#p-t-tagihan").value,
        template_lulus: $("#p-t-lulus").value
      };
      sb.from("pengaturan").upsert(d, { onConflict: "id" }).then(function (r) {
        if (r.error) { kabar(r.error.message, "bad"); return; }
        st.pengaturan = d;
        kabar("Pengaturan disimpan.");
      });
    };
  }

  // ===================================================================
  // 18. JALAN
  // ===================================================================
  sb.auth.getSession().then(function (r) {
    if (r.data && r.data.session) mulai(r.data.session.user);
  });
})();

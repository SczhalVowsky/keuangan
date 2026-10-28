// Shared helpers for the finance pages. All data lives in this browser's localStorage.
const Keu = (() => {
  const KEY_TRANSAKSI = 'keuangan-bulanan-v1';   // used by keuangan/index.html since v1
  const KEY_BUDGET = 'keuangan-budget-v1';       // { "2026-10": { "Makan & Minum": 1500000 } }
  const KEY_NETWORTH = 'keuangan-networth-v1';   // [ { bulan, aset: [{nama, nilai}], kewajiban: [...] } ]
  const KEY_PENGATURAN = 'keuangan-pengaturan-v1'; // { mulai: 28 } = period starts on the 28th (payday)

  const KATEGORI = {
    keluar: ['Makan & Minum', 'Belanja', 'Transportasi', 'Tagihan & Listrik', 'Pulsa & Internet', 'Kesehatan', 'Pendidikan', 'Hiburan', 'Cicilan', 'Lainnya'],
    masuk: ['Gaji', 'Bonus', 'Usaha', 'Hadiah', 'Lainnya']
  };
  // Icon and color per category; anything unknown falls back to a neutral tag.
  const META_KATEGORI = {
    'Makan & Minum': ['🍜', '#f97316'], 'Belanja': ['🛍️', '#ec4899'], 'Transportasi': ['🚗', '#3b82f6'],
    'Tagihan & Listrik': ['💡', '#eab308'], 'Pulsa & Internet': ['📱', '#06b6d4'], 'Kesehatan': ['💊', '#ef4444'],
    'Pendidikan': ['🎓', '#8b5cf6'], 'Hiburan': ['🎬', '#a855f7'], 'Cicilan': ['💳', '#64748b'], 'Lainnya': ['📦', '#94a3b8'],
    'Gaji': ['💼', '#16a34a'], 'Bonus': ['🎁', '#22c55e'], 'Usaha': ['🏪', '#10b981'], 'Hadiah': ['🎉', '#14b8a6']
  };
  function metaKategori(kategori, jenis = 'keluar') {
    if (jenis === 'masuk' && kategori === 'Lainnya') return { ikon: '✨', warna: '#22c55e' };
    const [ikon, warna] = META_KATEGORI[kategori] || ['🏷️', '#94a3b8'];
    return { ikon, warna };
  }

  const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  const isBulan = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

  // 1250000 -> "Rp 1.250.000", -50000 -> "-Rp 50.000"
  function rupiah(n) {
    const v = Math.round(Number(n) || 0);
    return (v < 0 ? '-' : '') + 'Rp ' + Math.abs(v).toLocaleString('id-ID');
  }

  // Short form for chart axes: 1500000 -> "Rp 1,5 jt"
  function rupiahSingkat(n) {
    const v = Number(n) || 0, a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e9) return `${s}Rp ${(a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
    if (a >= 1e6) return `${s}Rp ${(a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
    if (a >= 1e3) return `${s}Rp ${(a / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
    return rupiah(v);
  }

  // "2026-09" -> "September 2026" (or "Sep 2026" when short)
  function namaBulan(bulan, short = false) {
    if (!isBulan(bulan)) return String(bulan);
    const [y, m] = bulan.split('-');
    const nama = NAMA_BULAN[Number(m) - 1];
    return `${short ? nama.slice(0, 3) : nama} ${y}`;
  }

  const bulanIni = () => new Date().toLocaleDateString('sv').slice(0, 7);

  // "2026-12" -> "2027-01"
  function bulanBerikut(bulan) {
    const [y, m] = bulan.split('-').map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }

  function bulanSebelum(bulan) {
    const [y, m] = bulan.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  }

  const hariIni = () => new Date().toLocaleDateString('sv');   // YYYY-MM-DD, local time
  const pad = (n) => String(n).padStart(2, '0');
  const jumlahHari = (bulan) => { const [y, m] = bulan.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const keUTC = (tgl) => { const [y, m, d] = tgl.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const selisihHari = (a, b) => Math.round((keUTC(b) - keUTC(a)) / 864e5);

  // ---- Pay period ----
  // A period is named after the month it starts in. With payday 28, period "2026-10" runs
  // 28 Oct - 27 Nov. Payday 1 (the default) gives plain calendar months.
  // Paydays past the end of a short month start on that month's last day.
  let mulaiCache = null;
  function mulaiPeriode() {
    if (mulaiCache === null) mulaiCache = loadPengaturan().mulai;
    return mulaiCache;
  }
  const hariAwal = (bulan) => Math.min(mulaiPeriode(), jumlahHari(bulan));

  // "2026-11-05" -> "2026-10" when the period starts on the 28th
  function periodeDari(tanggal) {
    const bulan = tanggal.slice(0, 7);
    return Number(tanggal.slice(8, 10)) >= hariAwal(bulan) ? bulan : bulanSebelum(bulan);
  }
  const periodeIni = () => periodeDari(hariIni());

  function rentangPeriode(bulan) {
    const awal = `${bulan}-${pad(hariAwal(bulan))}`;
    const berikut = bulanBerikut(bulan), hAwal = hariAwal(berikut);
    const akhir = hAwal > 1 ? `${berikut}-${pad(hAwal - 1)}` : `${bulan}-${pad(jumlahHari(bulan))}`;
    return { awal, akhir };
  }

  // "2026-10-28" -> "28 Okt" (or "28 Okt 2026")
  function tanggalPendek(tgl, denganTahun = false) {
    const [y, m, d] = tgl.split('-');
    return `${Number(d)} ${NAMA_BULAN[Number(m) - 1].slice(0, 3)}${denganTahun ? ' ' + y : ''}`;
  }

  // "28 Okt – 27 Nov 2026", "28 Des 2026 – 27 Jan 2027", "1 – 31 Okt 2026"
  function labelRentang(bulan) {
    const { awal, akhir } = rentangPeriode(bulan);
    if (awal.slice(0, 4) !== akhir.slice(0, 4)) return `${tanggalPendek(awal, true)} – ${tanggalPendek(akhir, true)}`;
    if (awal.slice(0, 7) === akhir.slice(0, 7)) return `${Number(awal.slice(8))} – ${tanggalPendek(akhir, true)}`;
    return `${tanggalPendek(awal)} – ${tanggalPendek(akhir, true)}`;
  }

  // Dropdown text: just the month for calendar periods, "Okt 2026 · 28 Okt–27 Nov" otherwise.
  function labelPeriode(bulan) {
    if (mulaiPeriode() === 1) return namaBulan(bulan);
    const { awal, akhir } = rentangPeriode(bulan);
    return `${namaBulan(bulan, true)} · ${tanggalPendek(awal)}–${tanggalPendek(akhir)}`;
  }

  // Where today sits in the period: { status: 'berjalan'|'selesai'|'belum', hariKe, total, sisa }
  function posisiHari(bulan) {
    const { awal, akhir } = rentangPeriode(bulan), hari = hariIni();
    const total = selisihHari(awal, akhir) + 1;
    if (hari < awal) return { status: 'belum', hariKe: 0, total, sisa: total };
    if (hari > akhir) return { status: 'selesai', hariKe: total, total, sisa: 0 };
    const hariKe = selisihHari(awal, hari) + 1;
    return { status: 'berjalan', hariKe, total, sisa: total - hariKe };
  }

  const persen = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Amount inputs: show "1.250.000" while typing, read back as a number (null when empty).
  function inputAngka(input) {
    input.addEventListener('input', () => {
      const angka = input.value.replace(/\D/g, '');
      input.value = angka ? Number(angka).toLocaleString('id-ID') : '';
    });
  }
  function bacaAngka(teks) {
    const angka = String(teks).replace(/\D/g, '');
    return angka ? Number(angka) : null;
  }
  const tulisAngka = (n) => (n || n === 0) ? Number(n).toLocaleString('id-ID') : '';

  // ---- Storage ----
  function baca(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function tulis(key, nilai) {
    try {
      localStorage.setItem(key, JSON.stringify(nilai));
      return true;
    } catch {
      alert('Gagal menyimpan. Penyimpanan browser penuh atau diblokir (mode penyamaran?).');
      return false;
    }
  }

  // Keep only valid months and non-negative numeric amounts.
  function bersihkanBudget(obj) {
    const hasil = {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return hasil;
    for (const [bulan, kategori] of Object.entries(obj)) {
      if (!isBulan(bulan) || !kategori || typeof kategori !== 'object') continue;
      const isi = {};
      for (const [nama, nilai] of Object.entries(kategori)) {
        const n = Number(nilai);
        if (nama && Number.isFinite(n) && n >= 0) isi[nama] = n;
      }
      if (Object.keys(isi).length) hasil[bulan] = isi;
    }
    return hasil;
  }

  function bersihkanDaftar(daftar) {
    if (!Array.isArray(daftar)) return [];
    return daftar.filter(x => x && typeof x === 'object' && String(x.nama ?? '').trim())
      .map(x => ({ nama: String(x.nama).trim(), nilai: Math.max(0, Number(x.nilai) || 0) }));
  }

  // Valid snapshots sorted oldest -> newest; for a duplicated month the last one wins.
  function bersihkanNetworth(arr) {
    if (!Array.isArray(arr)) return [];
    const perBulan = new Map();
    for (const s of arr) {
      if (!s || !isBulan(s.bulan)) continue;
      perBulan.set(s.bulan, { bulan: s.bulan, aset: bersihkanDaftar(s.aset), kewajiban: bersihkanDaftar(s.kewajiban) });
    }
    return [...perBulan.values()].sort((a, b) => a.bulan.localeCompare(b.bulan));
  }

  // Transactions recorded in the main report. Invalid entries are skipped.
  function loadTransaksi() {
    const raw = baca(KEY_TRANSAKSI);
    if (!Array.isArray(raw)) return [];
    return raw.filter(t => t && (t.jenis === 'masuk' || t.jenis === 'keluar') &&
      Number.isFinite(Number(t.jumlah)) && typeof t.tanggal === 'string' && isBulan(t.tanggal.slice(0, 7)));
  }

  function loadPengaturan() {
    const p = baca(KEY_PENGATURAN) || {};
    const mulai = Math.round(Number(p.mulai));
    return { mulai: mulai >= 1 && mulai <= 31 ? mulai : 1 };
  }
  function savePengaturan(pengaturan) {
    const ok = tulis(KEY_PENGATURAN, { mulai: Math.min(31, Math.max(1, Math.round(Number(pengaturan.mulai)) || 1)) });
    mulaiCache = null;
    return ok;
  }

  const loadBudget = () => bersihkanBudget(baca(KEY_BUDGET));
  const saveBudget = (budget) => tulis(KEY_BUDGET, bersihkanBudget(budget));
  const loadNetworth = () => bersihkanNetworth(baca(KEY_NETWORTH));
  const saveNetworth = (snapshot) => tulis(KEY_NETWORTH, bersihkanNetworth(snapshot));

  // ---- Backup (used by keuangan/index.html) ----
  function buatBackup(transaksi) {
    return { aplikasi: 'keuangan-bulanan', versi: 2, dibuat: new Date().toISOString(),
      transaksi, budget: loadBudget(), networth: loadNetworth(), pengaturan: loadPengaturan() };
  }

  // Accepts the v2 object above, or a v1 backup (a bare array of transactions).
  // budget/networth/pengaturan are null when the backup does not contain them (v1 backups,
  // or v2 backups made before the pay-period setting existed), meaning "leave the current data alone".
  function bacaBackup(isi) {
    if (Array.isArray(isi)) return { transaksi: isi, budget: null, networth: null, pengaturan: null };
    if (isi && typeof isi === 'object' && Array.isArray(isi.transaksi)) {
      return { transaksi: isi.transaksi, budget: bersihkanBudget(isi.budget), networth: bersihkanNetworth(isi.networth),
        pengaturan: isi.pengaturan && typeof isi.pengaturan === 'object' ? isi.pengaturan : null };
    }
    throw new Error('Format backup tidak dikenali.');
  }

  // ---- UI helpers ----
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Pick the month to show first: the current one if available, else the latest one not in the future.
  function pilihBulanDefault(daftar, sekarang = bulanIni()) {
    if (daftar.includes(sekarang)) return sekarang;
    const lampau = daftar.filter(b => b <= sekarang);
    return lampau.length ? lampau.sort().at(-1) : [...daftar].sort().at(-1);
  }

  function isiDropdownBulan(select, daftar, terpilih, label = namaBulan) {
    select.innerHTML = [...new Set(daftar)].sort().reverse()
      .map(b => `<option value="${b}"${b === terpilih ? ' selected' : ''}>${label(b)}</option>`).join('');
  }

  const chartTersedia = () => typeof window.Chart !== 'undefined';

  return { KATEGORI, metaKategori, isBulan, rupiah, rupiahSingkat, namaBulan, bulanIni, bulanBerikut, bulanSebelum,
    hariIni, persen, escapeHtml, inputAngka, bacaAngka, tulisAngka,
    mulaiPeriode, periodeDari, periodeIni, rentangPeriode, labelRentang, labelPeriode, posisiHari, tanggalPendek,
    loadTransaksi, loadBudget, saveBudget, loadNetworth, saveNetworth, loadPengaturan, savePengaturan,
    buatBackup, bacaBackup, cssVar, pilihBulanDefault, isiDropdownBulan, chartTersedia };
})();

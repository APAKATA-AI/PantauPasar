"use strict";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const money = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
const number = (n) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);
const observationDate = (value, options = {}) =>
  new Date(value).toLocaleDateString("id-ID", {
    ...options,
    timeZone: "UTC",
  });
const safe = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
const icons = {
  harga: '<path d="M3 20V9l9-6 9 6v11Z"/><path d="M8 20v-8h8v8M3 9h18"/>',
  simulasi: '<path d="M4 19V5m0 14h16M8 14l4-5 4 2 5-7m-5 0h5v5"/>',
  untung:
    '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h1m6 0h1M8 15h1m6 0h1M8 19h1m6 0h1"/>',
  saran:
    '<path d="M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z"/><path d="M8 10h8M8 14h5"/>',
};
const modules = [
  ["harga", "Harga"],
  ["simulasi", "Kalau naik?"],
  ["untung", "Hitung untung"],
  ["saran", "Tanya saran"],
];
const places = {
  "Jawa Timur": ["Surabaya", "Malang", "Kediri"],
  "Jawa Barat": ["Bandung", "Bekasi", "Bogor"],
  "DKI Jakarta": ["Jakarta Pusat"],
  "Jawa Tengah": ["Semarang", "Surakarta"],
};
const state = {
  market: null,
  query: null,
  days: 7,
  history: read("pp_history", []),
  ingredients: [
    { name: "Bahan utama", cost: 120000 },
    { name: "Bumbu & pelengkap", cost: 40000 },
  ],
  profit: null,
  request: 0,
  busy: false,
};
state.history = (Array.isArray(state.history) ? state.history : []).filter(
  (item) => places[item.province]?.includes(item.city),
);
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").hidden = true), 3500);
}
function nav() {
  for (const selector of [".nav", ".mobile-nav"])
    $(selector).innerHTML = modules
      .map(
        ([id, name]) =>
          `<a href="#${id}" data-nav="${id}">${selector === ".mobile-nav" ? `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[id]}</svg>` : ""}<span>${name}</span></a>`,
      )
      .join("");
}
function route() {
  let id = location.hash.slice(1) || "harga";
  if (!["harga", "hasil", "simulasi", "untung", "saran"].includes(id))
    id = "harga";
  if (id === "hasil" && !state.market) id = "harga";
  $$(".view").forEach((el) => (el.hidden = el.id !== id));
  const activeView = $(`#${id}`);
  activeView.classList.remove("view-enter");
  void activeView.offsetWidth;
  activeView.classList.add("view-enter");
  $$("[data-nav]").forEach((el) => {
    if (el.dataset.nav === (id === "hasil" ? "harga" : id))
      el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  if (id === "saran") updateContext();
  if (id === "simulasi") simulation();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (id === "hasil") requestAnimationFrame(drawChart);
}
function go(id) {
  if (location.hash === "#" + id) route();
  else location.hash = id;
}
function fillCities(preferred) {
  $("#city").innerHTML = places[$("#province").value]
    .map((city) => `<option>${city}</option>`)
    .join("");
  if (places[$("#province").value].includes(preferred))
    $("#city").value = preferred;
  save("pp_region", { province: $("#province").value, city: $("#city").value });
}
let productSuggestionTimer;
let productSuggestionRequest = 0;
function closeProductSuggestions() {
  const suggestions = $("#product-suggestions");
  suggestions.hidden = true;
  suggestions.replaceChildren();
  $("#product").setAttribute("aria-expanded", "false");
}
async function updateProductSuggestions() {
  const query = $("#product").value.trim();
  const requestId = ++productSuggestionRequest;
  if (query.length < 2) {
    closeProductSuggestions();
    return;
  }
  try {
    const params = new URLSearchParams({ q: query });
    const response = await PantauApi.request(
      "/api/market/products?" + params,
    );
    if (requestId !== productSuggestionRequest) return;
    const suggestions = $("#product-suggestions");
    const items = Array.isArray(response.data.items)
      ? response.data.items
      : [];
    suggestions.innerHTML = items
      .map(
        ({ label }, index) =>
          `<button type="button" class="product-suggestion" role="option" aria-selected="false" data-product-option="${index}" data-product="${safe(label)}">${safe(label)}</button>`,
      )
      .join("");
    suggestions.hidden = items.length === 0;
    $("#product").setAttribute("aria-expanded", String(items.length > 0));
    $(".form-help").textContent = items.length
      ? "Pilih komoditas yang disarankan atau lanjutkan dengan kata pencarianmu."
      : "Belum ada saran yang cocok. Coba nama komoditas lain.";
  } catch (error) {
    if (requestId !== productSuggestionRequest) return;
    closeProductSuggestions();
    $(".form-help").textContent =
      error.message || "Saran produk sementara tidak tersedia.";
  }
}
function normalizedMarket(data) {
  if (
    !data ||
    !Number.isFinite(data.harga_rata_rata) ||
    data.harga_rata_rata <= 0 ||
    !Array.isArray(data.tren_7_hari_terakhir) ||
    !Array.isArray(data.perbandingan_wilayah) ||
    !Array.isArray(data.daftar_sumber) ||
    !data.satuan ||
    !Number.isFinite(data.harga_terendah) ||
    !Number.isFinite(data.harga_tertinggi) ||
    (data.confidence_score !== null &&
      !Number.isFinite(data.confidence_score))
  )
    throw new Error(
      "Format harga belum lengkap. Coba lagi atau periksa sambungan backend.",
    );
  return data;
}
function history() {
  const items = Array.isArray(state.history) ? state.history : [];
  $("#recent-searches").innerHTML = items.length
    ? items
        .slice(0, 3)
        .map(
          (q, i) =>
            `<button type="button" class="text-button" data-history="${i}">${safe(q.product)} · ${safe(q.city)}</button>`,
        )
        .join("")
    : "Belum ada pencarian. Mulai dari produk di atas.";
}
async function marketSearch(event) {
  event?.preventDefault();
  if (state.busy) return;
  const q = {
    province: $("#province").value,
    city: $("#city").value,
    product: $("#product").value.trim(),
  };
  if (!q.product) return;
  state.busy = true;
  const button = $("#search-button");
  button.disabled = true;
  const steps = ["Mencari sumber harga", "Memeriksa angka", "Menyiapkan hasil"];
  button.textContent = steps[0];
  let i = 0;
  const loading = setInterval(() => (button.textContent = steps[++i % 3]), 700);
  try {
    const params = new URLSearchParams({
      provinsi: q.province,
      kota: q.city,
      produk: q.product,
    });
    const response = await PantauApi.request("/api/market?" + params);
    const data = normalizedMarket(response.data);
    q.product = data.produk || q.product;
    data.demo = !!data.demo;
    state.market = data;
    state.query = q;
    state.days = 7;
    state.history = [
      q,
      ...state.history.filter(
        (h) => h.product !== q.product || h.city !== q.city,
      ),
    ].slice(0, 5);
    save("pp_history", state.history);
    history();
    renderResult();
    renderWidget();
    go("hasil");
    toast("Harga dimuat" + (data.demo ? " · data contoh" : ""));
    closeProductSuggestions();
    void PantauApi.request(
      "/api/activity",
      { method: "POST", body: JSON.stringify(q) },
      () => ({ item: q }),
    ).catch((error) => toast(error.message));
  } catch (error) {
    toast(error.message);
    if (error.status === 429) {
      let seconds = Math.min(300, Math.max(1, error.retry));
      clearInterval(loading);
      button.textContent = `Coba lagi dalam ${seconds} detik`;
      await new Promise((resolve) => {
        const countdown = setInterval(() => {
          seconds--;
          button.textContent = `Coba lagi dalam ${seconds} detik`;
          if (seconds <= 0) {
            clearInterval(countdown);
            resolve();
          }
        }, 1000);
      });
    }
  } finally {
    clearInterval(loading);
    button.disabled = false;
    button.innerHTML =
      'Cek harga <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
    state.busy = false;
  }
}
function series(data = state.market, days = 30) {
  const observations = (data?.tren_7_hari_terakhir || [])
    .filter(
      (item) =>
        item &&
        Number.isFinite(item.harga) &&
        typeof item.tanggal === "string" &&
        Number.isFinite(Date.parse(item.tanggal)),
    )
    .sort((a, b) => Date.parse(a.tanggal) - Date.parse(b.tanggal));
  const latest = Date.parse(observations.at(-1)?.tanggal);
  if (!Number.isFinite(latest)) return [];
  const cutoff = latest - (days - 1) * 864e5;
  return observations.filter((item) => Date.parse(item.tanggal) >= cutoff);
}
function trend(data) {
  const values = series(data, 7);
  const first = typeof values[0] === "number" ? values[0] : values[0]?.harga;
  const change = first ? data.harga_rata_rata - first : 0;
  return { change, percent: first ? (change / first) * 100 : 0 };
}
function renderResult() {
  const d = state.market,
    q = state.query,
    t = trend(d);
  $("#result-title").textContent = `${q.product} di ${q.city}`;
  $("#updated-at").textContent = d.demo
    ? `Contoh dibuat ${observationDate(d.updated_at || Date.now(), { dateStyle: "long" })}`
    : `Data harian per ${observationDate(d.updated_at || Date.now(), { dateStyle: "long" })}`;
  $("#result-mode").textContent = d.demo ? "Data contoh" : "Data dari layanan";
  $("#market-message").textContent = d.demo
    ? "Data harga pasar belum tersedia dari layanan. Angka di bawah adalah data contoh untuk mencoba aplikasi, bukan acuan belanja hari ini."
    : "Periksa tanggal dan cakupan sumber sebelum menentukan belanja.";
  $("#result-price").innerHTML =
    `<span class="sr-only">${money(d.harga_rata_rata)} per ${safe(d.satuan)}</span><span id="animated-price" aria-hidden="true">${money(d.harga_rata_rata)}</span> <small aria-hidden="true">/ ${safe(d.satuan)}</small>`;
  cancelAnimationFrame(renderResult.priceFrame);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const start = performance.now();
    const priceNode = $("#animated-price");
    const animate = now => {
      const progress = Math.min(1, (now - start) / 700);
      priceNode.textContent = money(Math.round(d.harga_rata_rata * (0.85 + 0.15 * (1 - Math.pow(1 - progress, 3)))));
      if (progress < 1) renderResult.priceFrame = requestAnimationFrame(animate);
    };
    renderResult.priceFrame = requestAnimationFrame(animate);
  }
  $("#result-low").textContent = money(d.harga_terendah);
  $("#result-high").textContent = money(d.harga_tertinggi);
  $("#result-trend").className = "status " + (t.change > 0 ? "up" : "good");
  $("#result-trend").textContent =
    `${t.change > 0 ? "↗ Naik" : t.change < 0 ? "↘ Turun" : "Tetap"} ${number(Math.abs(t.percent))}%`;
  $("#result-change").textContent =
    `${t.change >= 0 ? "Naik" : "Turun"} ${money(Math.abs(t.change))} dibanding awal seri yang tersedia.`;
  const score =
    d.confidence_score === null
      ? null
      : Math.max(0, Math.min(100, d.confidence_score));
  $("#confidence").innerHTML = Array.from(
    { length: 5 },
    (_, i) =>
      `<i class="${score !== null && i < Math.round(score / 20) ? "filled" : ""}"></i>`,
  ).join("");
  $("#confidence-copy").textContent = d.demo
    ? `${score}/100 adalah nilai contoh, bukan ukuran keandalan harga terkini.`
    : score === null
      ? "Bank Indonesia (PIHPS) tidak menyediakan skor keyakinan untuk data ini."
      : `${score}/100. ${d.confidence_reason || "Skor dari layanan data."}`;
  const rows = [...d.perbandingan_wilayah].sort((a, b) => a.harga - b.harga);
  const max = Math.max(1, ...rows.map((r) => r.harga));
  $("#region-comparison").innerHTML = rows.length
    ? rows
        .map(
          (r) =>
            `<div class="comparison-row ${r.kota === q.city ? "current" : ""}"><div><span>${safe(r.kota)}${r.kota === q.city ? " · pilihanmu" : ""}</span><strong>${money(r.harga)}</strong></div><div class="comparison-track"><i style="width:${Math.max(0, Math.min(100, (r.harga / max) * 100))}%"></i></div></div>`,
        )
        .join("")
    : '<p class="small">Perbandingan belum tersedia dari layanan. Coba kota terdekat.</p>';
  $("#result-sources").innerHTML = d.daftar_sumber.length
    ? d.daftar_sumber
        .map((s, i) => {
          let url = null;
          try {
            const parsed = new URL(s.url);
            if (["http:", "https:"].includes(parsed.protocol))
              url = parsed.href;
          } catch {}
          return `<details ${i === 0 ? "open" : ""}><summary>${safe(s.nama)}</summary><p>${observationDate(s.tanggal, { dateStyle: "long" })}<br>Komoditas PIHPS: ${safe(s.komoditas || q.product)}<br>Harga: ${Number.isFinite(s.harga) ? money(s.harga) : "Tidak disertakan"}<br>${d.demo ? "Angka ilustrasi lokal. Tidak diambil dari situs resmi." : ""}</p>${url ? `<a href="${safe(url)}" target="_blank" rel="noopener noreferrer">Buka sumber ↗</a>` : ""}</details>`;
        })
        .join("")
    : '<p class="small">Sumber belum disertakan. Periksa layanan data sebelum menggunakan harga.</p>';
  $("#source-strip-names").innerHTML = d.daftar_sumber
    .map((s) => `<span>${safe(s.nama)}</span>`)
    .join("");
  $(".source-strip>span").textContent = "Sumber hasil terakhir";
  $(".source-strip small").textContent = d.demo
    ? "Data contoh lokal"
    : "Sesuai respons layanan";
  const shareText = `${d.demo ? "[DATA CONTOH, bukan harga terkini] " : ""}${q.product} di ${q.city}: ${money(d.harga_rata_rata)}/${d.satuan}. ${new Date().toLocaleDateString("id-ID")}. PantauPasar.`;
  $("#share-price").href = "https://wa.me/?text=" + encodeURIComponent(shareText);
  updateContext();
}
function drawChart() {
  if (!state.market || $("#hasil").hidden) return;
  $$("#period button").forEach((b) =>
    b.setAttribute(
      "aria-pressed",
      String(Number(b.dataset.days) === state.days),
    ),
  );
  const values = series(state.market, state.days);
  $("#chart-note").textContent =
    `${values.length} pembacaan dalam ${state.days} hari terakhir · ${state.market.demo ? "data contoh" : "data layanan"}`;
  $("#chart-summary").textContent = values.length
    ? `Harga ${money(values[0].harga)} pada awal seri menjadi ${money(values.at(-1).harga)} pada akhir seri. Satuan ${state.market.satuan}.`
    : "Belum ada riwayat harga. Coba pencarian lain.";
  const canvas = $("#market-chart");
  const context = canvas.getContext("2d");
  if (!context) {
    $("#chart-note").textContent += " Grafik tidak didukung browser ini.";
    return;
  }
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(bounds.width * ratio));
  canvas.height = Math.max(1, Math.round(bounds.height * ratio));
  context.scale(ratio, ratio);
  context.clearRect(0, 0, bounds.width, bounds.height);
  if (!values.length) return;

  const margin = { top: 12, right: 12, bottom: 30, left: 56 };
  const width = Math.max(1, bounds.width - margin.left - margin.right);
  const height = Math.max(1, bounds.height - margin.top - margin.bottom);
  const minimum = Math.min(...values.map((item) => item.harga));
  const maximum = Math.max(...values.map((item) => item.harga));
  const padding = Math.max((maximum - minimum) * 0.15, maximum * 0.02, 1);
  const low = minimum - padding;
  const high = maximum + padding;
  const x = (index) =>
    margin.left + (values.length < 2 ? width / 2 : (index / (values.length - 1)) * width);
  const y = (price) => margin.top + ((high - price) / (high - low)) * height;

  context.font = "12px Manrope, system-ui, sans-serif";
  context.textBaseline = "middle";
  context.strokeStyle = "#d9e4d7";
  context.fillStyle = "#53665a";
  context.lineWidth = 1;
  for (let tick = 0; tick <= 4; tick++) {
    const price = high - ((high - low) * tick) / 4;
    const lineY = y(price);
    context.beginPath();
    context.moveTo(margin.left, lineY);
    context.lineTo(margin.left + width, lineY);
    context.stroke();
    context.textAlign = "right";
    context.fillText(`${number(price / 1000)} rb`, margin.left - 8, lineY);
  }
  const labelCount = Math.min(5, values.length);
  for (let i = 0; i < labelCount; i++) {
    const index = Math.round((i * (values.length - 1)) / Math.max(1, labelCount - 1));
    context.textAlign = i === 0 ? "left" : i === labelCount - 1 ? "right" : "center";
    context.textBaseline = "top";
    context.fillText(
      observationDate(values[index].tanggal, {
        day: "numeric",
        month: "short",
      }),
      x(index),
      margin.top + height + 10,
    );
  }
  context.beginPath();
  values.forEach((item, index) => {
    if (index === 0) context.moveTo(x(index), y(item.harga));
    else context.lineTo(x(index), y(item.harga));
  });
  context.lineTo(x(values.length - 1), margin.top + height);
  context.lineTo(x(0), margin.top + height);
  context.closePath();
  context.fillStyle = "#eaf4e7";
  context.fill();
  context.beginPath();
  values.forEach((item, index) => {
    if (index === 0) context.moveTo(x(index), y(item.harga));
    else context.lineTo(x(index), y(item.harga));
  });
  context.strokeStyle = "#2e7a1f";
  context.lineWidth = 2;
  context.stroke();
  values.forEach((item, index) => {
    if (item.harga !== minimum && item.harga !== maximum) return;
    context.beginPath();
    context.arc(x(index), y(item.harga), 4, 0, Math.PI * 2);
    context.fillStyle = "#2e7a1f";
    context.fill();
  });
}
function renderWidget() {
  const q = state.query;
  const d = state.market;
  const chart = $("#widget-trend-chart");
  if (!q || !d) {
    $("#widget-product").textContent = "Belum ada pencarian";
    $("#widget-location").textContent = "Pilih produk dan wilayah";
    $("#widget-value").textContent = "—";
    $("#widget-unit").textContent = "—";
    $("#widget-trend").textContent = "Belum tersedia";
    $("#widget-trend").className = "status";
    $("#widget-low").textContent = "—";
    $("#widget-high").textContent = "—";
    $(".widget-head .demo-label").textContent = "Belum ada data";
    $(".widget-note").textContent =
      "Harga resmi ditampilkan bersama sumber dan tanggalnya.";
    $("#week-strip").textContent = "Riwayat harga tampil setelah pencarian.";
    chart.querySelector(".trend-area").setAttribute("d", "");
    chart.querySelector(".trend-line").setAttribute("d", "");
    chart.setAttribute("aria-label", "Grafik tren belum tersedia");
    return;
  }
  $("#widget-product").textContent = q.product;
  $("#widget-location").textContent = `${q.city}, ${q.province}`;
  $("#widget-value").textContent = money(d.harga_rata_rata);
  $("#widget-unit").textContent = d.satuan;
  $("#widget-low").textContent = money(d.harga_terendah);
  $("#widget-high").textContent = money(d.harga_tertinggi);
  $(".widget-head .demo-label").textContent = d.demo
    ? "Data contoh"
    : "Data layanan";
  $(".widget-note").textContent = d.demo
    ? "Contoh tampilan, bukan harga pasar."
    : "Periksa sumber dan tanggal data.";
  const t = trend(d);
  $("#widget-trend").textContent =
    `${t.change >= 0 ? "↗ Naik" : "↘ Turun"} ${number(Math.abs(t.percent))}%`;
  $("#widget-trend").className = "status " + (t.change >= 0 ? "up" : "good");
  const week = series(d, 7);
  const values = week.map((item) => item.harga);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const points = values.map((price, index) => ({
    x: values.length < 2 ? 46 : 2 + (index / (values.length - 1)) * 88,
    y: 29 - ((price - minimum) / range) * 22,
  }));
  const line = points
    .map(({ x, y }, index) => `${index ? "L" : "M"}${x},${y}`)
    .join(" ");
  chart.querySelector(".trend-line").setAttribute("d", line);
  chart
    .querySelector(".trend-area")
    .setAttribute(
      "d",
      points.length > 1 ? `${line} L${points.at(-1).x},34 L${points[0].x},34 Z` : "",
    );
  const lastPoint = points.at(-1);
  chart.querySelector(".trend-point").setAttribute("cx", lastPoint?.x ?? 46);
  chart.querySelector(".trend-point").setAttribute("cy", lastPoint?.y ?? 18);
  chart.setAttribute(
    "aria-label",
    values.length
      ? `Grafik tren harga ${values.length} pembacaan dalam 7 hari terakhir, dari ${money(values[0])} ke ${money(values.at(-1))} per ${d.satuan}`
      : "Grafik tren belum tersedia",
  );
  $("#week-strip").innerHTML = week
    .map((v, i) => {
      const date = new Date(v.tanggal || Date.now() - (6 - i) * 864e5);
      const selected = i === week.length - 1;
      return `<button type="button" class="day ${selected ? "selected" : ""}" data-day="${i}" aria-pressed="${selected}" aria-label="Harga ${observationDate(date)}">${observationDate(date, { weekday: "short" })}<strong>${date.getUTCDate()}</strong></button>`;
    })
    .join("");
  $("#week-strip").onclick = (e) => {
    const b = e.target.closest("[data-day]");
    if (!b) return;
    const item = week[b.dataset.day];
    $("#widget-value").textContent = money(
      typeof item === "number" ? item : item.harga,
    );
    $$(".day").forEach((x) => {
      x.classList.toggle("selected", x === b);
      x.setAttribute("aria-pressed", String(x === b));
    });
  };
}
const descriptions = [
  "Bandingkan harga, lihat pergerakannya, dan periksa asal angkanya.",
  "Lihat seberapa jauh perubahan biaya memengaruhi untung setiap produk.",
  "Rinci biaya bahan dan ketahui margin sebelum menetapkan harga jual.",
  "Bawa konteks harga ke pertanyaan tentang stok dan keuntungan.",
];
function feature(index) {
  $("#feature-list").innerHTML = modules
    .map(
      ([id, name], i) =>
        `<div class="feature-item ${i === index ? "active" : ""}"><button type="button" data-feature="${i}" aria-expanded="${i === index}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[id]}</svg><span>${i === 0 ? "Cek harga" : name}</span><span aria-hidden="true">${i === index ? "−" : "+"}</span></button><div class="feature-detail"><div><p>${descriptions[i]}</p><a href="#${id}">Buka ${name.toLowerCase()}</a></div></div></div>`,
    )
    .join("");
  const content = [
    [
      "Harga boleh berubah.<br>Rencanamu tetap terukur.",
      "Contoh harga cabai rawit merah / kg",
      "Rp 65.000",
      "Rp 68.000",
    ],
    [
      "Bahan naik 10%.<br>Untung masih cukup?",
      "Contoh untung per produk",
      "Rp 6.000",
      "Rp 5.200",
    ],
    [
      "Bukan sekadar laku.<br>Ketahui yang tersisa.",
      "Contoh produksi 20 porsi",
      "Rp 160.000",
      "Rp 140.000",
    ],
    [
      "Ada pertimbangan?<br>Mulai dari pertanyaanmu.",
      "Saran lokal dengan konteks harga",
      "Stok",
      "Harga jual",
    ],
  ][index];
  $("#feature-preview").innerHTML =
    `<span class="mini-title">${content[1]}</span><h3>${content[0]}</h3><div class="example-pair"><div>${index === 2 ? "Biaya bahan" : "Sebelum"}<strong>${content[2]}</strong></div><div>${index === 2 ? "Untung kotor" : "Sesudah"}<strong>${content[3]}</strong></div></div><p>Ilustrasi perhitungan, bukan hasil usaha nyata.</p>`;
}
function renderIngredients() {
  $("#ingredients").innerHTML = state.ingredients
    .map(
      (r, i) =>
        `<div class="ingredient"><label>Nama bahan<input data-ingredient="${i}" data-field="name" value="${safe(r.name)}" placeholder="Nama bahan" maxlength="100"></label><label>Total biaya (Rp)<input data-ingredient="${i}" data-field="cost" type="number" min="0" value="${r.cost}" required></label><button class="icon-button" type="button" data-remove="${i}" aria-label="Hapus bahan ${safe(r.name || i + 1)}">×</button></div>`,
    )
    .join("");
  profit();
}
function profit() {
  const qty = Math.max(1, Number($("#quantity").value) || 1),
    sale = Math.max(0, Number($("#sale-price").value) || 0),
    cost = state.ingredients.reduce(
      (sum, r) => sum + Math.max(0, Number(r.cost) || 0),
      0,
    ),
    unit = cost / qty,
    gain = sale - unit,
    total = gain * qty,
    margin = sale ? (gain / sale) * 100 : 0;
  state.profit = { qty, sale, cost, unit, gain, total, margin };
  $("#profit-margin").textContent = sale
    ? number(margin) + "%"
    : "Belum ada harga";
  $("#profit-status").className =
    "status " + (gain < 0 ? "danger" : margin < 20 ? "warning" : "good");
  $("#profit-status").textContent =
    gain < 0 ? "↓ Rugi" : margin < 20 ? "! Margin tipis" : "✓ Masih untung";
  $("#profit-details").innerHTML = [
    ["Total biaya bahan", cost],
    ["Biaya per produk", unit],
    ["Untung per produk", gain],
    ["Total untung kotor", total],
  ]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${money(v)}</dd></div>`)
    .join("");
  simulation();
}
function simulation() {
  if (!state.profit) return;
  const p = state.profit,
    raw = Number($("#raw-rise").value),
    ops = Number($("#ops-rise").value),
    sale = Math.max(0, Number($("#sim-sale").value) || 0),
    operating = Math.max(0, Number($("#operating").value) || 0) / p.qty,
    before = p.sale - p.unit - operating,
    after = sale - p.unit * (1 + raw / 100) - operating * (1 + ops / 100);
  $("#raw-output").textContent = raw + "%";
  $("#ops-output").textContent = ops + "%";
  $("#sim-sentence").textContent =
    `${after < 0 ? "Hasilmu menjadi rugi" : after < before ? "Untungmu turun" : after > before ? "Untungmu naik" : "Untungmu tetap"} dari ${money(before)} menjadi ${money(after)} per produk.`;
  const margin = sale ? (after / sale) * 100 : 0;
  $("#sim-status").className =
    "status " + (after < 0 ? "danger" : margin < 20 ? "warning" : "good");
  $("#sim-status").textContent =
    after < 0 ? "↓ Rugi" : margin < 20 ? "! Waspada" : "✓ Aman dalam simulasi";
  $("#before-value").textContent = money(before);
  $("#after-value").textContent = money(after);
  const max = Math.max(1, Math.abs(before), Math.abs(after));
  $("#before-bar").style.width = (Math.max(0, before) / max) * 100 + "%";
  $("#after-bar").style.width = (Math.max(0, after) / max) * 100 + "%";
  $("#after-bar").style.background = after < 0 ? "#b42318" : "#2e7a1f";
  $("#sim-note").textContent =
    `Dihitung dari ${p.qty} produk, bahan ${money(p.unit)} dan operasional ${money(operating)} per produk. Skenario ini bukan prediksi harga.`;
}
let simulateTimer;
function requestSimulation() {
  simulation();
  clearTimeout(simulateTimer);
  simulateTimer = setTimeout(async () => {
    const snapshot = ++state.request;
    try {
      const result = await PantauApi.request(
        "/api/simulate",
        {
          method: "POST",
          body: JSON.stringify({
            bahan_baku: state.profit.cost,
            jumlah_produk: state.profit.qty,
            harga_jual: Number($("#sim-sale").value),
            kenaikan_bahan: Number($("#raw-rise").value),
            kenaikan_operasional: Number($("#ops-rise").value),
            operasional: Number($("#operating").value),
          }),
        },
        () => ({ local: true }),
      );
      if (
        snapshot === state.request &&
        !result.fallback &&
        result.data.ringkasan
      )
        $("#sim-note").textContent = String(result.data.ringkasan);
    } catch (error) {
      toast(error.message);
    }
  }, 450);
}
function useMarket() {
  if (!state.market) {
    toast("Cek harga produk terlebih dahulu agar biaya bisa diambil.");
    go("harga");
    return;
  }
  const match = state.ingredients.find((r) => r.name === state.query.product);
  if (match) match.cost = state.market.harga_rata_rata;
  else
    state.ingredients.push({
      name: state.query.product,
      cost: state.market.harga_rata_rata,
    });
  renderIngredients();
  toast(
    `Biaya ditambahkan untuk 1 ${state.market.satuan}. Sesuaikan dengan pemakaianmu.`,
  );
  go("untung");
}
function updateContext() {
  $("#advisor-context").textContent = state.query
    ? `Berdasarkan ${state.market.demo ? "contoh " : ""}harga ${state.query.product.toLowerCase()} di ${state.query.city}: ${money(state.market.harga_rata_rata)} / ${state.market.satuan}. ${new Date().toLocaleDateString("id-ID", { dateStyle: "long" })}.`
    : "Belum ada pencarian harga. Kamu bisa bertanya secara umum atau cek harga dahulu untuk menambahkan konteks.";
}
function localAdvice(question) {
  const p = state.profit;
  const stock = /stok|belanja/i.test(question);
  return {
    ringkasan: stock
      ? "Mulai dari kebutuhan penjualan, bukan dugaan harga besok."
      : `Dari inputmu, untung kotor saat ini ${money(p.gain)} per produk.`,
    yang_perlu_dilakukan: stock
      ? "Catat penjualan harian dan umur simpan bahan. Bandingkan harga dua pemasok, lalu beli sesuai kebutuhan yang benar-benar terjual."
      : `Periksa ulang biaya bahan dan operasional. Coba skenario kenaikan 10% di Kalau naik?, lalu bandingkan opsi porsi, pemasok, atau harga jual.`,
    hati_hati:
      "Ini saran contoh berbasis aturan lokal. Harga demo bukan harga terkini dan tidak dapat dipakai untuk meramalkan kenaikan. Periksa harga pemasok sebelum mengambil keputusan.",
  };
}
async function ask(event) {
  event.preventDefault();
  const question = $("#question").value.trim();
  if (!question || $("#ask-button").disabled) return;
  $("#ask-button").disabled = true;
  $(".chat-empty")?.remove();
  const bubble = document.createElement("p");
  bubble.className = "chat-question";
  bubble.textContent = question;
  $("#conversation").append(bubble);
  const answer = document.createElement("div");
  answer.className = "chat-answer";
  answer.textContent = "Sedang menyusun saran…";
  $("#conversation").append(answer);
  $("#question").value = "";
  answer.scrollIntoView({ block: "nearest" });
  try {
    const response = await PantauApi.request(
      "/api/advisor",
      {
        method: "POST",
        body: JSON.stringify({
          pertanyaan: question,
          konteks: state.query,
          market: state.market,
          perhitungan: state.profit,
        }),
      },
      () => localAdvice(question),
    );
    const d = response.data;
    if (!d.ringkasan || !d.yang_perlu_dilakukan || !d.hati_hati)
      throw new Error("Jawaban layanan belum lengkap. Coba pertanyaan lain.");
    answer.innerHTML = [
      ["Ringkasan", d.ringkasan],
      [
        "Yang perlu dilakukan",
        Array.isArray(d.yang_perlu_dilakukan)
          ? d.yang_perlu_dilakukan.join("\n")
          : d.yang_perlu_dilakukan,
      ],
      ["Hati-hati", d.hati_hati],
    ]
      .map(([h, t]) => `<h3>${h}</h3><p>${safe(t)}</p>`)
      .join("");
  } catch (error) {
    answer.textContent = error.message + " Kirim ulang untuk mencoba lagi.";
  } finally {
    $("#ask-button").disabled = false;
    answer.scrollIntoView({ block: "nearest" });
  }
}
nav();
const region = read("pp_region", {});
if (places[region.province]) $("#province").value = region.province;
fillCities(region.city);
history();
feature(0);
renderWidget();
renderIngredients();
updateContext();
route();
window.addEventListener("hashchange", route);
$("#province").addEventListener("change", () => fillCities());
$("#city").addEventListener("change", () => fillCities($("#city").value));
$("#product").addEventListener("input", () => {
  clearTimeout(productSuggestionTimer);
  productSuggestionTimer = setTimeout(updateProductSuggestions, 180);
});
$("#product").addEventListener("keydown", (event) => {
  const options = $$("#product-suggestions [data-product-option]");
  const active = options.indexOf(document.activeElement);
  if (event.key === "ArrowDown" && options.length) {
    event.preventDefault();
    options[Math.min(active + 1, options.length - 1)].focus();
  } else if (event.key === "ArrowUp" && active > 0) {
    event.preventDefault();
    options[active - 1].focus();
  } else if (event.key === "Escape") {
    closeProductSuggestions();
  }
});
$("#product-suggestions").addEventListener("click", (event) => {
  const option = event.target.closest("[data-product-option]");
  if (!option) return;
  $("#product").value = option.dataset.product;
  closeProductSuggestions();
  $("#product").focus();
});
$("#product-suggestions").addEventListener("pointerdown", (event) => {
  if (event.target.closest("[data-product-option]")) event.preventDefault();
});
$("#product-suggestions").addEventListener("keydown", (event) => {
  const options = $$("#product-suggestions [data-product-option]");
  const active = options.indexOf(document.activeElement);
  if (event.key === "ArrowDown" && active < options.length - 1) {
    event.preventDefault();
    options[active + 1].focus();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (active > 0) options[active - 1].focus();
    else $("#product").focus();
  } else if (event.key === "Escape") {
    closeProductSuggestions();
    $("#product").focus();
  }
});
$("#product").addEventListener("blur", () => {
  setTimeout(() => {
    if (!$("#product-suggestions").contains(document.activeElement))
      closeProductSuggestions();
  }, 0);
});
$("#market-form").addEventListener("submit", marketSearch);
$("#header-search").onclick = () => {
  go("harga");
  setTimeout(() => $("#product").focus(), 40);
};
$("#back-search").onclick = () => go("harga");
$("#about-data").onclick = () => $("#data-dialog").showModal();
$$("dialog").forEach((dialog) =>
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
    }
  }),
);
$("#recent-searches").onclick = (e) => {
  const b = e.target.closest("[data-history]");
  if (!b) return;
  const q = state.history[b.dataset.history];
  $("#province").value = q.province;
  fillCities(q.city);
  $("#product").value = q.product;
  marketSearch();
};
$("#feature-list").onclick = (e) => {
  const button = e.target.closest("[data-feature]");
  if (button) {
    const index = Number(button.dataset.feature);
    feature(index);
    $(`[data-feature="${index}"]`).focus({ preventScroll: true });
  }
};
$("#period").onclick = (e) => {
  const button = e.target.closest("[data-days]");
  if (button) {
    state.days = Number(button.dataset.days);
    drawChart();
  }
};
$("#ingredients").addEventListener("input", (e) => {
  const i = e.target.dataset.ingredient;
  if (i === undefined) return;
  state.ingredients[i][e.target.dataset.field] =
    e.target.dataset.field === "cost"
      ? Math.max(0, Number(e.target.value) || 0)
      : e.target.value;
  profit();
});
$("#ingredients").onclick = (e) => {
  const b = e.target.closest("[data-remove]");
  if (b) {
    state.ingredients.splice(Number(b.dataset.remove), 1);
    renderIngredients();
    if (!state.ingredients.length)
      toast("Belum ada bahan. Tambah bahan untuk mulai menghitung.");
  }
};
$("#add-ingredient").onclick = () => {
  state.ingredients.push({ name: "", cost: 0 });
  renderIngredients();
  $$("#ingredients input").at(-2).focus();
};
$("#profit-form").onsubmit = (e) => e.preventDefault();
$("#profit-form").addEventListener("input", profit);
$("#simulation-form").onsubmit = (e) => e.preventDefault();
$("#simulation-form").addEventListener("input", requestSimulation);
$$("[data-preset]").forEach(
  (b) =>
    (b.onclick = () => {
      $("#raw-rise").value = b.dataset.preset;
      $("#ops-rise").value = b.dataset.preset === "0" ? 0 : 5;
      if (b.dataset.preset === "0") $("#sim-sale").value = state.profit.sale;
      requestSimulation();
    }),
);
$("#go-simulate").onclick = () => {
  $("#sim-sale").value = state.profit.sale;
  go("simulasi");
};
$("#use-market").onclick = useMarket;
$("#use-for-profit").onclick = useMarket;
$("#advisor-form").onsubmit = ask;
$$("[data-question]").forEach(
  (b) =>
    (b.onclick = () => {
      $("#question").value = b.dataset.question;
      $("#question").focus();
    }),
);
PantauApi.request("/api/activity", {}, () => state.history)
  .then((response) => {
    const data = Array.isArray(response.data)
      ? response.data
      : response.data.items;
    if (
      Array.isArray(data) &&
      data.every(
        (q) =>
          places[q.province]?.includes(q.city) && typeof q.product === "string",
      )
    ) {
      const seen = new Set();
      state.history = [...data, ...state.history]
        .filter((item) => {
          const key = `${item.province}\u0000${item.city}\u0000${item.product}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 5);
      save("pp_history", state.history);
      history();
    }
  })
  .catch((error) => toast(error.message));

window.addEventListener("resize", () => {
  if (!$("#hasil").hidden) drawChart();
});

"use strict";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const money = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
const primaryMarketPrice = (data) =>
  data?.market_type === "web_offers"
    ? data.offer_list?.[0]?.price
    : data?.harga_rata_rata;
function setWidgetPriceLabel(label) {
  const paragraph = $(".widget-price > p");
  if (!paragraph) return;
  if (!$("#widget-unit")) {
    const unit = document.createElement("span");
    unit.id = "widget-unit";
    unit.textContent = "—";
    paragraph.append(unit);
  }
  const textNode = [...paragraph.childNodes].find(
    (node) => node.nodeType === Node.TEXT_NODE,
  );
  if (textNode) textNode.textContent = label;
  else paragraph.insertBefore(document.createTextNode(label), paragraph.firstChild);
}
const number = (n) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);
const observationDate = (value, options = {}) =>
  Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString("id-ID", {
    ...options,
    timeZone: "UTC",
  }) : "Tidak tersedia";
const searchTime = (value) => Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }) + " WIB"
  : "Tidak tersedia";
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
  ["simulasi", "Simulasi biaya"],
  ["untung", "Hitung keuntungan"],
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
  marketFreshness: "latest",
  ingredients: [
    { name: "Bahan utama", cost: 120000 },
    { name: "Bumbu & pelengkap", cost: 40000 },
  ],
  profit: null,
  request: 0,
  busy: false,
  searchSequence: 0,
  searchController: null,
  searchQuery: null,
  retryUntil: 0,
};
state.history = (Array.isArray(state.history) ? state.history : []).filter(
  (item) =>
    typeof item?.product === "string" &&
    typeof item?.province === "string" &&
    typeof item?.city === "string",
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
function fillCities(preferred, province = $("#province").value) {
  $("#province").value = province;
  const cities = places[province] || [];
  $("#city-options").innerHTML = cities
    .map((city) => `<option>${safe(city)}</option>`)
    .join("");
  $("#city").value = preferred || cities[0] || "";
  save("pp_region", { province, city: $("#city").value });
}
let regionRequest = 0;
async function loadRegions(province = null) {
  const request = ++regionRequest;
  try {
    const response = await PantauApi.request("/api/market/regions" + (province ? "?provinsi=" + encodeURIComponent(province) : ""));
    if (request !== regionRequest) return;
    const items = province ? response.data.cities : response.data.provinces;
    if (!Array.isArray(items)) return;
    const options = items.filter(item => typeof item?.name === "string").map(item => `<option>${safe(item.name)}</option>`).join("");
    $(province ? "#city-options" : "#province-options").innerHTML = options;
    if (!province) loadRegions($("#province").value);
  } catch {
    // Free text remains available when the official suggestions cannot be read.
  }
}
async function loadCapabilities() {
  try {
    const { data } = await PantauApi.request("/api/health");
    const free = data.capabilities?.free_search;
    const unavailable = ["unconfigured", "not_configured", "unavailable", "disabled"].includes(free?.status || free)
      || [data.vleee, data.web_search].some(value => ["not_configured", "unconfigured", "disabled"].includes(value));
    const status = $("#provider-status");
    status.hidden = !unavailable;
    status.textContent = "Barang di luar katalog PIHPS belum didukung.";
  } catch {}
}
let productSuggestionTimer;
let productSuggestionRequest = 0;
function syncCommoditySelection() {
  const product = $("#product").value.trim().toLocaleLowerCase("id-ID");
  $$("[data-commodity]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.commodity.toLocaleLowerCase("id-ID") === product));
  });
}
function closeProductSuggestions() {
  productSuggestionRequest++;
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
    formHint("");
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
    const hasExactMatch = items.some(
      ({ label }) =>
        label.trim().toLocaleLowerCase("id-ID") ===
        query.toLocaleLowerCase("id-ID"),
    );
    suggestions.innerHTML = items
      .map(
        ({ label }, index) =>
          `<button type="button" class="product-suggestion" role="option" aria-selected="false" data-product-option="${index}" data-product="${safe(label)}">${safe(label)}</button>`,
      )
      .join("");
    const hasSuggestions = items.length > 0;
    suggestions.hidden = !hasSuggestions;
    $("#product").setAttribute("aria-expanded", String(hasSuggestions));
    $(".form-help").textContent = hasExactMatch
      ? "Bahan ditemukan di katalog. Tekan Cek harga untuk melihat data wilayahmu."
      : hasSuggestions
        ? "Pilih jenis bahan dari daftar agar harganya sesuai."
        : "Bahan belum ditemukan di katalog PIHPS. Coba nama lain, misalnya beras atau cabai.";
  } catch (error) {
    if (requestId !== productSuggestionRequest) return;
    closeProductSuggestions();
    $(".form-help").textContent =
      error.message || "Saran produk sementara tidak tersedia.";
  }
}
function normalizedMarket(data) {
  const verifiedSources = Array.isArray(data?.daftar_sumber)
    ? data.daftar_sumber.every((source) => {
        if (
          typeof source?.nama !== "string" ||
          !source.nama.trim() ||
          (data?.market_type === "web_offers"
            ? !Number.isFinite(Date.parse(source.diakses_pada)) || (source.tanggal !== null && !Number.isFinite(Date.parse(source.tanggal)))
            : typeof source.tanggal !== "string" || !Number.isFinite(Date.parse(source.tanggal))) ||
          typeof source.url !== "string"
        )
          return false;
        try {
          const url = new URL(source.url);
          return url.protocol === "https:" && !url.username && !url.password;
        } catch {
          return false;
        }
      })
    : false;
  if (
    data?.demo === true ||
    !data ||
    !Number.isFinite(data.harga_rata_rata) ||
    data.harga_rata_rata <= 0 ||
    !Array.isArray(data.tren_7_hari_terakhir) ||
    !Array.isArray(data.perbandingan_wilayah) ||
    data.perbandingan_wilayah.some(item => !item || typeof item.kota !== "string" || !Number.isFinite(item.harga) || item.harga <= 0) ||
    !Array.isArray(data.daftar_sumber) ||
    !data.daftar_sumber.length ||
    !verifiedSources ||
    !Number.isFinite(Date.parse(data.updated_at)) ||
    !data.satuan ||
    !Number.isFinite(data.harga_terendah) ||
    !Number.isFinite(data.harga_tertinggi) ||
    (data.confidence_score !== null &&
      !Number.isFinite(data.confidence_score)) ||
    (data.market_type === "web_offers" &&
      (!Array.isArray(data.offer_list) ||
        !data.offer_list.length ||
        data.offer_list.some(
          (offer) =>
            !offer ||
            typeof offer.title !== "string" ||
            !Number.isSafeInteger(offer.price) ||
            offer.price <= 0 ||
            typeof offer.unit !== "string" ||
            !offer.unit.trim() ||
            !Number.isFinite(Date.parse(offer.accessed_at)) ||
            (offer.source_date !== null && !Number.isFinite(Date.parse(offer.source_date))) ||
            typeof offer.source_url !== "string" ||
            !data.daftar_sumber.some(
              (source) =>
                source.url === offer.source_url &&
                source.harga === offer.price && source.satuan === offer.unit,
            ),
        )))
  )
    throw new Error(
      "Harga belum memiliki data sumber yang terverifikasi. Tidak ada harga contoh yang ditampilkan.",
    );
  return data;
}
function displayMarket(data, query, freshness) {
  state.market = data;
  state.query = {
    ...query,
    product: data.produk || query.product,
  };
  state.marketFreshness = freshness;
  state.days = 7;
  state.history = [
    state.query,
    ...state.history.filter(
      (item) =>
        item.product !== state.query.product ||
        item.city !== state.query.city ||
        item.province !== state.query.province,
    ),
  ].slice(0, 5);
  save("pp_history", state.history);
  renderResult();
  renderWidget();
  history();
  go("hasil");
}
function history() {
  const items = Array.isArray(state.history) ? state.history : [];
  $(".recent").hidden = items.length === 0;
  $("#recent-searches").innerHTML = items.length
    ? `${items
        .slice(0, 3)
        .map(
          (q, i) =>
            `<button type="button" class="text-button" data-history="${i}">${safe(q.product)} · ${safe(q.city)}</button>`,
        )
        .join("")}<button type="button" class="text-button history-clear" data-clear-history>Hapus riwayat</button>`
    : "Belum ada pencarian. Mulai dari produk di atas.";
}
function showSearchError(message) {
  const error = $("#search-error");
  error.textContent = message;
  error.hidden = !message;
}
function setSearchBusy(busy) {
  state.busy = busy;
  $("#search-button").disabled = busy;
  $("#search-button").toggleAttribute("aria-busy", busy);
  $("#search-button").textContent = busy ? "Mencari sumber harga…" : "Cek harga";
  $("#refresh-market").disabled = busy;
  $("#refresh-market").textContent = busy ? "Memperbarui…" : "Perbarui dari sumber";
  $("#cancel-search").hidden = !busy;
}
function cancelSearch(message = "Pencarian dibatalkan. Kamu bisa mencoba nama barang atau wilayah lain.") {
  if (!state.busy) return;
  state.searchSequence++;
  state.searchController?.abort();
  state.searchController = null;
  setSearchBusy(false);
  formHint(message);
}
async function marketSearch(event, { force = false } = {}) {
  event?.preventDefault();
  const q = force && state.searchQuery ? { ...state.searchQuery } : {
    province: $("#province").value.trim(),
    city: $("#city").value.trim(),
    product: $("#product").value.trim(),
    compare: $("#compare-cities").value.trim(),
  };
  if (!q.product || !q.province || !q.city) {
    showSearchError("Isi nama barang, provinsi, dan kota atau kabupaten terlebih dahulu.");
    return;
  }
  if (state.retryUntil > Date.now()) {
    const message = `Batas permintaan tercapai. Coba lagi dalam ${Math.ceil((state.retryUntil - Date.now()) / 1000)} detik.`;
    showSearchError(message);
    if (force) { $("#market-message").textContent = message; $("#market-message").className = "notice error"; }
    return;
  }
  cancelSearch();
  closeProductSuggestions();
  showSearchError("");
  state.searchQuery = q;
  const sequence = ++state.searchSequence;
  const cached = PantauMarketCache.read(q);
  if (cached.entry && cached.fresh && !force) {
    try {
      const data = normalizedMarket(cached.entry.market);
      displayMarket(data, data.resolved_query || q, "cached");
      formHint("Data dimuat dari browser. Pilih Perbarui dari sumber untuk mengambil ulang.");
      return;
    } catch {}
  }
  setSearchBusy(true);
  state.searchController = new AbortController();
  formHint("Sedang membaca sumber. Data mengikuti ketersediaan sumber resmi.");
  if (force) $("#market-message").textContent = "Memperbarui dari sumber. Hasil sebelumnya tetap terlihat sampai pembacaan selesai.";
  try {
    const params = new URLSearchParams({ provinsi: q.province, kota: q.city, produk: q.product });
    if (q.compare) params.set("bandingkan", q.compare);
    if (force) params.set("refresh", "1");
    const response = await PantauApi.request("/api/market?" + params, { signal: state.searchController.signal });
    if (sequence !== state.searchSequence) return;
    const data = normalizedMarket(response.data);
    const resolvedQuery = data.resolved_query || q;
    fillCities(resolvedQuery.city, resolvedQuery.province);
    const saved = PantauMarketCache.write(q, data, data.market_type === "web_offers"
      ? window.PP_CONFIG.webOfferCacheTtlMs : window.PP_CONFIG.marketCacheTtlMs);
    const freshness = data.cache?.status === "stale" ? "stale" : data.cache?.hit ? "server" : "latest";
    displayMarket(data, resolvedQuery, freshness);
    formHint(freshness === "stale" ? "Pembaruan gagal. Hasil lama diberi penanda pada halaman hasil." : "Hasil tersedia bersama sumber dan waktu pengambilannya.");
    if (saved.error) toast("Harga dimuat, tetapi penyimpanan browser tidak tersedia.");
  } catch (error) {
    if (sequence !== state.searchSequence || error.code === "CANCELLED") return;
    if (error.status === 429) state.retryUntil = Date.now() + Math.min(300, Math.max(1, error.retry)) * 1000;
    const message = error.status === 429
      ? `${error.message} Coba lagi dalam ${Math.ceil((state.retryUntil - Date.now()) / 1000)} detik.`
      : error.message;
    let usedStale = false;
    if (cached.entry) {
      try {
        displayMarket(normalizedMarket(cached.entry.market), cached.entry.market.resolved_query || q, "stale");
        usedStale = true;
      } catch {}
    }
    if (!usedStale && force && state.market) {
      state.marketFreshness = "stale";
      renderResult();
      renderWidget();
    }
    showSearchError(message);
    formHint(usedStale ? "Pembaruan gagal; hasil lama ditandai dan waktu pengambilannya tetap ditampilkan." : message);
    if (usedStale || force) $("#market-message").textContent += ` ${message}`;
  } finally {
    if (sequence === state.searchSequence) {
      state.searchController = null;
      setSearchBusy(false);
    }
  }
}
function formHint(message) {
  $(".form-help").textContent = message;
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
    t = trend(d),
    sourceDate = observationDate(d.updated_at, { dateStyle: "long" });
  const webOffers = d.market_type === "web_offers";
  const fetchedAt = searchTime(d.cache?.fetched_at || d.searched_at || (webOffers ? d.updated_at : null));
  $("#result-title").textContent = webOffers
    ? q.product
    : `${q.product} di ${q.city}`;
  $("#updated-at").textContent = webOffers
    ? `Wilayah pencarian: ${q.city}, ${q.province} · bukan konfirmasi lokasi penjual`
    : `Tanggal data sumber: ${sourceDate}`;
  $("#result-mode").textContent =
    ["cached", "server"].includes(state.marketFreshness)
      ? "Data tersimpan"
      : state.marketFreshness === "stale"
        ? "Data mungkin sudah tidak terbaru"
        : d.comparison
          ? "Perbandingan wilayah"
        : webOffers
          ? "Penawaran dari web"
          : "Data sumber · PIHPS";
  $("#market-message").className =
    state.marketFreshness === "stale" ? "notice error" : "notice neutral";
  $("#result-mode").className = state.marketFreshness === "stale" ? "status warning" : "status neutral";
  $("#market-message").textContent =
    state.marketFreshness === "cached"
      ? "Menampilkan hasil pencarian yang tersimpan. Pilih Perbarui dari sumber untuk memeriksa ulang."
      : state.marketFreshness === "server"
        ? "Menampilkan hasil pencarian yang tersimpan. Pilih Perbarui dari sumber untuk memeriksa ulang."
      : state.marketFreshness === "stale"
        ? `Pembaruan gagal. Data tersimpan ditampilkan dan mungkin sudah tidak berlaku. ${webOffers ? "Tanggal harga mengikuti masing-masing sumber." : `Tanggal harga sumber: ${sourceDate}.`}`
        : d.comparison
          ? `Harga dibandingkan untuk ${d.perbandingan_wilayah.map((item) => item.kota).join(", ")}. Periksa satuan dan tanggal tiap wilayah sebelum membandingkan.`
        : webOffers
          ? `Penawaran dicari dari sumber web. Wilayah hanya untuk relevansi; pastikan stok, harga, dan ongkir pada halaman penjual. Harga hanya ditampilkan jika terverifikasi pada cuplikan sumber HTTPS.`
          : d.ai_assisted
          ? `AI membantu mencocokkan komoditas; harga diverifikasi dari PIHPS. Tanggal data: ${sourceDate}.`
          : `Harga diambil dari PIHPS. Tanggal data: ${sourceDate}.`;
  $("#cache-age").textContent = `Terakhir diambil: ${fetchedAt}. Tanggal harga mengikuti sumber.`;
  const unavailable = Array.isArray(d.unavailable_locations) ? d.unavailable_locations : [];
  $("#coverage-note").hidden = !unavailable.length && !webOffers;
  $("#coverage-note").textContent = unavailable.length
    ? `Data belum tersedia untuk ${unavailable.map(item => `${item.city}, ${item.province}`).join("; ")}. Hasil ini belum mencakup seluruh wilayah yang diminta.`
    : "Cakupan web terbatas pada cuplikan sumber yang ditemukan. Harga dengan kemasan atau satuan berbeda tidak dirata-ratakan. Lokasi penjual belum tentu sesuai wilayah pencarian.";
  const resultPriceLabel = $("#result-price-label");
  if (resultPriceLabel)
    resultPriceLabel.textContent = webOffers
      ? "Salah satu penawaran"
      : "Harga rata-rata";
  const displayedPrice = primaryMarketPrice(d);
  const displayedUnit = webOffers ? d.offer_list[0].unit : d.satuan;
  $("#result-price").innerHTML =
    `<span class="sr-only">${money(displayedPrice)} per ${safe(displayedUnit)}</span><span id="animated-price" aria-hidden="true">${money(displayedPrice)}</span> <small aria-hidden="true">/ ${safe(displayedUnit)}</small>`;
  cancelAnimationFrame(renderResult.priceFrame);
  if (!webOffers && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const start = performance.now();
    const priceNode = $("#animated-price");
    const animate = now => {
      const progress = Math.min(1, (now - start) / 700);
      priceNode.textContent = money(Math.round(displayedPrice * (0.85 + 0.15 * (1 - Math.pow(1 - progress, 3)))));
      if (progress < 1) renderResult.priceFrame = requestAnimationFrame(animate);
    };
    renderResult.priceFrame = requestAnimationFrame(animate);
  }
  $("#result-low").textContent = money(d.harga_terendah);
  $("#result-high").textContent = money(d.harga_tertinggi);
  $(".price-range").hidden = webOffers;
  $("#result-trend").className = "status " + (t.change > 0 ? "up" : "good");
  $("#result-trend").textContent =
    `${t.change > 0 ? "↗ Naik" : t.change < 0 ? "↘ Turun" : "Tetap"} ${number(Math.abs(t.percent))}%`;
  $("#result-change").textContent =
    t.change === 0 ? "Harga tidak berubah dibanding awal seri yang tersedia." : `${t.change > 0 ? "Naik" : "Turun"} ${money(Math.abs(t.change))} dibanding awal seri yang tersedia.`;
  $("#result-trend").hidden = webOffers || series(d, 7).length < 2;
  $("#result-change").hidden = webOffers || series(d, 7).length < 2;
  $(".price-summary > h2").hidden = webOffers;
  $("#confidence").hidden = webOffers;
  $("#confidence-copy").hidden = webOffers || d.confidence_score === null;
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
            `<div class="comparison-row ${r.kota === q.city ? "current" : ""}"><div><span>${safe(r.kota)}${r.kota === q.city ? " · pilihanmu" : ""}<small>${safe(r.provinsi || "")} · ${observationDate(r.tanggal || d.updated_at, { dateStyle: "medium" })}</small></span><strong>${money(r.harga)} / ${safe(r.satuan || d.satuan)}</strong></div><div class="comparison-track"><i style="width:${Math.max(0, Math.min(100, (r.harga / max) * 100))}%"></i></div></div>`,
        )
        .join("")
    : '<p class="small">Belum ada harga pembanding. Pilih kota lain melalui Ubah pencarian, lalu buka Bandingkan dengan kota lain.</p>';
  $("#region-comparison").closest("article").hidden =
    webOffers && !d.comparison;
  $(".chart-panel").hidden = webOffers;
  $("#market-offers-panel").hidden = !webOffers;
  $("#market-offers-list").innerHTML = webOffers
    ? d.offer_list
        .map((offer) => {
          const dateText = offer.source_date
            ? `Tanggal pada sumber: ${observationDate(offer.source_date, { dateStyle: "long" })}`
            : "Tanggal harga tidak dicantumkan sumber";
          return `<article class="market-offer"><h3>${safe(offer.title)}</h3><p class="market-offer-price">${money(offer.price)} <small>/ ${safe(offer.unit)}</small></p><p class="small">${offer.city ? `Wilayah pada sumber: ${safe(offer.city)}, ${safe(offer.province || "")}` : "Lokasi penjual belum diverifikasi"}</p>${offer.seller ? `<p class="small">Penjual: ${safe(offer.seller)}</p>` : ""}<p class="small">${safe(offer.source_name)} · ${dateText}<br>Ditemukan: ${searchTime(offer.accessed_at)}</p><a href="${safe(offer.source_url)}" target="_blank" rel="noopener noreferrer">Lihat penawaran ↗</a></article>`;
        })
        .join("")
    : "";
  $("#result-sources").innerHTML = d.daftar_sumber.length
    ? d.daftar_sumber
        .map((s, i) => {
          let url = null;
          try {
            const parsed = new URL(s.url);
            if (parsed.protocol === "https:" && !parsed.username && !parsed.password)
              url = parsed.href;
          } catch {}
          const sourceDateText = s.tanggal_sumber
            ? `Tanggal pada sumber: ${observationDate(s.tanggal_sumber, { dateStyle: "long" })}`
            : webOffers
              ? "Tanggal harga tidak dicantumkan sumber"
              : observationDate(s.tanggal, { dateStyle: "long" });
          return `<details ${i === 0 ? "open" : ""}><summary>${safe(s.nama)}</summary><p>${sourceDateText}${webOffers ? `<br>Ditemukan: ${observationDate(s.diakses_pada, { dateStyle: "long" })}` : ""}<br>Komoditas: ${safe(s.komoditas || q.product)}<br>Harga: ${Number.isFinite(s.harga) ? `${money(s.harga)}${s.satuan ? ` / ${safe(s.satuan)}` : ""}` : "Tidak disertakan"}</p>${url ? `<a href="${safe(url)}" target="_blank" rel="noopener noreferrer">${webOffers ? "Lihat penawaran ↗" : "Buka sumber ↗"}</a>` : ""}</details>`;
        })
        .join("")
    : '<p class="small">Sumber belum disertakan. Periksa layanan data sebelum menggunakan harga.</p>';
  $("#source-strip-names").innerHTML = d.daftar_sumber
    .map((s) => `<span>${safe(s.nama)}</span>`)
    .join("");
  $(".source-strip>span").textContent = "Sumber hasil terakhir";
  $(".source-strip small").textContent = webOffers
    ? `Waktu pencarian: ${sourceDate}; tanggal dari tiap sumber ditampilkan jika tersedia.`
    : d.demo
      ? "Data contoh lokal"
      : `Tanggal data: ${sourceDate}`;
  const shareText = `${state.marketFreshness === "stale" ? "[DATA LAMA, pembaruan gagal] " : ""}${webOffers ? "Penawaran " : ""}${q.product}${webOffers ? ` (wilayah pencarian ${q.city})` : ` di ${q.city}`}: ${money(displayedPrice)}/${displayedUnit}. ${webOffers ? `Diambil ${fetchedAt}; tanggal harga periksa di sumber` : `Tanggal harga ${sourceDate}`}. Sumber: ${d.daftar_sumber[0].url}. PantauPasar.`;
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
  $("#history-rows").innerHTML = values.map(item => `<tr><td>${observationDate(item.tanggal, {dateStyle:"medium"})}</td><td>${money(item.harga)}</td><td>${safe(state.market.satuan)}</td></tr>`).join("");
  $("#export-prices").disabled = !values.length;
  $("#chart-note").textContent =
    `${values.length} pembacaan dalam ${state.days} hari terakhir · ${
      state.market.demo
        ? "data contoh"
        : state.marketFreshness === "cached"
          ? "cache browser"
          : state.marketFreshness === "stale"
            ? "cache lama"
            : "PIHPS"
    }`;
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
  const palette = getComputedStyle(document.documentElement);
  context.strokeStyle = palette.getPropertyValue("--line").trim();
  context.fillStyle = palette.getPropertyValue("--slate").trim();
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
  context.fillStyle = palette.getPropertyValue("--primary-soft").trim();
  context.fill();
  context.beginPath();
  values.forEach((item, index) => {
    if (index === 0) context.moveTo(x(index), y(item.harga));
    else context.lineTo(x(index), y(item.harga));
  });
  context.strokeStyle = palette.getPropertyValue("--primary").trim();
  context.lineWidth = 2;
  context.stroke();
  values.forEach((item, index) => {
    if (item.harga !== minimum && item.harga !== maximum) return;
    context.beginPath();
    context.arc(x(index), y(item.harga), 4, 0, Math.PI * 2);
    context.fillStyle = palette.getPropertyValue("--primary").trim();
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
  if (d.market_type === "web_offers") {
    const firstOffer = d.offer_list[0];
    $("#widget-product").textContent = q.product;
    $("#widget-location").textContent =
      `Wilayah relevansi: ${q.city}, ${q.province}`;
    $("#widget-value").textContent = money(firstOffer.price);
    $("#widget-unit").textContent = firstOffer.unit;
    $("#widget-trend").hidden = true;
    $("#widget-low").textContent = "—";
    $("#widget-high").textContent = "—";
    $(".widget-head .demo-label").textContent =
      state.marketFreshness === "stale" ? "Data lama · pembaruan gagal" : ["cached", "server"].includes(state.marketFreshness) ? "Data tersimpan" : "Dari web";
    setWidgetPriceLabel("Salah satu penawaran / ");
    $(".widget-bottom").hidden = true;
    $(".widget-note").textContent =
      `${d.offer_list.length} penawaran dengan tautan sumber. Tanggal sumber ditampilkan jika tersedia.`;
    $("#week-strip").textContent =
      "Bandingkan harga dan satuan pada daftar penawaran.";
    chart.querySelector(".trend-area").setAttribute("d", "");
    chart.querySelector(".trend-line").setAttribute("d", "");
    chart.setAttribute("aria-label", "Tren harga tidak tersedia untuk penawaran web");
    return;
  }
  setWidgetPriceLabel("Harga rata-rata / ");
  $(".widget-bottom").hidden = false;
  $("#widget-trend").hidden = false;
  $("#widget-product").textContent = q.product;
  $("#widget-location").textContent = `${q.city}, ${q.province}`;
  $("#widget-value").textContent = money(d.harga_rata_rata);
  $("#widget-unit").textContent = d.satuan;
  $("#widget-low").textContent = money(d.harga_terendah);
  $("#widget-high").textContent = money(d.harga_tertinggi);
  $(".widget-head .demo-label").textContent =
    ["cached", "server"].includes(state.marketFreshness)
      ? "Data tersimpan"
      : state.marketFreshness === "stale"
        ? "Data mungkin sudah tidak terbaru"
        : "Data sumber";
  $(".widget-note").textContent = d.demo
    ? "Contoh tampilan, bukan harga pasar."
    : `${d.daftar_sumber[0].nama} · data ${observationDate(d.updated_at)}`;
  const t = trend(d);
  $("#widget-trend").hidden = series(d, 7).length < 2;
  $("#widget-trend").textContent =
    `${t.change > 0 ? "↗ Naik" : t.change < 0 ? "↘ Turun" : "Tetap"} ${number(Math.abs(t.percent))}%`;
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
    gain < 0 ? "↓ Rugi" : margin < 20 ? "Untung kotor" : "Untung kotor";
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
    after < 0 ? "↓ Rugi" : margin < 20 ? "! Waspada" : "Untung dalam skenario ini";
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
  const marketPrice = primaryMarketPrice(state.market);
  if (match) match.cost = marketPrice;
  else
    state.ingredients.push({
      name: state.query.product,
      cost: marketPrice,
    });
  renderIngredients();
  toast(
    `${state.marketFreshness === "stale" ? "Memakai harga lama. " : ""}Biaya ditambahkan untuk ${state.market.market_type === "web_offers" ? state.market.offer_list[0].unit : `1 ${state.market.satuan}`}. Sesuaikan dengan pemakaianmu.`,
  );
  go("untung");
}
function updateContext() {
  $("#advisor-context").textContent = state.query
    ? `${state.marketFreshness === "stale" ? "Data lama, pembaruan gagal. " : ""}Berdasarkan ${state.market.market_type === "web_offers" ? "penawaran web untuk pencarian wilayah" : "harga di"} ${state.query.city}: ${state.query.product.toLowerCase()} ${money(primaryMarketPrice(state.market))} / ${state.market.market_type === "web_offers" ? state.market.offer_list[0].unit : state.market.satuan}. ${state.market.market_type === "web_offers" ? `Diambil ${searchTime(state.market.searched_at || state.market.updated_at)}; tanggal harga mengikuti sumber.` : `Tanggal harga ${observationDate(state.market.updated_at, { dateStyle: "long" })}.`}`
    : "Belum ada pencarian harga. Kamu bisa bertanya secara umum atau cek harga dahulu untuk menambahkan konteks.";
}
async function ask(event) {
  event.preventDefault();
  const question = $("#question").value.trim();
  if (!question || $("#ask-button").disabled) return;
  const adviceController = new AbortController();
  state.adviceController = adviceController;
  $("#ask-button").disabled = true;
  $("#ask-button").textContent = "Menyusun saran…";
  $("#ask-button").setAttribute("aria-busy", "true");
  $("#cancel-advice").hidden = false;
  $("#advice-status").textContent = "Pertanyaan sedang dikirim. Kamu dapat membatalkan sambil menunggu.";
  $(".chat-empty")?.remove();
  const bubble = document.createElement("p");
  bubble.className = "chat-question";
  bubble.textContent = question;
  $("#conversation").append(bubble);
  const answer = document.createElement("div");
  answer.className = "chat-answer";
  answer.textContent = "Sedang menyusun saran…";
  $("#conversation").append(answer);
  answer.scrollIntoView({ block: "nearest" });
  try {
    const response = await PantauApi.request(
      "/api/advisor",
      {
        method: "POST",
        signal: adviceController.signal,
        body: JSON.stringify({
          pertanyaan: question,
          konteks: state.query,
          market: state.market,
          perhitungan: state.profit,
        }),
      },
    );
    const d = response.data;
    if (!d.ringkasan || !d.yang_perlu_dilakukan || !d.hati_hati)
      throw new Error("Jawaban layanan belum lengkap. Coba pertanyaan lain.");
    if ($("#question").value.trim() === question) $("#question").value = "";
    $("#advice-status").textContent = "Saran selesai. Periksa kesesuaiannya dengan kondisi usahamu.";
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
    answer.classList.add("answer-error");
    answer.textContent = error.code === "CANCELLED" ? "Permintaan dibatalkan. Pertanyaan tetap tersimpan di kolom." : "Saran belum berhasil dimuat. " + error.message;
    if (error.code !== "CANCELLED") {
      const retry = document.createElement("button"); retry.type = "button"; retry.className = "text-button"; retry.textContent = "Coba lagi";
      retry.onclick = () => { $("#question").value = question; $("#advisor-form").requestSubmit(); }; answer.append(retry);
    }
    $("#advice-status").textContent = "Pertanyaan tetap tersedia untuk diperbaiki atau dikirim ulang.";
  } finally {
    state.adviceController = null;
    $("#ask-button").disabled = false;
    $("#ask-button").textContent = "Kirim pertanyaan";
    $("#ask-button").removeAttribute("aria-busy");
    $("#cancel-advice").hidden = true;
    answer.scrollIntoView({ block: "nearest" });
  }
}
nav();
const region = read("pp_region", {});
if (typeof region.province === "string" && region.province.length <= 80) $("#province").value = region.province;
fillCities(typeof region.city === "string" && region.city.length <= 80 ? region.city : undefined);
loadRegions();
loadCapabilities();
history();
feature(0);
renderWidget();
renderIngredients();
updateContext();
route();
window.addEventListener("hashchange", route);
$("#province").addEventListener("change", () => { fillCities(); loadRegions($("#province").value.trim()); });
$("#city").addEventListener("change", () => fillCities($("#city").value));
$("#product").addEventListener("input", () => {
  syncCommoditySelection();
  closeProductSuggestions();
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
  $("#product").dispatchEvent(new Event("input", { bubbles: true }));
  clearTimeout(productSuggestionTimer);
  closeProductSuggestions();
  $("#product").focus();
});
$("#product-suggestions").addEventListener("pointerdown", (event) => {
  if (event.target.closest("[data-product-option]")) event.preventDefault();
});
$("#product-suggestions").addEventListener("focusin", (event) => {
  $$("[data-product-option]").forEach(option => {
    option.setAttribute("aria-selected", String(option === event.target));
  });
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
$("#market-form").addEventListener("input", () => {
  cancelSearch("Isian berubah. Tekan Cek harga untuk mencari ulang.");
  showSearchError("");
});
$("#cancel-search").onclick = () => cancelSearch();
$("#refresh-market").onclick = () => marketSearch(null, { force: true });
window.addEventListener("pantau-theme-change", drawChart);
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
  if (e.target.closest("[data-clear-history]")) {
    state.history = [];
    save("pp_history", state.history);
    history();
    toast("Riwayat pencarian lokal dihapus.");
    return;
  }
  const b = e.target.closest("[data-history]");
  if (!b) return;
  const q = state.history[b.dataset.history];
  fillCities(q.city, q.province);
  $("#product").value = q.search_text || q.product;
  syncCommoditySelection();
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
window.addEventListener("resize", () => {
  if (!$("#hasil").hidden) drawChart();
});

$("#export-prices").onclick = () => {
 if(!state.market)return;
 const cell=value=>'"'+String(value??"").replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 const rows=[["Tanggal","Produk","Provinsi","Kota","Harga IDR","Satuan","Sumber"],...series(state.market,state.days).map(item=>[item.tanggal.slice(0,10),state.market.produk,state.market.provinsi,state.market.kota,item.harga,state.market.satuan,state.market.daftar_sumber.map(s=>s.url).join(" | ")])];
 const url=URL.createObjectURL(new Blob(["\uFEFF"+rows.map(row=>row.map(cell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="pantaupasar-harga.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

$("#cancel-advice").onclick = () => state.adviceController?.abort();

$$("[data-commodity]").forEach(button => button.addEventListener("click", () => {
  $("#product").value = button.dataset.commodity;
  $("#product").dispatchEvent(new Event("input", { bubbles: true }));
  clearTimeout(productSuggestionTimer);
  closeProductSuggestions();
  formHint("");
  $("#product").focus({preventScroll:true});
}));
syncCommoditySelection();

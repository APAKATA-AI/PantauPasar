export const PIHPS_BASE_URL =
  "https://www.bi.go.id/hargapangan/WebSite/TabelHarga/";

export const PIHPS_COMMODITIES = Object.freeze([
  {
    marketLabel: "Cabai rawit merah",
    sourceName: "Cabai Rawit Merah",
    aliases: ["cabai rawit", "cabai"],
  },
  {
    marketLabel: "Beras medium",
    sourceName: "Beras Kualitas Medium I",
    aliases: ["beras", "beras kualitas medium", "beras medium i"],
  },
  {
    marketLabel: "Telur ayam ras",
    sourceName: "Telur Ayam Ras Segar",
    aliases: ["telur ayam", "telur"],
  },
  {
    marketLabel: "Bawang merah",
    sourceName: "Bawang Merah Ukuran Sedang",
    aliases: ["bawang"],
  },
  {
    marketLabel: "Minyak goreng curah",
    sourceName: "Minyak Goreng Curah",
    aliases: ["minyak goreng", "minyak curah", "minyak"],
  },
  {
    marketLabel: "Daging ayam ras",
    sourceName: "Daging Ayam Ras Segar",
    aliases: ["daging ayam", "ayam ras"],
  },
  {
    marketLabel: "Gula pasir",
    sourceName: "Gula Pasir Lokal",
    aliases: ["gula"],
  },
]);

export const PIHPS_REGIONS = Object.freeze([
  { province: "Jawa Timur", cities: ["Surabaya", "Malang", "Kediri"] },
  { province: "Jawa Barat", cities: ["Bandung", "Bekasi", "Bogor"] },
  { province: "DKI Jakarta", cities: ["Jakarta Pusat"] },
  { province: "Jawa Tengah", cities: ["Semarang", "Surakarta"] },
]);

const normalize = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const optionalWords = [
  "ada",
  "aja",
  "apa",
  "berapa",
  "beli",
  "cari",
  "di",
  "dong",
  "harga",
  "ingin",
  "mau",
  "pasar",
  "produk",
  "saja",
  "saya",
  "sih",
  "untuk",
  "yang",
  "doang",
];

function editDistanceAtMostOne(left, right) {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > 1) return 2;
  if (left.length === right.length) {
    const differences = [];
    for (let index = 0; index < left.length; index++) {
      if (left[index] !== right[index]) differences.push(index);
    }
    if (
      differences.length === 2 &&
      differences[1] === differences[0] + 1 &&
      left[differences[0]] === right[differences[1]] &&
      left[differences[1]] === right[differences[0]]
    )
      return 1;
  }
  let leftIndex = 0;
  let rightIndex = 0;
  let differences = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex++;
      rightIndex++;
      continue;
    }
    if (++differences > 1) return differences;
    if (left.length > right.length) leftIndex++;
    else if (right.length > left.length) rightIndex++;
    else {
      leftIndex++;
      rightIndex++;
    }
  }
  if (leftIndex < left.length || rightIndex < right.length) differences++;
  return differences;
}

function queryTokens(query) {
  return normalize(query)
    .split(" ")
    .filter(
      (token) =>
        token &&
        !optionalWords.some(
          (optional) =>
            token === optional ||
            (optional === "doang" &&
              token.length >= 4 &&
              editDistanceAtMostOne(token, optional) <= 1),
        ),
    );
}

function tokenMatches(queryToken, productToken) {
  return (
    productToken.startsWith(queryToken) ||
    (queryToken.length >= 4 &&
      editDistanceAtMostOne(queryToken, productToken) <= 1)
  );
}

function commodityScore(query, aliases) {
  const tokens = queryTokens(query);
  if (!tokens.length) return 0;
  let score = 0;
  for (const alias of aliases) {
    const aliasTokens = normalize(alias).split(" ");
    if (
      tokens.every((token) =>
        aliasTokens.some((part) => tokenMatches(token, part)),
      )
    ) {
      const exact = normalize(alias) === normalize(query);
      const candidateScore =
        (exact ? 100 : 0) +
        tokens.length * 10 +
        aliasTokens.filter((part) =>
          tokens.some((token) => tokenMatches(token, part)),
        ).length;
      score = Math.max(score, candidateScore);
    }
  }
  return score;
}

export function matchPihpsCommodities(query) {
  return PIHPS_COMMODITIES.map((item) => ({
    ...item,
    score: commodityScore(query, [
      item.marketLabel,
      item.sourceName,
      ...(item.aliases || []),
    ]),
  }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map(({ score, ...item }) => item);
}

export function searchPihpsCatalog(query, catalog, limit = 8) {
  return catalog
    .filter(
      (item) =>
        typeof item.id === "string" &&
        item.id.startsWith("com_") &&
        typeof item.name === "string" &&
        typeof item.denomination === "string" &&
        item.denomination.trim(),
    )
    .map((item) => ({
      ...item,
      score: commodityScore(query, [item.name]),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ score, ...item }) => item);
}

export function sourceCommodityForMarketLabel(label) {
  return matchPihpsCommodities(label)[0]?.sourceName || null;
}

export function marketLabelForSourceCommodity(sourceName) {
  return (
    PIHPS_COMMODITIES.find((item) => item.sourceName === sourceName)
      ?.marketLabel || sourceName
  );
}

/**
 * 驗證台鐵所有車站都能被搜尋找到。
 * 執行：node scripts/verify-station-search.js
 */
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "public", "data", "tra-stations.json");
const payload = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
const stations = payload.stations || payload;

const ALIASES = {
  北車: "臺北",
  台北: "臺北",
  台北車站: "臺北",
  台中: "臺中",
  台中車站: "臺中",
  台南: "臺南",
  台南車站: "臺南",
  高雄: "高雄",
  高雄車站: "高雄",
  花蓮站: "花蓮",
  板橋站: "板橋",
};

function normalize(s) {
  return (s || "").replace(/\s/g, "").replace(/台/g, "臺").toLowerCase();
}

function stripStationSuffix(text) {
  let s = normalize(text);
  s = s.replace(/火車站$/, "");
  s = s.replace(/車站$/, "");
  s = s.replace(/站$/, "");
  return s;
}

function queryVariants(query) {
  const base = normalize(query);
  const stripped = stripStationSuffix(query);
  const variants = new Set([base]);
  if (stripped) variants.add(stripped);
  if (/^\d{3,4}$/.test(stripped || base)) variants.add(stripped || base);
  return [...variants];
}

function scoreStation(station, query) {
  const names = [normalize(station.name), normalize(station.nameEn)].filter(Boolean);
  const id = String(station.stationId || "");
  let best = 0;
  for (const q of queryVariants(query)) {
    if (!q) continue;
    if (id && id === q) best = Math.max(best, 100);
    for (const name of names) {
      if (name === q) best = Math.max(best, 100);
      else if (name.startsWith(q)) best = Math.max(best, 90);
      else if (q.startsWith(name) && name.length >= 2) best = Math.max(best, 85);
      else if (name.includes(q)) best = Math.max(best, 70);
      else if (q.includes(name) && name.length >= 2) best = Math.max(best, 65);
    }
  }
  return best;
}

function filterStations(stations, query, limit = 30) {
  return stations
    .map((s) => ({ s, score: scoreStation(s, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}

function findStation(stations, text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  for (const q of queryVariants(trimmed)) {
    const exact = stations.find(
      (s) => normalize(s.name) === q || normalize(s.nameEn) === q || String(s.stationId) === q
    );
    if (exact) return exact;
  }
  const matches = filterStations(stations, trimmed, 8);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const t = scoreStation(matches[0], trimmed);
    const s = scoreStation(matches[1], trimmed);
    if (t >= 85 && t > s) return matches[0];
  }
  return null;
}

const failures = [];
for (const st of stations) {
  const queries = [st.name, `${st.name}車站`, `${st.name}站`, st.stationId, st.nameEn].filter(Boolean);
  for (const q of queries) {
    const found = findStation(stations, q);
    const inList = filterStations(stations, q, 30).some((x) => x.stationId === st.stationId);
    if (!found || found.stationId !== st.stationId || !inList) {
      failures.push({ stationId: st.stationId, name: st.name, query: q, found: found?.name || null });
    }
  }
}

if (failures.length) {
  console.error(`FAILED: ${failures.length} cases`);
  console.error(failures.slice(0, 20));
  process.exit(1);
}

console.log(`OK: all ${stations.length} TRA stations searchable by name / name+車站 / station ID / English name`);

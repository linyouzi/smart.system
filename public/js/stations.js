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

const COMMON_STATION_IDS = [
  "1000", "1010", "1020", "3300", "4220", "5020", "6020", "7000", "2170",
];

const SEARCH_LIMIT = 30;

function normalize(s) {
  return (s || "")
    .replace(/\s/g, "")
    .replace(/台/g, "臺")
    .toLowerCase();
}

/** 去掉使用者常多加的「車站／站」後綴，方便匹配 TDX 站名（如 通霄） */
function stripStationSuffix(text) {
  let s = normalize(text);
  s = s.replace(/火車站$/, "");
  s = s.replace(/車站$/, "");
  s = s.replace(/站$/, "");
  return s;
}

function addSearchTerm(set, value) {
  const n = normalize(value);
  if (n) set.add(n);
  const stripped = stripStationSuffix(value);
  if (stripped) set.add(stripped);
}

function buildSearchTerms(station) {
  const terms = new Set();
  addSearchTerm(terms, station.name);
  addSearchTerm(terms, station.nameEn);
  if (station.stationId) terms.add(String(station.stationId));
  return terms;
}

/** 建立搜尋索引，確保台鐵每一站都能被快速比對 */
export function prepareStations(stations) {
  return (stations || []).map((station) => ({
    ...station,
    stationId: String(station.stationId),
    searchTerms: buildSearchTerms(station),
  }));
}

function queryVariants(query) {
  const base = normalize(query);
  const stripped = stripStationSuffix(query);
  const variants = new Set([base]);
  if (stripped) variants.add(stripped);

  if (/^\d{3,4}$/.test(stripped || base)) {
    variants.add(stripped || base);
  }

  for (const [alias, target] of Object.entries(ALIASES)) {
    const a = normalize(alias);
    if (base.includes(a) || stripped.includes(a)) {
      variants.add(normalize(target));
    }
  }
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
      else if (nameEnStarts(name, q)) best = Math.max(best, 88);
      else if (name.includes(q)) best = Math.max(best, 70);
      else if (q.includes(name) && name.length >= 2) best = Math.max(best, 65);
    }

    if (station.searchTerms?.has(q)) best = Math.max(best, 95);

    for (const [alias, target] of Object.entries(ALIASES)) {
      if (q.includes(normalize(alias)) && names.some((n) => n.includes(normalize(target)))) {
        best = Math.max(best, 50);
      }
    }
  }
  return best;
}

function nameEnStarts(name, q) {
  if (!name || !q) return false;
  const parts = name.split(/[\s-]+/);
  return parts.some((p) => p.startsWith(q));
}

export function filterStations(stations, query, locale, limit = SEARCH_LIMIT) {
  const trimmed = (query || "").trim();
  if (!trimmed) return [];

  return stations
    .map((s) => ({ s, score: scoreStation(s, trimmed) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aExact = normalize(a.s.name) === stripStationSuffix(trimmed) ? 1 : 0;
      const bExact = normalize(b.s.name) === stripStationSuffix(trimmed) ? 1 : 0;
      if (bExact !== aExact) return bExact - aExact;
      return (a.s.name || "").localeCompare(b.s.name || "", "zh-Hant");
    })
    .slice(0, limit)
    .map((x) => x.s);
}

export function getBrowseStations(stations, { recents = [], favorites = [] } = {}) {
  const seen = new Set();
  const picks = [];

  function add(station) {
    if (!station || seen.has(station.stationId)) return;
    seen.add(station.stationId);
    picks.push(station);
  }

  favorites.forEach((id) => add(stations.find((s) => s.stationId === String(id))));
  recents.forEach((id) => add(stations.find((s) => s.stationId === String(id))));
  COMMON_STATION_IDS.forEach((id) => add(stations.find((s) => s.stationId === id)));

  const sorted = [...stations].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "zh-Hant")
  );
  sorted.forEach((s) => {
    if (picks.length >= SEARCH_LIMIT) return;
    add(s);
  });

  return picks.slice(0, SEARCH_LIMIT);
}

export function stationLabel(station, locale) {
  if (locale === "en" && station.nameEn) return station.nameEn;
  return station.name;
}

function findStationByInput(stations, text, locale) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;

  for (const q of queryVariants(trimmed)) {
    const exact = stations.find(
      (s) =>
        normalize(s.name) === q ||
        normalize(s.nameEn) === q ||
        String(s.stationId) === q
    );
    if (exact) return exact;
  }

  const matches = filterStations(stations, trimmed, locale, 8);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const topScore = scoreStation(matches[0], trimmed);
    const secondScore = scoreStation(matches[1], trimmed);
    if (topScore >= 85 && topScore > secondScore) return matches[0];
  }
  return null;
}

export function createCombobox({
  inputEl,
  listEl,
  hiddenEl,
  stations,
  localeGetter,
  onSelect,
  getBrowseContext,
}) {
  let activeIdx = -1;
  let visible = [];

  function resolveInput() {
    if (hiddenEl.value) {
      return stations.find((s) => s.stationId === hiddenEl.value) || null;
    }
    const station = findStationByInput(stations, inputEl.value, localeGetter());
    if (station) pick(station);
    return station;
  }

  function bindPick(li, station) {
    const handler = (e) => {
      e.preventDefault();
      pick(station);
    };
    li.addEventListener("mousedown", handler);
    li.addEventListener("touchstart", handler, { passive: false });
  }

  function renderList(items) {
    visible = items;
    activeIdx = -1;
    listEl.innerHTML = "";
    if (!items.length) {
      listEl.classList.add("hidden");
      return;
    }
    items.forEach((s, i) => {
      const li = document.createElement("li");
      li.textContent = stationLabel(s, localeGetter());
      li.dataset.idx = String(i);
      bindPick(li, s);
      listEl.appendChild(li);
    });
    listEl.classList.remove("hidden");
  }

  function pick(station) {
    hiddenEl.value = station.stationId;
    inputEl.value = stationLabel(station, localeGetter());
    listEl.classList.add("hidden");
    onSelect?.(station);
  }

  function updateSuggestions() {
    hiddenEl.value = "";
    const q = inputEl.value.trim();
    if (q) {
      renderList(filterStations(stations, q, localeGetter()));
    } else if (getBrowseContext) {
      renderList(getBrowseStations(stations, getBrowseContext()));
    } else {
      renderList([]);
    }
  }

  inputEl.addEventListener("input", updateSuggestions);
  inputEl.addEventListener("focus", updateSuggestions);

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && listEl.classList.contains("hidden")) {
      updateSuggestions();
    }
    if (listEl.classList.contains("hidden")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, visible.length - 1);
      highlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      highlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0) pick(visible[activeIdx]);
      else if (visible.length === 1) pick(visible[0]);
      else resolveInput();
    } else if (e.key === "Escape") {
      listEl.classList.add("hidden");
    }
  });

  inputEl.addEventListener("blur", () => {
    setTimeout(() => {
      listEl.classList.add("hidden");
      if (inputEl.value.trim() && !hiddenEl.value) resolveInput();
    }, 300);
  });

  function highlight() {
    listEl.querySelectorAll("li").forEach((li, i) => {
      li.classList.toggle("active", i === activeIdx);
    });
  }

  return {
    pickById(stationId) {
      const s = stations.find((x) => x.stationId === String(stationId));
      if (s) pick(s);
    },
    resolveInput,
    clear() {
      inputEl.value = "";
      hiddenEl.value = "";
    },
  };
}

export function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}

export function getRecents() {
  try {
    return JSON.parse(localStorage.getItem("recents") || "[]");
  } catch {
    return [];
  }
}

export function addRecent(stationId) {
  const recents = getRecents().filter((x) => x !== stationId);
  recents.unshift(stationId);
  localStorage.setItem("recents", JSON.stringify(recents.slice(0, 5)));
}

export function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem("favorites") || "[]");
  } catch {
    return [];
  }
}

export function toggleFavorite(stationId) {
  const favs = getFavorites();
  const idx = favs.indexOf(stationId);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.unshift(stationId);
  localStorage.setItem("favorites", JSON.stringify(favs.slice(0, 8)));
  return favs;
}

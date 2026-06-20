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
  return (s || "")
    .replace(/\s/g, "")
    .replace(/台/g, "臺")
    .toLowerCase();
}

function scoreStation(station, query, locale) {
  const q = normalize(query);
  if (!q) return 0;

  const name = normalize(station.name);
  const nameEn = normalize(station.nameEn);

  if (name === q || nameEn === q) return 100;
  if (name.startsWith(q) || nameEn.startsWith(q)) return 80;
  if (name.includes(q) || nameEn.includes(q)) return 60;

  for (const [alias, target] of Object.entries(ALIASES)) {
    if (q.includes(normalize(alias)) && name.includes(normalize(target))) {
      return 50;
    }
  }
  return 0;
}

export function filterStations(stations, query, locale, limit = 8) {
  if (!query.trim()) return [];
  return stations
    .map((s) => ({ s, score: scoreStation(s, query, locale) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}

export function stationLabel(station, locale) {
  if (locale === "en" && station.nameEn) return station.nameEn;
  return station.name;
}

function findStationByInput(stations, text, locale) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;

  const q = normalize(trimmed);
  const exact = stations.find(
    (s) => normalize(s.name) === q || normalize(s.nameEn) === q
  );
  if (exact) return exact;

  const matches = filterStations(stations, trimmed, locale, 5);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const topScore = scoreStation(matches[0], trimmed, locale);
    const secondScore = scoreStation(matches[1], trimmed, locale);
    if (topScore >= 80 && topScore > secondScore) return matches[0];
  }
  return null;
}

export function createCombobox({ inputEl, listEl, hiddenEl, stations, localeGetter, onSelect }) {
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
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(s);
      });
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

  inputEl.addEventListener("input", () => {
    hiddenEl.value = "";
    renderList(filterStations(stations, inputEl.value, localeGetter()));
  });

  inputEl.addEventListener("keydown", (e) => {
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
    }, 150);
  });

  function highlight() {
    listEl.querySelectorAll("li").forEach((li, i) => {
      li.classList.toggle("active", i === activeIdx);
    });
  }

  return {
    pickById(stationId) {
      const s = stations.find((x) => x.stationId === stationId);
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

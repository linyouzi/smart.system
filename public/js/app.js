import { loadLocale, t, locale, apiLang } from "./i18n.js";
import { apiFetch, isNativeApp, loadAppConfig } from "./api.js";
import {
  createCombobox,
  stationLabel,
  addRecent,
  getRecents,
  getFavorites,
  toggleFavorite,
  prepareStations,
} from "./stations.js";
import {
  isTtsEnabled,
  setTtsEnabled,
  syncTtsWithLargeMode,
  updateTtsButton,
} from "./tts.js";
import { ensureNotificationPermission } from "./notify.js";
import {
  fetchLiveData,
  handleSearchResult,
  resetSearchState,
  startPolling,
  setQueryLabels,
  formatRouteTitle,
  beginSearchSession,
  isActiveSearch,
  applyPollUpdate,
} from "./liveboard.js";
import { startQrScan, stopQrScan, showLocationBadge } from "./qr.js";

const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const resultTitleEl = document.getElementById("resultTitle");
const searchBtn = document.getElementById("searchBtn");
const modeNormal = document.getElementById("modeNormal");
const modeLarge = document.getElementById("modeLarge");
const modeTts = document.getElementById("modeTts");
const scanBtn = document.getElementById("scanBtn");
const qrContainer = document.getElementById("qrContainer");
const wheelchairCheck = document.getElementById("wheelchairCheck");
const wheelchairHint = document.getElementById("wheelchairHint");
const favBtn = document.getElementById("favBtn");
const quickLinksEl = document.getElementById("quickLinks");
const langZh = document.getElementById("langZh");
const langEn = document.getElementById("langEn");
const langTh = document.getElementById("langTh");
const langVi = document.getElementById("langVi");
const dirAll = document.getElementById("dirAll");
const dirNorth = document.getElementById("dirNorth");
const dirSouth = document.getElementById("dirSouth");
const installBtn = document.getElementById("installBtn");

let stations = [];
let largeMode = false;
let travelDirection = "all";
let originCombo;
let destCombo;
let scanning = false;
let deferredInstallPrompt = null;
let lastSearchKey = "";

function setStatus(key, vars = {}, isError = false) {
  statusEl.textContent = t(key, vars);
  statusEl.classList.toggle("error", isError);
}

function setMode(isLarge) {
  largeMode = isLarge;
  document.body.dataset.large = isLarge ? "1" : "0";
  modeNormal.classList.toggle("active", !isLarge);
  modeLarge.classList.toggle("active", isLarge);
  document.body.style.fontSize = isLarge ? "20px" : "14px";
  syncTtsWithLargeMode(isLarge);
  updateTtsButton(modeTts);
}

function setDirection(dir) {
  travelDirection = dir;
  dirAll.classList.toggle("active", dir === "all");
  dirNorth.classList.toggle("active", dir === "north");
  dirSouth.classList.toggle("active", dir === "south");
  if (lastSearchKey) doSearch();
}

function updateResultTitle(originName, destName) {
  if (originName && destName) {
    resultTitleEl.textContent = formatRouteTitle(originName, destName);
  } else {
    resultTitleEl.textContent = t("routeTitle");
  }
}

function renderQuickLinks() {
  const recents = getRecents();
  const favs = getFavorites();
  const ids = [...new Set([...favs, ...recents])].slice(0, 6);
  quickLinksEl.innerHTML = "";
  if (!ids.length) return;

  const label = document.createElement("span");
  label.className = "quick-label";
  label.textContent = `${t("favorites")} / ${t("recents")}：`;
  quickLinksEl.appendChild(label);

  ids.forEach((id) => {
    const s = stations.find((x) => x.stationId === id);
    if (!s) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quick-chip";
    btn.textContent = stationLabel(s, locale);
    btn.addEventListener("click", () => {
      originCombo.pickById(id);
      doSearch();
    });
    quickLinksEl.appendChild(btn);
  });
}

async function resolveStationViaServer(combo, inputEl, hiddenEl) {
  combo?.resolveInput();
  if (hiddenEl.value) return hiddenEl.value;

  const text = inputEl.value.trim();
  if (!text) return "";

  try {
    const res = await apiFetch(`/api/stations/match?q=${encodeURIComponent(text)}`);
    const data = await res.json();
    if (data.match?.stationId) {
      if (combo?.pickById) combo.pickById(data.match.stationId);
      else {
        hiddenEl.value = data.match.stationId;
        inputEl.value = data.match.name || text;
      }
      return String(data.match.stationId);
    }
  } catch (err) {
    console.error("station match failed", err);
  }
  return "";
}

async function doSearch() {
  const originInput = document.getElementById("originInput");
  const originHidden = document.getElementById("originId");
  const destInput = document.getElementById("destInput");
  const destHidden = document.getElementById("destId");
  const trainNoInput = document.getElementById("trainNoInput");

  if (!stations.length) {
    setStatus("statusLoadingStations");
  }

  const originId = await resolveStationViaServer(originCombo, originInput, originHidden);
  const originText = originInput.value.trim();

  if (!originId) {
    if (originText) {
      setStatus("statusStationNotFound", { name: originText }, true);
    } else {
      setStatus("statusSelectOrigin", {}, true);
    }
    lastSearchKey = "";
    return;
  }

  const destId = await resolveStationViaServer(destCombo, destInput, destHidden);
  const destText = destInput.value.trim();
  if (!destId) {
    if (destText) {
      setStatus("statusStationNotFound", { name: destText }, true);
    } else {
      setStatus("statusSelectDestination", {}, true);
    }
    lastSearchKey = "";
    return;
  }

  if (originId === destId) {
    setStatus("statusSameStation", {}, true);
    lastSearchKey = "";
    return;
  }

  lastSearchKey = `${originId}|${destId}|${travelDirection}`;
  const searchId = beginSearchSession();

  const originStation = stations.find((s) => s.stationId === originId);
  const destStation = stations.find((s) => s.stationId === destId);
  const originLabel = originStation ? stationLabel(originStation, locale) : originText;
  const destLabel = destStation ? stationLabel(destStation, locale) : destText;
  setQueryLabels({ originName: originLabel, destName: destLabel });

  const trainNoFilter = trainNoInput?.value.trim() || "";

  resetSearchState();
  setStatus("statusSearching");
  resultsEl.innerHTML = `<div class="empty-state">${t("loading")}</div>`;

  try {
    const data = await fetchLiveData(originId, destId, apiLang(), travelDirection);
    if (!isActiveSearch(searchId)) return;

    updateResultTitle(originLabel, destLabel);
    handleSearchResult(data, {
      resultsEl,
      statusEl,
      destName: destLabel,
      trainNoFilter,
    });

    addRecent(originId);
    renderQuickLinks();

    wheelchairHint.classList.toggle("hidden", !wheelchairCheck.checked);

    startPolling(
      searchId,
      () => fetchLiveData(originId, destId, apiLang(), travelDirection),
      (pollData) => {
        if (!isActiveSearch(searchId)) return;
        applyPollUpdate(pollData, {
          resultsEl,
          statusEl,
          resultTitleEl,
          trainNoFilter,
          destName: destLabel,
        });
      }
    );

    await ensureNotificationPermission();
  } catch (err) {
    if (!isActiveSearch(searchId)) return;
    console.error(err);
    setStatus("statusSearchFail", { msg: err.message }, true);
    resultsEl.innerHTML = `<div class="empty-state">${t("statusSearchFail", { msg: err.message })}</div>`;
  }
}

async function init() {
  await loadAppConfig();
  await loadLocale(locale);

  if (isNativeApp()) {
    document.body.classList.add("native-app");
  }

  langZh.addEventListener("click", async () => {
    await loadLocale("zh-TW");
    renderQuickLinks();
  });
  langEn.addEventListener("click", async () => {
    await loadLocale("en");
    renderQuickLinks();
  });
  langTh.addEventListener("click", async () => {
    await loadLocale("th");
    renderQuickLinks();
  });
  langVi.addEventListener("click", async () => {
    await loadLocale("vi");
    renderQuickLinks();
  });

  dirAll.addEventListener("click", () => setDirection("all"));
  dirNorth.addEventListener("click", () => setDirection("north"));
  dirSouth.addEventListener("click", () => setDirection("south"));

  if (searchBtn) searchBtn.disabled = true;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installBtn) installBtn.classList.remove("hidden");
  });

  installBtn?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.classList.add("hidden");
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").then((reg) => reg.update()).catch(() => {});
  }

  modeNormal.addEventListener("click", () => setMode(false));
  modeLarge.addEventListener("click", () => setMode(true));
  modeTts.addEventListener("click", () => {
    setTtsEnabled(!isTtsEnabled(), true);
    updateTtsButton(modeTts);
  });

  wheelchairCheck.addEventListener("change", () => {
    wheelchairHint.classList.toggle("hidden", !wheelchairCheck.checked);
  });

  favBtn.addEventListener("click", () => {
    originCombo?.resolveInput();
    const originId = document.getElementById("originId").value;
    if (!originId) {
      setStatus("statusSelectStation", {}, true);
      return;
    }
    toggleFavorite(originId);
    renderQuickLinks();
  });

  searchBtn.addEventListener("click", doSearch);

  scanBtn.addEventListener("click", async () => {
    if (scanning) {
      scanning = false;
      await stopQrScan(qrContainer);
      scanBtn.textContent = t("scanQr");
      return;
    }
    scanning = true;
    scanBtn.textContent = t("stopScan");
    await startQrScan(
      qrContainer,
      (parsed) => {
        scanning = false;
        scanBtn.textContent = t("scanQr");
        originCombo.pickById(parsed.stationId);
        showLocationBadge(parsed.zone);
        doSearch();
      },
      () => setStatus("qrFail", {}, true)
    );
  });

  try {
    const health = await apiFetch("/api/health").then((r) => r.json());
    if (!health.tdxConfigured) {
      if (health.issues?.includes("missing_secret")) {
        setStatus("statusSecretMissing", {}, true);
      } else {
        setStatus("statusTdxMissing", {}, true);
      }
      return;
    }

    setStatus("statusLoadingStations");
    let stationData = await apiFetch("/api/stations").then((r) => r.json());
    if (!Array.isArray(stationData) || stationData.length === 0) {
      stationData = await fetch("/data/tra-stations.json").then((r) => r.json());
      stationData = Array.isArray(stationData) ? stationData : stationData.stations || [];
    }
    stations = prepareStations(stationData);

    const commonIds = ["1000", "1010", "1020", "3300", "4220", "5020", "6020", "7000"];
    stations.sort((a, b) => {
      const ai = commonIds.indexOf(a.stationId);
      const bi = commonIds.indexOf(b.stationId);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return (a.name || "").localeCompare(b.name || "", "zh-Hant");
    });

    const browseContext = () => ({
      recents: getRecents(),
      favorites: getFavorites(),
    });

    originCombo = createCombobox({
      inputEl: document.getElementById("originInput"),
      listEl: document.getElementById("originSuggestions"),
      hiddenEl: document.getElementById("originId"),
      stations,
      localeGetter: () => locale,
      getBrowseContext: browseContext,
    });

    destCombo = createCombobox({
      inputEl: document.getElementById("destInput"),
      listEl: document.getElementById("destSuggestions"),
      hiddenEl: document.getElementById("destId"),
      stations,
      localeGetter: () => locale,
      getBrowseContext: browseContext,
    });

    setStatus("statusStationsLoaded", { n: stations.length });
    renderQuickLinks();
    if (searchBtn) searchBtn.disabled = false;

    const params = new URLSearchParams(location.search);
    const stationParam = params.get("station");
    const destParam = params.get("dest");
    const zoneParam = params.get("zone");
    if (stationParam && destParam) {
      originCombo.pickById(stationParam);
      destCombo.pickById(destParam);
      if (zoneParam) showLocationBadge(zoneParam.toUpperCase());
      doSearch();
    } else if (stationParam) {
      originCombo.pickById(stationParam);
      if (zoneParam) showLocationBadge(zoneParam.toUpperCase());
      setStatus("statusSelectDestination", {}, true);
    }
  } catch (err) {
    console.error(err);
    setStatus("statusConnFail", {}, true);
  }
}

init();

import { t } from "./i18n.js";
import { apiFetch } from "./api.js";
import { showChangeAlert } from "./notify.js";
import { speakTrains, speakChange } from "./tts.js";

let pollTimer = null;
let lastSnapshot = new Map();
let currentOriginId = null;
let currentDestId = null;
let isFirstLoad = true;

function trainKey(t) {
  return String(t.trainNo);
}

function rebuildSnapshot(trains) {
  lastSnapshot = new Map(trains.map((t) => [trainKey(t), { ...t }]));
}

function diffLiveboard(trains) {
  const changes = [];
  for (const t of trains) {
    const old = lastSnapshot.get(trainKey(t));
    if (!old) continue;
    if (old.platform !== t.platform || old.delayMin !== t.delayMin) {
      changes.push({ before: old, after: t });
    }
  }
  return changes;
}

export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function startPolling(fetchFn, onUpdate) {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const data = await fetchFn();
      const changes = isFirstLoad ? [] : diffLiveboard(data.trains);
      rebuildSnapshot(data.trains);
      onUpdate(data, changes);
      for (const ch of changes) {
        showChangeAlert(ch);
        speakChange(ch);
      }
    } catch (err) {
      console.error("poll error", err);
    }
  }, 30_000);
}

export function renderCarLayout(trainNo) {
  const carCount = 8 + (parseInt(trainNo, 10) % 4);
  const highlightIdx = parseInt(trainNo, 10) % carCount;
  let html = '<div class="cars">';
  for (let i = 0; i < carCount; i++) {
    const isHighlight = i === highlightIdx;
    html += `<div class="car ${isHighlight ? "highlight" : ""}">${i + 1}${
      isHighlight ? '<div class="door"></div>' : ""
    }</div>`;
  }
  html += "</div>";
  return html;
}

export function renderResults(trains, resultsEl, { routeMode = false } = {}) {
  if (!trains.length) {
    resultsEl.innerHTML = `<div class="empty-state">${
      routeMode ? t("emptyRoute") : t("emptyLive")
    }</div>`;
    return;
  }

  resultsEl.innerHTML = "";
  trains.slice(0, 12).forEach((train, idx) => {
    const card = document.createElement("div");
    card.className = "train-card";

    const delayClass = train.delayMin > 0 ? "late" : "ontime";
    const delayText =
      train.delayMin > 0 ? t("delayMin", { n: train.delayMin }) : t("onTime");
    const dirBadge =
      train.directionLabel
        ? `<span class="dir-badge dir-${train.directionType}">${train.directionLabel}</span>`
        : "";

    card.innerHTML = `
      <div class="left">
        <div class="time">
          ${train.scheduledTime || "--:--"}
          ${dirBadge}
          <span class="delay ${delayClass}">${delayText}</span>
        </div>
        <div class="meta">
          ${t("trainMeta", {
            no: train.trainNo,
            type: train.trainTypeName || "",
            dest: train.endingStation || "",
          })}
        </div>
      </div>
      <div class="platform-badge">
        <div class="num">${train.platform ?? "—"}</div>
        <div class="label">${t("platform")}</div>
      </div>
      <div class="guide-btn" data-idx="${idx}">${t("guideBtn")}</div>
      <div class="car-layout" id="layout-${idx}">
        <div class="note">${t("carNote")}</div>
        ${renderCarLayout(train.trainNo)}
      </div>
    `;
    resultsEl.appendChild(card);
  });

  resultsEl.querySelectorAll(".guide-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = btn.dataset.idx;
      document.getElementById(`layout-${idx}`).classList.toggle("show");
    });
  });
}

export async function fetchLiveData(originId, destId, apiLang, direction = "all") {
  currentOriginId = originId;
  currentDestId = destId || null;

  const params = new URLSearchParams({ lang: apiLang, direction });
  if (destId) params.set("destId", destId);

  const res = await apiFetch(`/api/search/${originId}?${params.toString()}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  return {
    trains: data.trains,
    routeMode: Boolean(data.routeMode),
    meta: data,
  };
}

export function handleSearchResult(data, { resultsEl, statusEl, destName, onFirstSpeak }) {
  const { trains, routeMode, meta } = data;
  renderResults(trains, resultsEl, { routeMode });

  if (routeMode) {
    statusEl.textContent = `${t("statusRouteUpdated", {
      n: meta.matched,
      dest: destName || meta.destName || "",
    })} · ${t("statusPoll")}`;
  } else {
    const dirNote =
      meta.direction && meta.direction !== "all"
        ? ` · ${meta.direction === "north" ? t("dirNorth") : t("dirSouth")}`
        : "";
    statusEl.textContent = `${t("statusUpdated", { n: trains.length })}${dirNote} · ${t("statusPoll")}`;
  }
  statusEl.classList.remove("error");

  if (isFirstLoad) {
    speakTrains(trains);
    onFirstSpeak?.();
    isFirstLoad = false;
  }

  rebuildSnapshot(trains);
}

export function resetSearchState() {
  isFirstLoad = true;
  lastSnapshot = new Map();
}

export function getCurrentQuery() {
  return { originId: currentOriginId, destId: currentDestId };
}

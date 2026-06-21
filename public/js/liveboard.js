import { t } from "./i18n.js";
import { apiFetch } from "./api.js";
import { showChangeAlert } from "./notify.js";
import { speakTrains, speakChange } from "./tts.js";
import {
  getDelaySeverity,
  addMinutesToTime,
  compareTrainsByEstimatedDeparture,
  reassuranceMessage,
  platformLabel,
  statusIcon,
} from "./delay-ui.js";
import { renderAltTransportBlock } from "./alt-transport.js";
import { renderCarLayout } from "./car-layout.js";

let pollTimer = null;
let lastSnapshot = new Map();
let currentOriginId = null;
let currentDestId = null;
let currentOriginName = "";
let currentDestName = "";
let isFirstLoad = true;
let activeSearchId = 0;

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

export function beginSearchSession() {
  activeSearchId += 1;
  stopPolling();
  return activeSearchId;
}

export function isActiveSearch(searchId) {
  return searchId === activeSearchId;
}

export function startPolling(searchId, fetchFn, onUpdate) {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (searchId !== activeSearchId) return;
    try {
      const data = await fetchFn();
      if (searchId !== activeSearchId) return;
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

function renderDelayBadge(train) {
  const severity = getDelaySeverity(train.delayMin, { liveStatus: train.liveStatus });

  if (train.liveStatus === "timetable") {
    return `
      <div class="delay-badge severity-ok">
        <span class="delay-badge-ontime">${t("delayPending")}</span>
      </div>
    `;
  }

  if (train.delayMin > 0) {
    return `
      <div class="delay-badge severity-${severity}">
        <span class="delay-badge-num">${train.delayMin}</span>
        <span class="delay-badge-unit">${t("delayBadgeMin")}</span>
        <span class="delay-badge-late">${t("delayBadgeLate")}</span>
      </div>
    `;
  }

  return `
    <div class="delay-badge severity-${severity}">
      <span class="delay-badge-ontime">${t("onTimeBadge")}</span>
    </div>
  `;
}

function renderStatusBar(train) {
  const severity = getDelaySeverity(train.delayMin, { liveStatus: train.liveStatus });
  return `
    <div class="status-bar severity-${severity}">
      <span class="status-icon" aria-hidden="true">${statusIcon(severity)}</span>
      <span class="status-text">${reassuranceMessage(train)}</span>
    </div>
  `;
}

function renderAltSuggest(train, context) {
  if (getDelaySeverity(train.delayMin, { liveStatus: train.liveStatus }) !== "severe") return "";
  return renderAltTransportBlock(context);
}

function renderTrainCard(train, idx, { highlighted = false, context = {} } = {}) {
  const severity = getDelaySeverity(train.delayMin, { liveStatus: train.liveStatus });
  const estimated = addMinutesToTime(train.scheduledTime, train.delayMin) || train.scheduledTime;
  const platform = platformLabel(train.platform);
  const cardClasses = ["train-card", `card-${severity}`];
  if (highlighted) cardClasses.push("highlighted");
  if (train.liveStatus === "timetable") cardClasses.push("timetable-only");

  const liveTag =
    train.liveStatus === "live"
      ? `<span class="live-tag live">${t("liveTag")}</span>`
      : `<span class="live-tag schedule">${t("scheduleTag")}</span>`;

  return `
    <div class="${cardClasses.join(" ")}" data-train-no="${train.trainNo}">
      <div class="card-main">
        ${renderDelayBadge(train)}
        <div class="card-content">
          <div class="route-line">${t("routeLine", {
            origin: context.originName || "—",
            dest: context.destName || train.endingStation || "—",
          })} ${liveTag}</div>
          <div class="train-platform">${t("trainPlatformLine", {
            no: train.trainNo,
            platform,
          })}</div>
          <div class="time-line">
            <span class="est-time">${t("estimatedAt", { time: estimated || "--:--" })}</span>
            ${
              train.liveStatus === "live" && train.scheduledTime && train.delayMin > 0
                ? `<span class="sched-time">${train.scheduledTime}</span>`
                : ""
            }
          </div>
        </div>
      </div>
      ${renderStatusBar(train)}
      ${renderAltSuggest(train, context)}
      <button type="button" class="guide-btn" data-idx="${idx}">${t("guideBtn")}</button>
      <div class="car-layout" id="layout-${idx}">
        <div class="note">${t("carNote")}</div>
        ${renderCarLayout(train.trainNo)}
      </div>
    </div>
  `;
}

function sortTrainsForDisplay(trains, { trainNoFilter = "" } = {}) {
  const list = [...trains];
  const needle = String(trainNoFilter || "").trim();
  list.sort((a, b) => {
    if (needle) {
      const aMatch = String(a.trainNo) === needle ? 0 : 1;
      const bMatch = String(b.trainNo) === needle ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }
    return compareTrainsByEstimatedDeparture(a, b);
  });
  return list;
}

function emptyRouteMessage(meta = {}) {
  if (!meta.routeMode) {
    return t("emptyLive");
  }
  if (meta.odCount === 0 && meta.odOk === false) {
    return t("emptyOdFail");
  }
  if (meta.totalLive > 0 && meta.matched === 0) {
    return t("emptyRouteFiltered");
  }
  return t("emptyRoute");
}

export function renderResults(
  trains,
  resultsEl,
  { trainNoFilter = "", originName = "", destName = "", originId = "", meta = {} } = {}
) {
  if (!trains.length) {
    resultsEl.innerHTML = `<div class="empty-state">${emptyRouteMessage(meta)}</div>`;
    return;
  }

  const context = { originName, destName, originId };
  const sorted = sortTrainsForDisplay(trains, { trainNoFilter });
  const needle = String(trainNoFilter || "").trim();

  resultsEl.innerHTML = sorted
    .slice(0, 20)
    .map((train, idx) =>
      renderTrainCard(train, idx, {
        highlighted: needle && String(train.trainNo) === needle,
        context,
      })
    )
    .join("");

  resultsEl.querySelectorAll(".guide-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(`layout-${btn.dataset.idx}`)?.classList.toggle("show");
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

export function setQueryLabels({ originName = "", destName = "" } = {}) {
  currentOriginName = originName;
  currentDestName = destName;
}

function updateStatusMessage(statusEl, meta, trainCount) {
  const dest = meta.destName || currentDestName;
  const odNote = meta.odCount ? ` · ${t("statusOdTrains", { n: meta.odCount })}` : "";
  statusEl.textContent = meta.routeMode && dest
    ? `${t("statusRouteUpdated", { n: meta.matched ?? trainCount, dest })}${odNote} · ${t("statusPoll")}`
    : `${t("statusUpdated", { n: meta.matched ?? trainCount })} · ${t("statusPoll")}`;
  statusEl.classList.remove("error");
}

export function applyPollUpdate(
  pollData,
  { resultsEl, statusEl, resultTitleEl, trainNoFilter = "", destName = "" }
) {
  const { trains, meta } = pollData;
  const originName = meta.originName || currentOriginName;
  const dest = meta.destName || destName || currentDestName;

  if (resultTitleEl) {
    resultTitleEl.textContent =
      meta.routeMode && originName && dest
        ? formatRouteTitle(originName, dest)
        : t("liveboardTitle");
  }

  renderResults(trains, resultsEl, {
    trainNoFilter,
    originName,
    destName: dest,
    originId: meta.originId || currentOriginId,
    meta,
  });

  updateStatusMessage(statusEl, meta, trains.length);
}

export function formatRouteTitle(originName, destName) {
  return t("routeLine", { origin: originName, dest: destName });
}

export function handleSearchResult(data, { resultsEl, statusEl, destName, trainNoFilter = "", onFirstSpeak }) {
  const { trains, meta } = data;
  const dest = meta.destName || destName || currentDestName;
  const originName = meta.originName || currentOriginName;

  currentOriginName = originName;
  currentDestName = dest;

  renderResults(trains, resultsEl, {
    trainNoFilter,
    originName: meta.originName || currentOriginName,
    destName: dest,
    originId: meta.originId || currentOriginId,
    meta,
  });

  updateStatusMessage(statusEl, meta, trains.length);

  if (isFirstLoad) {
    speakTrains(trains.filter((tr) => tr.liveStatus === "live"));
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

import { t } from "./i18n.js";
import { apiFetch } from "./api.js";
import { showChangeAlert } from "./notify.js";
import { speakTrains, speakChange } from "./tts.js";
import {
  getDelaySeverity,
  addMinutesToTime,
  reassuranceMessage,
  buildAltTransportLinks,
  platformLabel,
  statusIcon,
  primaryAltLink,
} from "./delay-ui.js";
import { renderCarLayout } from "./car-layout.js";

let pollTimer = null;
let lastSnapshot = new Map();
let currentOriginId = null;
let currentDestId = null;
let currentOriginName = "";
let currentDestName = "";
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

function renderDelayBadge(train) {
  const severity = getDelaySeverity(train.delayMin);
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
  const severity = getDelaySeverity(train.delayMin);
  return `
    <div class="status-bar severity-${severity}">
      <span class="status-icon" aria-hidden="true">${statusIcon(severity)}</span>
      <span class="status-text">${reassuranceMessage(train)}</span>
    </div>
  `;
}

function renderAltSuggest(train, context) {
  if (getDelaySeverity(train.delayMin) !== "severe") return "";
  const alt = primaryAltLink(context);
  const links = buildAltTransportLinks(context);
  const chips = links
    .map(
      (l) =>
        `<a class="alt-chip" href="${l.href}" target="_blank" rel="noopener noreferrer">${t(l.key)}</a>`
    )
    .join("");

  return `
    <a class="alt-suggest" href="${alt.href}" target="_blank" rel="noopener noreferrer">
      <span class="alt-suggest-icon" aria-hidden="true">🚌</span>
      <span class="alt-suggest-text">${t("altSuggestion", { origin: context.originName, dest: context.destName })}</span>
      <span class="alt-chevron" aria-hidden="true">›</span>
    </a>
    <div class="alt-chips">${chips}</div>
  `;
}

function renderTrainCard(train, idx, { highlighted = false, context = {} } = {}) {
  const severity = getDelaySeverity(train.delayMin);
  const estimated = addMinutesToTime(train.scheduledTime, train.delayMin) || train.scheduledTime;
  const platform = platformLabel(train.platform);
  const cardClasses = ["train-card", `card-${severity}`];
  if (highlighted) cardClasses.push("highlighted");

  return `
    <div class="${cardClasses.join(" ")}" data-train-no="${train.trainNo}">
      <div class="card-main">
        ${renderDelayBadge(train)}
        <div class="card-content">
          <div class="route-line">${t("routeLine", {
            origin: context.originName || "—",
            dest: context.destName || train.endingStation || "—",
          })}</div>
          <div class="train-platform">${t("trainPlatformLine", {
            no: train.trainNo,
            platform,
          })}</div>
          <div class="time-line">
            <span class="est-time">${t("estimatedAt", { time: estimated || "--:--" })}</span>
            ${
              train.scheduledTime && train.delayMin > 0
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
  if (trainNoFilter) {
    const needle = String(trainNoFilter).trim();
    list.sort((a, b) => {
      const aMatch = String(a.trainNo) === needle ? 0 : 1;
      const bMatch = String(b.trainNo) === needle ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return (a.scheduledTime || "").localeCompare(b.scheduledTime || "");
    });
  }
  return list;
}

export function renderResults(
  trains,
  resultsEl,
  { trainNoFilter = "", originName = "", destName = "" } = {}
) {
  if (!trains.length) {
    resultsEl.innerHTML = `<div class="empty-state">${t("emptyRoute")}</div>`;
    return;
  }

  const context = { originName, destName };
  const sorted = sortTrainsForDisplay(trains, { trainNoFilter });
  const needle = String(trainNoFilter || "").trim();

  resultsEl.innerHTML = sorted
    .slice(0, 12)
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
  currentDestId = destId;

  const params = new URLSearchParams({ lang: apiLang, direction, destId });

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

export function formatRouteTitle(originName, destName) {
  return t("routeLine", { origin: originName, dest: destName });
}

export function handleSearchResult(data, { resultsEl, statusEl, destName, trainNoFilter = "", onFirstSpeak }) {
  const { trains, meta } = data;
  const dest = destName || meta.destName || currentDestName;

  renderResults(trains, resultsEl, {
    trainNoFilter,
    originName: currentOriginName,
    destName: dest,
  });

  statusEl.textContent = `${t("statusRouteUpdated", {
    n: meta.matched ?? trains.length,
    dest,
  })} · ${t("statusPoll")}`;
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

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

function renderDelayBlock(train) {
  const severity = getDelaySeverity(train.delayMin);
  const estimated = addMinutesToTime(train.scheduledTime, train.delayMin) || train.scheduledTime;
  const delayDisplay =
    train.delayMin > 0 ? t("delayPlus", { n: train.delayMin }) : t("onTime");

  return `
    <div class="delay-hero severity-${severity}">
      <div class="estimated-label">${t("estimatedDepart")}</div>
      <div class="estimated-time">${estimated || "--:--"}</div>
      <div class="delay-big">${delayDisplay}</div>
      ${
        train.scheduledTime && train.delayMin > 0
          ? `<div class="scheduled-was">${t("scheduledWas", { time: train.scheduledTime })}</div>`
          : ""
      }
    </div>
  `;
}

function renderReassurance(train) {
  const severity = getDelaySeverity(train.delayMin);
  return `<div class="reassurance severity-${severity}">${reassuranceMessage(train)}</div>`;
}

function renderAltTransport(train, context) {
  if (getDelaySeverity(train.delayMin) !== "severe") return "";
  const links = buildAltTransportLinks({
    originName: context.originName,
    destName: context.destName,
  });
  const items = links
    .map(
      (l) =>
        `<a class="alt-link" href="${l.href}" target="_blank" rel="noopener noreferrer">${t(l.key)}</a>`
    )
    .join("");
  return `
    <div class="alt-transport">
      <div class="alt-title">${t("altTransportTitle")}</div>
      <div class="alt-links">${items}</div>
    </div>
  `;
}

function renderTrainCard(train, idx, { hero = false, highlighted = false, context = {} } = {}) {
  const severity = getDelaySeverity(train.delayMin);
  const dirBadge =
    train.directionLabel
      ? `<span class="dir-badge dir-${train.directionType}">${train.directionLabel}</span>`
      : "";

  const cardClasses = ["train-card", `severity-border-${severity}`];
  if (hero) cardClasses.push("hero-card");
  if (highlighted) cardClasses.push("highlighted");

  return `
    <div class="${cardClasses.join(" ")}" data-train-no="${train.trainNo}">
      ${hero ? `<div class="hero-label">${t("heroTitle")}</div>` : ""}
      ${renderReassurance(train)}
      ${renderDelayBlock(train)}
      <div class="card-body">
        <div class="left">
          <div class="meta-row">
            ${dirBadge}
            <span class="meta">${t("trainMeta", {
              no: train.trainNo,
              type: train.trainTypeName || "",
              dest: train.endingStation || "",
            })}</span>
          </div>
        </div>
        <div class="platform-badge severity-${severity}">
          <div class="num">${platformLabel(train.platform)}</div>
          <div class="label">${t("platform")}</div>
        </div>
      </div>
      ${renderAltTransport(train, context)}
      <div class="guide-btn" data-idx="${idx}">${t("guideBtn")}</div>
      <div class="car-layout" id="layout-${idx}">
        <div class="note">${t("carNote")}</div>
        ${renderCarLayout(train.trainNo)}
      </div>
    </div>
  `;
}

function sortTrainsForDisplay(trains, { trainNoFilter = "", routeMode = false } = {}) {
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
  { routeMode = false, trainNoFilter = "", originName = "", destName = "" } = {}
) {
  if (!trains.length) {
    resultsEl.innerHTML = `<div class="empty-state">${
      routeMode ? t("emptyRoute") : t("emptyLive")
    }</div>`;
    return;
  }

  const context = { originName, destName };
  const sorted = sortTrainsForDisplay(trains, { trainNoFilter, routeMode });
  const needle = String(trainNoFilter || "").trim();
  const showHero = routeMode || needle;
  const heroTrain = sorted[0];
  const restTrains = showHero ? sorted.slice(1, 12) : sorted.slice(0, 12);

  let html = "";
  if (showHero && heroTrain) {
    html += renderTrainCard(heroTrain, 0, {
      hero: true,
      highlighted: needle && String(heroTrain.trainNo) === needle,
      context,
    });
    if (restTrains.length) {
      html += `<div class="section-divider">${t("otherTrains")}</div>`;
    }
  }

  restTrains.forEach((train, i) => {
    const idx = showHero ? i + 1 : i;
    html += renderTrainCard(train, idx, {
      highlighted: needle && String(train.trainNo) === needle,
      context,
    });
  });

  resultsEl.innerHTML = html;

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

export function setQueryLabels({ originName = "", destName = "" } = {}) {
  currentOriginName = originName;
  currentDestName = destName;
}

export function handleSearchResult(data, { resultsEl, statusEl, destName, trainNoFilter = "", onFirstSpeak }) {
  const { trains, routeMode, meta } = data;
  renderResults(trains, resultsEl, {
    routeMode,
    trainNoFilter,
    originName: currentOriginName,
    destName: destName || meta.destName || currentDestName,
  });

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

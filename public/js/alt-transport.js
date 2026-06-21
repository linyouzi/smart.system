import { t } from "./i18n.js";

/** 主要 TRA 車站 → 城市（用於替代交通建議） */
const STATION_CITY = {
  "1000": "taipei",
  "1010": "taipei",
  "1020": "taipei",
  "1050": "taipei",
  "3300": "taichung",
  "3340": "taichung",
  "4220": "tainan",
  "4350": "kaohsiung",
  "4400": "kaohsiung",
  "7000": "hualien",
  "5020": "chiayi",
  "4080": "chiayi",
  "2170": "miaoli",
};

const CITY_PROFILE = {
  taipei: {
    hintKey: "altHintTaipei",
    thsr: "https://www.thsr.com.tw/",
    bus: "https://www.highway.gov.tw/",
    tour: "https://www.taiwantrip.com.tw/",
  },
  tainan: {
    hintKey: "altHintTainan",
    thsr: "https://www.thsr.com.tw/",
    bus: "https://www.highway.gov.tw/",
    tour: "https://www.taiwantrip.com.tw/",
  },
  taichung: {
    hintKey: "altHintTaichung",
    thsr: "https://www.thsr.com.tw/",
    bus: "https://www.highway.gov.tw/",
    tour: "https://www.taiwantrip.com.tw/",
  },
  kaohsiung: {
    hintKey: "altHintKaohsiung",
    thsr: "https://www.thsr.com.tw/",
    bus: "https://www.highway.gov.tw/",
    tour: "https://www.taiwantrip.com.tw/",
  },
  hualien: {
    hintKey: "altHintHualien",
    thsr: "https://www.thsr.com.tw/",
    bus: "https://www.taiwantrip.com.tw/",
    tour: "https://www.taiwantrip.com.tw/",
  },
  default: {
    hintKey: "altHintDefault",
    thsr: "https://www.thsr.com.tw/",
    bus: "https://www.highway.gov.tw/",
    tour: "https://www.taiwantrip.com.tw/",
  },
};

const ALT_PLAN_DEFS = [
  {
    id: "thsr",
    titleKey: "altPlanThsr",
    icon: "🚄",
    tieOrder: 0,
    hrefKey: "thsr",
    tags: [
      { type: "speed", level: "fast" },
      { type: "price", level: "high" },
      { type: "convenience", level: "normal" },
    ],
  },
  {
    id: "bus",
    titleKey: "altPlanBus",
    icon: "🚌",
    tieOrder: 1,
    hrefKey: "bus",
    tags: [
      { type: "speed", level: "slow" },
      { type: "price", level: "low" },
      { type: "convenience", level: "easy" },
    ],
  },
  {
    id: "tour",
    titleKey: "altPlanTour",
    icon: "🚃",
    tieOrder: 2,
    hrefKey: "tour",
    tags: [
      { type: "speed", level: "medium" },
      { type: "convenience", level: "easy" },
    ],
  },
];

const CITY_PLAN_OVERRIDES = {
  hualien: {
    bus: [{ type: "price", level: "low" }],
    tour: [
      { type: "speed", level: "medium" },
      { type: "price", level: "medium" },
      { type: "convenience", level: "easy" },
    ],
  },
};

function getCityKey(originId) {
  return STATION_CITY[String(originId)] || "default";
}

function getProfile(originId) {
  const city = getCityKey(originId);
  return CITY_PROFILE[city] || CITY_PROFILE.default;
}

export function getCityHint(originId) {
  const profile = getProfile(originId);
  return t(profile.hintKey);
}

function buildMapsUrl({ originName = "", destName = "" } = {}) {
  const origin = encodeURIComponent(originName || "Taiwan");
  const dest = encodeURIComponent(destName || "");
  if (destName && originName) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=transit`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${origin}+public+transport`;
}

export function buildAltTransportLinks(context = {}) {
  const profile = getProfile(context.originId);
  const mapsQuery = buildMapsUrl(context);

  return [
    { key: "altThsr", href: profile.thsr },
    { key: "altBus", href: profile.bus },
    { key: "altTour", href: profile.tour },
    { key: "altMaps", href: mapsQuery },
  ];
}

function resolvePlanTags(planDef, originId) {
  const city = getCityKey(originId);
  const override = CITY_PLAN_OVERRIDES[city]?.[planDef.id];
  return override ?? planDef.tags;
}

function buildAltPlans(context) {
  const profile = getProfile(context.originId);

  return ALT_PLAN_DEFS.map((def) => {
    const tags = resolvePlanTags(def, context.originId);
    return {
      id: def.id,
      icon: def.icon,
      title: t(def.titleKey),
      href: profile[def.hrefKey],
      tags,
      tagCount: tags.length,
      tieOrder: def.tieOrder,
    };
  }).sort((a, b) => b.tagCount - a.tagCount || a.tieOrder - b.tieOrder);
}

function renderTagBadge(tag) {
  const label = t(`altTag_${tag.type}`);
  const value = t(`altLevel_${tag.level}`);
  return `
    <span class="alt-tag alt-tag-${tag.type}">
      <span class="alt-tag-label">${label}</span>
      <span class="alt-tag-value">${value}</span>
    </span>
  `;
}

function renderPlanCard(plan, planNo) {
  const tagHtml = plan.tags.map(renderTagBadge).join("");
  return `
    <a class="alt-plan-card${planNo === 1 ? " alt-plan-primary" : ""}"
       href="${plan.href}"
       target="_blank"
       rel="noopener noreferrer">
      <div class="alt-plan-header">
        <span class="alt-plan-no">${t("altPlanNo", { n: planNo })}</span>
        <span class="alt-plan-icon" aria-hidden="true">${plan.icon}</span>
        <span class="alt-plan-title">${plan.title}</span>
        <span class="alt-chevron" aria-hidden="true">›</span>
      </div>
      <div class="alt-plan-tags">${tagHtml}</div>
    </a>
  `;
}

export function renderAltTransportBlock(context) {
  const plans = buildAltPlans(context);
  const cityHint = getCityHint(context.originId);
  const links = buildAltTransportLinks(context);

  const planCards = plans.map((plan, i) => renderPlanCard(plan, i + 1)).join("");

  const chips = links
    .map(
      (l) =>
        `<a class="alt-chip" href="${l.href}" target="_blank" rel="noopener noreferrer">${t(l.key)}</a>`
    )
    .join("");

  return `
    <div class="alt-transport-block">
      <div class="alt-block-title">${t("altTransportAction")}</div>
      <div class="alt-city-hint">${cityHint}</div>
      <div class="alt-plan-list">${planCards}</div>
      <div class="alt-chips">${chips}</div>
    </div>
  `;
}

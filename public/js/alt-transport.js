import { t } from "./i18n.js";

/** 官方／常用查詢連結 */
const OFFICIAL_LINKS = {
  thsr: {
    /** 高鐵時刻表與票價查詢（官方） */
    timetable: "https://www.thsr.com.tw/ArticleContent/a3b630bb-1066-4352-a1ef-58c7b4e8ef7c",
    /** 高鐵網路訂票 */
    booking: "https://irs.thsrc.com.tw/IMINT/",
    home: "https://www.thsr.com.tw/",
  },
  bus: {
    /** 公路客運：以起訖地區搜尋 */
    areaQuery: "https://www.taiwanbus.tw/eBUSPage/Query/AreaQuery.aspx?lan=C",
    /** 公路客運：路線編號或站牌搜尋 */
    routeQuery: "https://www.taiwanbus.tw/eBUSPage/Query/RouteQuery.aspx?lan=C",
    /** 公路客運：以客運業者搜尋 */
    operatorQuery: "https://www.taiwanbus.tw/eBUSPage/Query/CustomerQuery.aspx?lan=C",
    home: "https://www.taiwanbus.tw/eBUSPage/default.aspx?lan=C",
    /** 花蓮縣政府：公車時刻表彙整 */
    hualienTimetable: "https://traffic.hl.gov.tw/Bus/BusTimeTable",
    /** 國道／公路客運資訊入口（交通部公路局） */
    highwayGov: "https://www.highway.gov.tw/",
  },
  tour: {
    home: "https://www.taiwantrip.com.tw/",
  },
};

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
  taipei: { hintKey: "altHintTaipei" },
  tainan: { hintKey: "altHintTainan" },
  taichung: { hintKey: "altHintTaichung" },
  kaohsiung: { hintKey: "altHintKaohsiung" },
  hualien: { hintKey: "altHintHualien" },
  default: { hintKey: "altHintDefault" },
};

/** 各城市推薦的公路客運查詢入口 */
const CITY_BUS_LINK = {
  hualien: OFFICIAL_LINKS.bus.hualienTimetable,
  default: OFFICIAL_LINKS.bus.areaQuery,
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

function buildThsrUrl() {
  return OFFICIAL_LINKS.thsr.timetable;
}

function buildBusUrl(originId) {
  const city = getCityKey(originId);
  return CITY_BUS_LINK[city] || CITY_BUS_LINK.default;
}

function buildTourUrl() {
  return OFFICIAL_LINKS.tour.home;
}

function resolvePlanHref(def, context) {
  if (def.hrefKey === "thsr") return buildThsrUrl(context);
  if (def.hrefKey === "bus") return buildBusUrl(context.originId);
  if (def.hrefKey === "tour") return buildTourUrl();
  return OFFICIAL_LINKS.tour.home;
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
  const mapsQuery = buildMapsUrl(context);

  return [
    { key: "altThsr", href: buildThsrUrl(context) },
    { key: "altBus", href: buildBusUrl(context.originId) },
    { key: "altTour", href: buildTourUrl() },
    { key: "altMaps", href: mapsQuery },
  ];
}

function resolvePlanTags(planDef, originId) {
  const city = getCityKey(originId);
  const override = CITY_PLAN_OVERRIDES[city]?.[planDef.id];
  return override ?? planDef.tags;
}

function buildAltPlans(context) {
  return ALT_PLAN_DEFS.map((def) => {
    const tags = resolvePlanTags(def, context.originId);
    return {
      id: def.id,
      icon: def.icon,
      title: t(def.titleKey),
      href: resolvePlanHref(def, context),
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

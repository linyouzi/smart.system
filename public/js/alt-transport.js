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
  "6000": "hualien",
  "7000": "kaohsiung",
  "7020": "kaohsiung",
  "5020": "chiayi",
  "4080": "changhua",
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

export function getCityHint(originId) {
  const city = STATION_CITY[String(originId)] || "default";
  const profile = CITY_PROFILE[city] || CITY_PROFILE.default;
  return t(profile.hintKey);
}

export function buildAltTransportLinks({ originId = "", originName = "", destName = "" } = {}) {
  const city = STATION_CITY[String(originId)] || "default";
  const profile = CITY_PROFILE[city] || CITY_PROFILE.default;
  const origin = encodeURIComponent(originName || "Taiwan");
  const dest = encodeURIComponent(destName || "");
  const mapsQuery =
    destName && originName
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=transit`
      : `https://www.google.com/maps/search/?api=1&query=${origin}+public+transport`;

  return [
    { key: "altThsr", href: profile.thsr },
    { key: "altBus", href: profile.bus },
    { key: "altTour", href: profile.tour },
    { key: "altMaps", href: mapsQuery },
  ];
}

export function renderAltTransportBlock(context) {
  const links = buildAltTransportLinks(context);
  const cityHint = getCityHint(context.originId);
  const items = links
    .map(
      (l) =>
        `<a class="alt-chip" href="${l.href}" target="_blank" rel="noopener noreferrer">${t(l.key)}</a>`
    )
    .join("");

  const primary = links[0];
  return `
    <div class="alt-transport-block">
      <div class="alt-block-title">${t("altTransportAction")}</div>
      <div class="alt-city-hint">${cityHint}</div>
      <a class="alt-suggest" href="${primary.href}" target="_blank" rel="noopener noreferrer">
        <span class="alt-suggest-icon" aria-hidden="true">🚌</span>
        <span class="alt-suggest-text">${t("altSuggestion", {
          origin: context.originName,
          dest: context.destName,
        })}</span>
        <span class="alt-chevron" aria-hidden="true">›</span>
      </a>
      <div class="alt-chips">${items}</div>
    </div>
  `;
}

import { t } from "./i18n.js";

/** @returns {'ok'|'moderate'|'severe'} */
export function getDelaySeverity(delayMin) {
  const d = delayMin ?? 0;
  if (d < 5) return "ok";
  if (d <= 20) return "moderate";
  return "severe";
}

export function addMinutesToTime(timeStr, delayMin) {
  if (!timeStr || timeStr === "--:--") return null;
  const m = String(timeStr).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2], 10) + (delayMin ?? 0);
  while (min >= 60) {
    min -= 60;
    h += 1;
  }
  while (min < 0) {
    min += 60;
    h -= 1;
  }
  h = ((h % 24) + 24) % 24;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function platformLabel(platform) {
  if (platform === null || platform === undefined || platform === "" || platform === "—") {
    return t("platformPending");
  }
  return String(platform);
}

export function reassuranceMessage(train) {
  const severity = getDelaySeverity(train.delayMin);
  const platform = platformLabel(train.platform);

  if (severity === "ok") return t("reassuranceOk");
  if (severity === "moderate") {
    if (train.platform === null || train.platform === undefined || train.platform === "") {
      return t("reassuranceModerateNoPlatform");
    }
    return t("reassuranceModerate", { platform });
  }
  return t("reassuranceSevere");
}

export function statusIcon(severity) {
  if (severity === "ok") return "✓";
  if (severity === "moderate") return "◷";
  return "⚠";
}

const ALT_LINKS = {
  thsr: "https://www.thsr.com.tw/",
  bus: "https://www.highway.gov.tw/",
  tour: "https://www.taiwantrip.com.tw/",
};

export function buildAltTransportLinks({ originName = "", destName = "" } = {}) {
  const origin = encodeURIComponent(originName || "Taiwan");
  const dest = encodeURIComponent(destName || "");
  const mapsQuery =
    destName && originName
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=transit`
      : `https://www.google.com/maps/search/?api=1&query=${origin}+public+transport`;

  return [
    { key: "altMaps", href: mapsQuery },
    { key: "altThsr", href: ALT_LINKS.thsr },
    { key: "altBus", href: ALT_LINKS.bus },
    { key: "altTour", href: ALT_LINKS.tour },
  ];
}

export function primaryAltLink(context) {
  const links = buildAltTransportLinks(context);
  return links[1] || links[0];
}

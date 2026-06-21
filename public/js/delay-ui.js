import { t } from "./i18n.js";

/** @returns {'ok'|'moderate'|'severe'} */
export function getDelaySeverity(delayMin, { liveStatus = "live" } = {}) {
  if (liveStatus === "timetable") return "ok";
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

/** Sort key: scheduled departure + delay (minutes from midnight). */
export function estimatedDepartureMinutes(timeStr, delayMin = 0) {
  const m = String(timeStr || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return Number.POSITIVE_INFINITY;
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
  return h * 60 + min;
}

export function compareTrainsByEstimatedDeparture(a, b) {
  return (
    estimatedDepartureMinutes(a.scheduledTime, a.delayMin) -
    estimatedDepartureMinutes(b.scheduledTime, b.delayMin)
  );
}

export function platformLabel(platform) {
  if (platform === null || platform === undefined || platform === "" || platform === "—") {
    return t("platformPending");
  }
  return String(platform);
}

export function reassuranceMessage(train) {
  const severity = getDelaySeverity(train.delayMin, { liveStatus: train.liveStatus });
  const platform = platformLabel(train.platform);

  if (train.liveStatus === "timetable") return t("reassuranceTimetable");
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

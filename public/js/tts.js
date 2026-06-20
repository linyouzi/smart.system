import { t, ttsLangCode } from "./i18n.js";

let enabled = false;
let userToggled = false;

export function isTtsEnabled() {
  return enabled;
}

export function setTtsEnabled(val, fromUser = false) {
  enabled = val;
  if (fromUser) userToggled = true;
}

export function syncTtsWithLargeMode(largeMode) {
  if (largeMode && !userToggled) {
    enabled = true;
  }
}

export function wasUserToggled() {
  return userToggled;
}

export function updateTtsButton(btn) {
  if (!btn) return;
  btn.classList.toggle("active", enabled);
}

function delayText(delayMin) {
  return delayMin > 0 ? t("ttsDelay", { n: delayMin }) : t("ttsOnTime");
}

export function speakTrains(trains, { limit = 3, onChangeOnly = false } = {}) {
  if (!enabled || !window.speechSynthesis) return;
  if (!trains.length) return;

  window.speechSynthesis.cancel();
  const top = trains.slice(0, limit);

  top.forEach((train, i) => {
    const platform =
      train.platform != null ? String(train.platform) : t("ttsUnknownPlatform");
    const text = t("ttsTemplate", {
      dest: train.endingStation || "",
      type: train.trainTypeName || "",
      no: train.trainNo,
      platform,
      delay: delayText(train.delayMin),
    });
    const u = new SpeechSynthesisUtterance(text);
    u.lang = ttsLangCode();
    u.rate = document.body.dataset.large === "1" ? 0.85 : 1.0;
    setTimeout(() => window.speechSynthesis.speak(u), i * 4000);
  });
}

export function speakChange(change) {
  if (!enabled || !window.speechSynthesis) return;
  const { after } = change;
  const platform =
    after.platform != null ? String(after.platform) : t("ttsUnknownPlatform");
  const prefix = t("changeAlert");
  const text = `${prefix}。${t("ttsTemplate", {
    dest: after.endingStation || "",
    type: after.trainTypeName || "",
    no: after.trainNo,
    platform,
    delay: delayText(after.delayMin),
  })}`;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = ttsLangCode();
  window.speechSynthesis.speak(u);
}

import { apiUrl } from "./api.js";

export let locale = localStorage.getItem("locale") || "zh-TW";
export let dict = {};

export function t(key, vars = {}) {
  let text = dict[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return text;
}

export async function loadLocale(lang) {
  locale = lang;
  localStorage.setItem("locale", lang);
  const res = await fetch(apiUrl(`/i18n/${lang}.json`));
  dict = await res.json();
  const htmlLang =
    lang === "en" ? "en" : lang === "th" ? "th" : lang === "vi" ? "vi" : "zh-Hant";
  document.documentElement.lang = htmlLang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (dict[key]) el.textContent = dict[key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (dict[key]) el.placeholder = dict[key];
  });
  ["langZh", "langEn", "langTh", "langVi"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const map = { langZh: "zh-TW", langEn: "en", langTh: "th", langVi: "vi" };
    el.classList.toggle("active", lang === map[id]);
  });
  // #region agent log
  fetch('http://127.0.0.1:7368/ingest/0be302a9-cd00-4192-a4f7-1ccb70fba283',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'684877'},body:JSON.stringify({sessionId:'684877',location:'i18n.js:loadLocale',message:'locale applied',data:{lang,footerCredit:dict.footerCredit,stationPlaceholder:dict.stationPlaceholder},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
  // #endregion
}

export function apiLang() {
  if (locale === "en") return "en";
  return "zh-TW";
}

export function ttsLangCode() {
  const map = {
    "zh-TW": "zh-TW",
    en: "en-US",
    th: "th-TH",
    vi: "vi-VN",
  };
  return map[locale] || "zh-TW";
}

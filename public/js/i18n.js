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
  const langSelect = document.getElementById("langSelect");
  if (langSelect) langSelect.value = lang;
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

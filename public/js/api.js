const STORAGE_KEY = "sfbs_api_base";
let defaultApiBase = "";

/** 是否為 Capacitor 原生 App（Android / iOS） */
export function isNativeApp() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

/** 從伺服器讀取預設 API 網址（部署後設定 PUBLIC_SERVER_URL） */
export async function loadAppConfig() {
  try {
    const res = await fetch("/config.json");
    const cfg = await res.json();
    if (cfg.defaultApiBase) defaultApiBase = cfg.defaultApiBase.replace(/\/$/, "");
  } catch {
    /* 離線或 file:// 時略過 */
  }
}

/** 讀取後端 API 根網址（不含結尾 /） */
export function getApiBase() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return saved.replace(/\/$/, "");
  if (defaultApiBase) return defaultApiBase;

  if (isNativeApp()) {
    return "http://10.0.2.2:3000";
  }
  return "";
}

export function setApiBase(url) {
  const trimmed = (url || "").trim().replace(/\/$/, "");
  if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
  else localStorage.removeItem(STORAGE_KEY);
}

export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBase();
  return base ? `${base}${p}` : p;
}

export async function apiFetch(path, options) {
  return fetch(apiUrl(path), options);
}

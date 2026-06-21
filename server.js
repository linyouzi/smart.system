/**
 * 智慧友善搭乘系統 - 後端伺服器（純 Node.js 內建模組，無需 npm install）
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

function loadEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

const envFromFile = loadEnv(path.join(__dirname, ".env"));
const env = { ...envFromFile, ...process.env };

const PORT = env.PORT || 3000;
const TDX_CLIENT_ID = env.TDX_CLIENT_ID;
const TDX_CLIENT_SECRET = env.TDX_CLIENT_SECRET;
const PUBLIC_SERVER_URL = (env.PUBLIC_SERVER_URL || "").replace(/\/$/, "");
const APP_VERSION = "1.0.0";

/** 部署到 Render 等反向代理時，可從請求標頭推斷公開 HTTPS 網址 */
function resolvePublicServerUrl(req) {
  if (PUBLIC_SERVER_URL) return PUBLIC_SERVER_URL;
  const host = req?.headers?.host;
  if (!host || /localhost|127\.0\.0\.1/i.test(host)) return "";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`.replace(/\/$/, "");
}
const APK_FILENAME = "smart-boarding.apk";

const TOKEN_URL =
  "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token";
const API_BASE = "https://tdx.transportdata.tw/api/basic";

let cachedToken = null;
let tokenExpiresAt = 0;

const tdxResponseCache = new Map();
const TDX_MIN_INTERVAL_MS = 250;
let lastTdxRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tdxCacheTtl(apiPath) {
  if (apiPath.includes("/LiveBoard/")) return 45_000;
  if (apiPath.includes("/DailyTrainTimetable/")) return 3_600_000;
  if (apiPath.includes("/Station")) return 3_600_000;
  return 0;
}

function getTdxCacheEntry(apiPath) {
  const entry = tdxResponseCache.get(apiPath);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}

function setTdxCacheEntry(apiPath, data) {
  const ttl = tdxCacheTtl(apiPath);
  if (!ttl) return;
  tdxResponseCache.set(apiPath, { data, expiresAt: Date.now() + ttl });
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  if (!TDX_CLIENT_ID || !TDX_CLIENT_SECRET || TDX_CLIENT_ID.includes("你的")) {
    throw new Error(
      "尚未設定 TDX_CLIENT_ID / TDX_CLIENT_SECRET，請參考 .env.example 設定 .env 檔案"
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: TDX_CLIENT_ID,
    client_secret: TDX_CLIENT_SECRET,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`取得 TDX Access Token 失敗 (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

async function callTdx(apiPath) {
  const fresh = getTdxCacheEntry(apiPath);
  if (fresh) return fresh.data;

  const stale = tdxResponseCache.get(apiPath) || null;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const waitMs = TDX_MIN_INTERVAL_MS - (Date.now() - lastTdxRequestAt);
    if (waitMs > 0) await sleep(waitMs);

    lastTdxRequestAt = Date.now();
    const token = await getAccessToken();
    const res = await fetch(`${API_BASE}${apiPath}`, {
      headers: {
        authorization: `Bearer ${token}`,
        "Accept-Encoding": "gzip",
      },
    });

    if (res.status === 429) {
      if (stale) {
        console.warn(`TDX 429，使用快取資料：${apiPath}`);
        return stale.data;
      }
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      const backoffMs = retryAfter > 0 ? retryAfter * 1000 : (attempt + 1) * 2000;
      if (attempt < maxAttempts - 1) {
        console.warn(`TDX 429，${backoffMs}ms 後重試 (${attempt + 1}/${maxAttempts})`);
        await sleep(backoffMs);
        continue;
      }
      throw new Error(
        "TDX API 請求過於頻繁（429），請稍候 1～2 分鐘再試。若持續發生，可能是免費方案配額已用完。"
      );
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`TDX API 錯誤 (${res.status}): ${text}`);
    }

    const data = await res.json();
    setTdxCacheEntry(apiPath, data);
    return data;
  }

  if (stale) return stale.data;
  throw new Error("TDX API 暫時無法連線，請稍後再試");
}

function unwrapTdxList(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const key of [
      "Stations",
      "LiveBoards",
      "TrainTimetables",
      "TrainTimeTables",
      "DailyTrainTimetables",
    ]) {
      if (Array.isArray(data[key])) return data[key];
    }
    if (data.message) throw new Error(data.message);
  }
  throw new Error("Unexpected TDX response format");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

function parseQuery(url) {
  const idx = url.indexOf("?");
  if (idx === -1) return {};
  const params = {};
  for (const part of url.slice(idx + 1).split("&")) {
    const [k, v] = part.split("=");
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
  }
  return params;
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isEnglish(lang) {
  return lang === "en" || lang === "en-US";
}

function normalizeStationName(name) {
  return String(name || "")
    .replace(/\s/g, "")
    .replace(/台/g, "臺")
    .toLowerCase();
}

function getDirectionMeta(directionVal) {
  // TRA TDX LiveBoard：0 = 順行（南下），1 = 逆行（北上）
  if (directionVal === 0) {
    return { type: "south", labelZh: "南下", labelEn: "Southbound" };
  }
  if (directionVal === 1) {
    return { type: "north", labelZh: "北上", labelEn: "Northbound" };
  }
  return { type: "unknown", labelZh: "", labelEn: "" };
}

function simplifyLiveBoardRow(t, lang) {
  const en = isEnglish(lang);
  const dir = getDirectionMeta(t.Direction);
  return {
    trainNo: t.TrainNo,
    direction: t.Direction,
    directionType: dir.type,
    directionLabel: en ? dir.labelEn : dir.labelZh,
    endingStation: en
      ? t.EndingStationName?.En || t.EndingStationName?.Zh_tw
      : t.EndingStationName?.Zh_tw,
    platform: t.Platform ?? null,
    delayMin: t.DelayTime ?? 0,
    scheduledTime: t.ScheduledDepartureTime || t.ScheduledArrivalTime,
    trainTypeName: en
      ? t.TrainTypeName?.En || t.TrainTypeName?.Zh_tw
      : t.TrainTypeName?.Zh_tw,
  };
}

function extractTrainNosFromTimetable(data) {
  const trainNos = new Set();
  const list = Array.isArray(data) ? data : [data];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    if (item.TrainNo) trainNos.add(String(item.TrainNo));
    const timetables = item.TrainTimetables || item.TrainTimeTables || [];
    for (const tt of timetables) {
      if (tt?.TrainNo) trainNos.add(String(tt.TrainNo));
    }
  }
  return trainNos;
}

let stationsCache = null;
let stationsCacheAt = 0;
const STATIONS_FALLBACK_PATH = path.join(__dirname, "public", "data", "tra-stations.json");

function simplifyStationRow(s) {
  return {
    stationId: String(s.StationID || s.stationId),
    name: s.StationName?.Zh_tw || s.name,
    nameEn: s.StationName?.En || s.nameEn,
    lat: s.StationPosition?.PositionLat ?? s.lat ?? null,
    lon: s.StationPosition?.PositionLon ?? s.lon ?? null,
  };
}

function loadFallbackStations() {
  if (!fs.existsSync(STATIONS_FALLBACK_PATH)) return [];
  const payload = JSON.parse(fs.readFileSync(STATIONS_FALLBACK_PATH, "utf-8"));
  const list = Array.isArray(payload) ? payload : payload.stations || [];
  return list.map(simplifyStationRow);
}

async function loadAllStations() {
  const now = Date.now();
  if (stationsCache && now - stationsCacheAt < 3_600_000) {
    return stationsCache.map(simplifyStationRow);
  }

  try {
    const raw = await callTdx(
      "/v3/Rail/TRA/Station?$select=StationID,StationName,StationPosition&$format=JSON"
    );
    stationsCache = unwrapTdxList(raw);
    stationsCacheAt = now;
    return stationsCache.map(simplifyStationRow);
  } catch (err) {
    console.error("TDX stations fetch failed, using fallback:", err.message);
    const fallback = loadFallbackStations();
    if (fallback.length) {
      stationsCache = fallback.map((s) => ({
        StationID: s.stationId,
        StationName: { Zh_tw: s.name, En: s.nameEn },
        StationPosition: { PositionLat: s.lat, PositionLon: s.lon },
      }));
      stationsCacheAt = now;
      return fallback;
    }
    throw err;
  }
}

async function getStationNameZh(stationId) {
  await loadAllStations();
  const s = stationsCache.find((x) => String(x.StationID) === String(stationId));
  return s?.StationName?.Zh_tw || "";
}

async function fetchOdTrainNos(originId, destId) {
  const date = todayIso();
  const paths = [
    `/v3/Rail/TRA/DailyTrainTimetable/OD/${originId}/to/${destId}/${date}?$format=JSON`,
    `/v2/Rail/TRA/DailyTrainTimetable/OD/${originId}/to/${destId}/${date}?$format=JSON`,
  ];
  for (const apiPath of paths) {
    try {
      const raw = await callTdx(apiPath);
      const list = Array.isArray(raw) ? raw : unwrapTdxList(raw);
      return extractTrainNosFromTimetable(list);
    } catch (_) {
      /* try next API version */
    }
  }
  return new Set();
}

function filterTrainsByDest(trains, destName, allowedTrainNos) {
  const destNorm = normalizeStationName(destName);
  return trains.filter((t) => {
    if (allowedTrainNos.has(String(t.trainNo))) return true;
    if (destNorm && normalizeStationName(t.endingStation) === destNorm) return true;
    return false;
  });
}

function filterTrainsByDirection(trains, direction) {
  if (!direction || direction === "all") return trains;
  return trains.filter((t) => t.directionType === direction);
}

async function buildLiveBoardResponse(originId, lang, { destId = "", direction = "all" } = {}) {
  const raw = await callTdx(`/v2/Rail/TRA/LiveBoard/Station/${originId}?$format=JSON`);
  let trains = unwrapTdxList(raw).map((t) => simplifyLiveBoardRow(t, lang));
  const totalLive = trains.length;

  let destName = "";
  let routeMode = false;
  if (destId) {
    routeMode = true;
    destName = await getStationNameZh(destId);
    const allowedTrainNos = await fetchOdTrainNos(originId, destId);
    trains = filterTrainsByDest(trains, destName, allowedTrainNos);
  }

  trains = filterTrainsByDirection(trains, direction);
  trains.sort((a, b) => (a.scheduledTime || "").localeCompare(b.scheduledTime || ""));

  return {
    originId,
    destId: destId || null,
    destName,
    direction,
    routeMode,
    trains,
    totalLive,
    matched: trains.length,
  };
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".apk": "application/vnd.android.package-archive",
};

function serveStatic(req, res) {
  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(__dirname, "public", decodeURIComponent(filePath.split("?")[0]));

  if (!filePath.startsWith(path.join(__dirname, "public"))) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 Not Found");
    }
    const ext = path.extname(filePath);
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
    if (/\.(html?|js|css|json|webmanifest)$/.test(ext) || filePath.endsWith("sw.js")) {
      headers["Cache-Control"] = "no-cache, must-revalidate";
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

async function handleStations(req, res) {
  try {
    const simplified = await loadAllStations();
    sendJson(res, 200, simplified);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}

function normalizeStationQuery(text) {
  return (text || "").replace(/\s/g, "").replace(/台/g, "臺").toLowerCase();
}

function stripStationSuffixQuery(text) {
  let s = normalizeStationQuery(text);
  s = s.replace(/火車站$/, "");
  s = s.replace(/車站$/, "");
  s = s.replace(/站$/, "");
  return s;
}

function stationQueryVariants(query) {
  const base = normalizeStationQuery(query);
  const stripped = stripStationSuffixQuery(query);
  const variants = new Set([base]);
  if (stripped) variants.add(stripped);
  if (/^\d{3,4}$/.test(stripped || base)) variants.add(stripped || base);
  return [...variants];
}

function scoreStationQuery(station, query) {
  const names = [normalizeStationQuery(station.name), normalizeStationQuery(station.nameEn)].filter(
    Boolean
  );
  const id = String(station.stationId || "");
  let best = 0;
  for (const q of stationQueryVariants(query)) {
    if (!q) continue;
    if (id && id === q) best = Math.max(best, 100);
    for (const name of names) {
      if (name === q) best = Math.max(best, 100);
      else if (name.startsWith(q) || q.startsWith(name)) best = Math.max(best, 90);
      else if (name.includes(q) || q.includes(name)) best = Math.max(best, 70);
    }
  }
  return best;
}

async function handleStationMatch(req, res, query) {
  try {
    const q = (query.q || "").trim();
    if (!q) return sendJson(res, 400, { error: "missing q" });

    const all = await loadAllStations();
    const ranked = all
      .map((s) => ({ s, score: scoreStationQuery(s, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || (a.s.name || "").localeCompare(b.s.name || "", "zh-Hant"));

    if (!ranked.length) return sendJson(res, 200, { match: null, matches: [] });

    const top = ranked[0];
    const second = ranked[1];
    if (ranked.length === 1 || (top.score >= 70 && (!second || top.score > second.score))) {
      return sendJson(res, 200, { match: top.s, score: top.score });
    }

    return sendJson(res, 200, {
      match: null,
      matches: ranked.slice(0, 8).map((x) => x.s),
    });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}

async function handleLiveBoard(req, res, stationId, lang, query) {
  try {
    const payload = await buildLiveBoardResponse(stationId, lang, {
      destId: query.destId || "",
      direction: query.direction || "all",
    });
    sendJson(res, 200, payload.trains);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}

async function handleSearchLiveBoard(req, res, stationId, lang, query) {
  try {
    const payload = await buildLiveBoardResponse(stationId, lang, {
      destId: query.destId || "",
      direction: query.direction || "all",
    });
    sendJson(res, 200, payload);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}

async function handleTimetable(req, res, originId, destId) {
  try {
    const date = todayIso();
    const raw = await callTdx(
      `/v3/Rail/TRA/DailyTrainTimetable/OD/${originId}/to/${destId}/${date}?$format=JSON`
    );
    const data = unwrapTdxList(raw);
    const trainNos = [...extractTrainNosFromTimetable(data)];
    sendJson(res, 200, { originId, destId, date, trainNos, count: trainNos.length });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}

async function handleRouteLiveBoard(req, res, originId, destId, lang, query) {
  try {
    const payload = await buildLiveBoardResponse(originId, lang, {
      destId,
      direction: query.direction || "all",
    });
    sendJson(res, 200, payload);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
}

function handleConfig(req, res) {
  sendJson(res, 200, {
    defaultApiBase: resolvePublicServerUrl(req),
    appVersion: APP_VERSION,
    downloadPage: "/download.html",
  });
}

function handleAppInfo(req, res) {
  const apkPath = path.join(__dirname, "public", "downloads", APK_FILENAME);
  const apkExists = fs.existsSync(apkPath);
  let apkSize = null;
  if (apkExists) apkSize = fs.statSync(apkPath).size;

  const host = req.headers.host || `localhost:${PORT}`;
  const proto = req.headers["x-forwarded-proto"] || "http";

  const publicUrl = resolvePublicServerUrl(req);

  sendJson(res, 200, {
    version: APP_VERSION,
    apkAvailable: apkExists,
    apkUrl: apkExists ? `/downloads/${APK_FILENAME}` : null,
    apkSize,
    publicServerUrl: publicUrl,
    webUrl: `${proto}://${host}`,
    downloadPage: `${proto}://${host}/download.html`,
  });
}

function handleHealth(req, res) {
  const hasId = Boolean(TDX_CLIENT_ID && !TDX_CLIENT_ID.includes("你的"));
  const hasSecret = Boolean(TDX_CLIENT_SECRET && !TDX_CLIENT_SECRET.includes("你的"));
  const tdxConfigured = hasId && hasSecret;
  const issues = [];
  if (!hasId) issues.push("missing_id");
  if (!hasSecret) issues.push("missing_secret");
  sendJson(res, 200, {
    ok: true,
    tdxConfigured,
    issues,
  });
}

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  const query = parseQuery(req.url);
  const lang = query.lang || "zh-TW";

  if (url === "/api/health") return handleHealth(req, res);
  if (url === "/api/app/info") return handleAppInfo(req, res);
  if (url === "/config.json") return handleConfig(req, res);
  if (url === "/download" || url === "/app") {
    res.writeHead(302, { Location: "/download.html" });
    return res.end();
  }
  if (url === "/api/stations") return handleStations(req, res);
  if (url === "/api/stations/match") return handleStationMatch(req, res, query);

  const liveboardMatch = url.match(/^\/api\/liveboard\/([^/]+)$/);
  if (liveboardMatch) return handleLiveBoard(req, res, liveboardMatch[1], lang, query);

  const searchMatch = url.match(/^\/api\/search\/([^/]+)$/);
  if (searchMatch) return handleSearchLiveBoard(req, res, searchMatch[1], lang, query);

  const timetableMatch = url.match(/^\/api\/timetable\/([^/]+)\/([^/]+)$/);
  if (timetableMatch) return handleTimetable(req, res, timetableMatch[1], timetableMatch[2]);

  const routeMatch = url.match(/^\/api\/route-liveboard\/([^/]+)\/([^/]+)$/);
  if (routeMatch) return handleRouteLiveBoard(req, res, routeMatch[1], routeMatch[2], lang, query);

  if (url.startsWith("/api/")) return sendJson(res, 404, { error: "Not Found" });

  return serveStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`智慧友善搭乘系統伺服器已啟動： http://localhost:${PORT}`);
  console.log(`手機 App 請用區網 IP，例如 http://<你的IP>:${PORT}`);
  console.log(`App 下載頁： http://localhost:${PORT}/download.html`);
  if (fs.existsSync(path.join(__dirname, "public", "downloads", APK_FILENAME))) {
    console.log(`APK 已就緒： /downloads/${APK_FILENAME}`);
  } else {
    console.log("⚠️  尚未建置 APK，請執行 build-apk.bat");
  }
  if (
    !TDX_CLIENT_ID ||
    !TDX_CLIENT_SECRET ||
    TDX_CLIENT_ID.includes("你的") ||
    TDX_CLIENT_SECRET.includes("你的")
  ) {
    console.log("⚠️  尚未完整設定 TDX 金鑰，請編輯 .env 檔案（需 Client ID + Secret）");
  }
});

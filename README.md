# 智慧友善搭乘系統（Smart Friendly Boarding System）

HACKRAIL 鐵客松提案 Demo — 中原大學資訊管理學系

即時月台導引網頁，**真實串接 TDX 運輸資料流通服務**（交通部開放資料平台）。

---

## 這個 Demo 做了什麼

- ✅ **真實資料**：車站清單、即時到離站電子看板（車次、目的地、月台號碼、誤點分鐘）皆來自 TDX API
- 🔊 **語音播報**：Web Speech API，大字模式開啟時預設啟用
- 🔔 **班次異動推播**：每 30 秒自動更新，月台／誤點變化時跳出提示卡片（可選瀏覽器通知）
- 🔍 **車站搜尋**：Autocomplete + 中文別名模糊搜尋（如「北車」→ 台北）
- 🧭 **目的地導引**：起站 + 目的地，篩選建議搭乘車次（TDX 站間時刻表 + 即時看板）
- 📷 **掃碼定位**：QR 格式 `TRA:1000:A`，掃描後自動查詢並標示區域
- 🌐 **多語言**：中文 / English（i18n JSON 字典）
- 💾 **常用／最近車站**：localStorage 儲存（deviceId）
- ♿ **無障礙提示**：輪椅／避開樓梯示意文字
- 🎨 **示意呈現**：車廂在月台上的相對位置圖（非 TDX 實測）
- 🧓 **長者大字模式**（加強版字級）
- 📱 **PWA 可安裝**：Chrome / Safari「加入主畫面」或按「安裝 App」
- ↕️ **北上／南下**：依 TDX Direction 篩選（0=順行/北上、1=逆行/南下）
- 🎯 **目的地**：篩選「會停靠該站」的列車（OD 時刻表 + 終點站比對）
- 🗣️ **語音**：中文、English、ไทย、Tiếng Việt（需裝置 TTS 語音包）

## 系統架構（對應 PPT 第5張）

```
瀏覽器前端 (public/index.html)
        │  fetch /api/...
        ▼
Node.js 後端伺服器 (server.js)   ← API Gateway，負責保管 TDX 金鑰
        │  OAuth2 + Bearer Token
        ▼
TDX 運輸資料流通服務 (tdx.transportdata.tw)
```

**為什麼需要後端？** TDX 驗證需要 Client Secret，這個密鑰絕對不能放在前端 JS 裡（會被任何人看到原始碼偷走），所以一定要透過後端代理呼叫。

---

## 手機 App 與公開下載

- **下載頁**：`http://localhost:3000/download.html`（需先執行 `build-apk.bat`）
- **完整流程**：見 **[PUBLIC_DOWNLOAD.md](./PUBLIC_DOWNLOAD.md)**
- **Android 建置**：`build-apk.bat` → 分享下載頁網址 + QR Code
- **正式上線**：部署到 HTTPS 雲端，設定 `.env` 的 `PUBLIC_SERVER_URL`
- **Render 免費部署**：逐步教學見 **[RENDER_DEPLOY.md](./RENDER_DEPLOY.md)**

詳見 **[MOBILE_APP.md](./MOBILE_APP.md)**

## 安裝與執行步驟

### 1. 取得 TDX API 金鑰

1. 前往 [TDX 運輸資料流通服務平台](https://tdx.transportdata.tw) 註冊會員
   - 學生可用學校信箱申請「學研單位」會員，審核較快
2. Email 驗證並等待審核通過後登入
3. 進入「會員中心 > API 金鑰」，取得 **Client ID** 和 **Client Secret**

### 2. 設定環境變數

把 `.env.example` 複製一份改名為 `.env`：

```bash
cp .env.example .env
```

打開 `.env`，把你的 Client ID / Secret 貼進去：

```
TDX_CLIENT_ID=你拿到的Client ID
TDX_CLIENT_SECRET=你拿到的Client Secret
PORT=3000
```

### 3. 啟動伺服器

不需要 `npm install`（本專案只用 Node.js 內建模組，零外部依賴）：

```bash
node server.js
```

看到以下訊息代表成功：

```
智慧友善搭乘系統伺服器已啟動： http://localhost:3000
```

### 4. 開啟瀏覽器

前往 `http://localhost:3000`，選擇車站（例如「台北」），按下「查詢即時看板」，
就會看到從 TDX 抓回來的真實即時班次與月台資訊。

> 需求：Node.js 18 以上版本（內建 `fetch`）。可用 `node -v` 確認版本。

---

## 檔案結構

```
.
├── server.js          # 後端：TDX OAuth、API 代理、靜態檔案伺服
├── package.json
├── .env.example        # 環境變數範例（複製成 .env 並填入金鑰）
└── public/
    ├── index.html
    ├── css/app.css
    ├── i18n/zh-TW.json, en.json
    └── js/             # 模組化前端（TTS、推播、QR、i18n 等）
```

## 可能遇到的問題

| 狀況 | 原因 / 解法 |
|---|---|
| 網頁顯示「尚未設定 TDX_CLIENT_ID / Secret」 | 確認 `.env` 檔案存在且金鑰填寫正確，並重新啟動 `node server.js` |
| 取得 Access Token 失敗 (401) | Client ID / Secret 複製錯誤，或 TDX 會員審核尚未通過 |
| 查詢看板沒有資料 | 該車站當下沒有即時班次（例如深夜時段），可換一個大站如台北(1000)、台中(3300)測試 |
| `Platform` 顯示為 `—` | 該班次尚未進站排點，TDX 尚未提供月台號碼是正常情況 |

## 延伸方向（對應 PPT 第8張）

- 多語言介面（i18n）
- 無障礙模式（輪椅族、視障旅客路線）
- 串接捷運/公車路網，做跨站轉乘導引
- 若未來 TDX 或台鐵開放車廂級定位資料，可取代現在的示意圖邏輯

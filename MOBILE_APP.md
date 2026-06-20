# 手機 App 建置說明（Android）

本專案使用 **Capacitor** 將現有網頁包成可安裝的 Android App，後端仍由 `node server.js` 提供 TDX API（Client Secret 不可放進 App）。

## 架構

```
Android App（WebView + 你的 public/ 前端）
        │  HTTP 連到區網 IP
        ▼
電腦上的 node server.js（需同一 Wi‑Fi）
        ▼
TDX API
```

## 方式 A：PWA（最快，免 Android Studio）

1. 手機 Chrome 開啟 `http://<電腦IP>:3000`
2. 選單 → **加入主畫面** / **安裝應用程式**

## 方式 B：Android APK（Capacitor）

### 前置需求

- [Node.js 18+](https://nodejs.org/)
- [Android Studio](https://developer.android.com/studio)（含 Android SDK）
- 電腦與手機 **同一 Wi‑Fi**

### 建置步驟

1. 在 `tdx-app` 資料夾雙擊 **`build-android.bat`**  
   （或手動：`npm install` → `npx cap add android` → `npx cap sync android` → `npx cap open android`）

2. 在 Android Studio：**Build → Build Bundle(s) / APK(s) → Build APK(s)**  
   APK 通常在：`android/app/build/outputs/apk/debug/app-debug.apk`

3. 將 APK 傳到手機安裝（需允許「未知來源」）

### 第一次使用 App

1. 在電腦執行 **`start.bat`**（保持視窗開啟）
2. 查電腦區網 IP（PowerShell：`ipconfig`，例如 `192.168.0.10`）
3. 打開 App → 展開 **「伺服器設定」** → 填入 `http://192.168.0.10:3000` → **測試連線** → **儲存**
4. 即可查詢車站班次

> Android 模擬器預設後端為 `http://10.0.2.2:3000`（對應電腦 localhost）

## 常見問題

| 狀況 | 解法 |
|------|------|
| App 無法連線 | 確認 server 有跑、IP 正確、手機與電腦同 Wi‑Fi、Windows 防火牆允許 3000 port |
| TDX 429 | API 呼叫太頻繁，等 1～2 分鐘再試 |
| 模擬器連不上 | 後端 URL 用 `http://10.0.2.2:3000` |

## 部署到雲端（進階）

若不想依賴家裡電腦當伺服器，可將 `server.js` 部署到有 HTTPS 的主機，App 內伺服器設定改填 `https://你的網域`。

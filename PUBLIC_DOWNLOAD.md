# 讓大家下載 App — 完整流程

## 一、產生 APK（只需做一次）

### 方法 A：本機建置（需 Android Studio）

1. 安裝 [Android Studio](https://developer.android.com/studio)（含 Android SDK、JDK）
2. 雙擊 **`setup-android-sdk.bat`**（首次，自動寫入 SDK 路徑）
3. 雙擊 **`build-apk.bat`**
4. 成功後會產生：`public/downloads/smart-boarding.apk`

### 方法 B：GitHub 雲端建置（免裝 Android Studio）

1. 將 `tdx-app` 資料夾推送到 GitHub
2. 到 repo → **Actions** → **Build Android APK** → **Run workflow**
3. 建置完成後，在該次 run 的 **Artifacts** 下載 `smart-boarding-apk`
4. 解壓後把 `smart-boarding.apk` 放到 `public/downloads/` 再部署

## 二、開放下載（同一 Wi‑Fi / 區網 Demo）

1. 雙擊 **`start.bat`**
2. 查電腦 IP：`ipconfig` → 例如 `192.168.0.10`
3. 分享給大家：

   **下載頁：** `http://192.168.0.10:3000/download.html`

4. 對方用手機開啟 → 點 **下載 Android APK** → 安裝
5. App 內 **伺服器設定** 填：`http://192.168.0.10:3000`

> 下載頁會顯示 QR Code，掃描即可下載

## 三、正式開放給所有人（建議）

僅靠家裡電腦，別人離開 Wi‑Fi 就無法使用。要「大家都能下載且能用」：

### 步驟 1：部署後端到雲端（HTTPS）

可選平台（擇一）：

- [Render](https://render.com)（免費方案）— **逐步教學見 [RENDER_DEPLOY.md](./RENDER_DEPLOY.md)**
- [Railway](https://railway.app)
- [Fly.io](https://fly.io)

上傳 `tdx-app` 資料夾，設定環境變數：

```
TDX_CLIENT_ID=你的ID
TDX_CLIENT_SECRET=你的Secret
PORT=3000
PUBLIC_SERVER_URL=https://你的網域
```

啟動指令：`node server.js`

### 步驟 2：把 APK 放到伺服器

- 在本機執行 `build-apk.bat`
- 將 `public/downloads/smart-boarding.apk` 一併部署（或上傳到同一台主機）

### 步驟 3：分享下載連結

```
https://你的網域/download.html
```

使用者下載 App 後，因已設定 `PUBLIC_SERVER_URL`，**不必再填伺服器 IP**。

## 四、上架 Google Play（進階）

需要：

- Google Play 開發者帳號（一次性費用）
- 簽署 Release APK / AAB（Android Studio → Generate Signed Bundle）
- 隱私權政策網址

鐵客松 Demo 通常用 **下載頁 + APK** 或 **PWA** 即可。

## 五、PWA（免 APK）

使用者用 Chrome 開你的網址 → **加入主畫面**，效果類似 App，免審核。

---

**快速檢查清單**

- [ ] `build-apk.bat` 成功
- [ ] `start.bat` 執行中
- [ ] 瀏覽器可開 `/download.html` 且能下載
- [ ] （正式）雲端 HTTPS + `PUBLIC_SERVER_URL` 已設定

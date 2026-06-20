# 部署到 Render 免費方案

本指南將 `tdx-app` 部署到 [Render](https://render.com) 免費 Web Service，取得 **HTTPS 網址** 供組員與手機用戶使用。

## 前置需求

- [Render 帳號](https://dashboard.render.com/register)（可用 GitHub 登入）
- [GitHub 帳號](https://github.com)
- TDX API 的 **Client ID** 與 **Client Secret**（見 [README.md](./README.md)）

## 步驟 1：推送到 GitHub

在 `tdx-app` 資料夾開啟終端機：

```powershell
cd tdx-app
git init
git add .
git commit -m "Prepare for Render deployment"
```

在 GitHub 建立新 repository（例如 `smart-friendly-boarding-system`），然後：

```powershell
git remote add origin https://github.com/你的帳號/smart-friendly-boarding-system.git
git branch -M main
git push -u origin main
```

> **注意**：`.env` 已在 `.gitignore`，金鑰不會被上傳。請只在 Render 後台設定環境變數。

## 步驟 2：在 Render 建立 Web Service

1. 登入 [Render Dashboard](https://dashboard.render.com)
2. 點 **New +** → **Web Service**
3. 連接你的 GitHub repo
4. 設定如下：

| 欄位 | 值 |
|------|-----|
| **Name** | `sfbs`（或自訂，會成為網址一部分） |
| **Region** | Singapore 或離你最近的區域 |
| **Branch** | `main` |
| **Root Directory** | 留空（若 repo 根目錄就是 `tdx-app` 內容） |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | **Free** |

若整個 repo 包含上層資料夾，將 **Root Directory** 設為 `tdx-app`。

## 步驟 3：設定環境變數

在 Render 服務頁 → **Environment** → **Add Environment Variable**：

| Key | Value |
|-----|-------|
| `TDX_CLIENT_ID` | 你的 TDX Client ID |
| `TDX_CLIENT_SECRET` | 你的 TDX Client Secret |
| `PUBLIC_SERVER_URL` | （選填）部署後填入，例如 `https://sfbs.onrender.com` |

> `PORT` 由 Render 自動設定，**不要**手動覆寫。  
> 若未設定 `PUBLIC_SERVER_URL`，伺服器會從請求標頭**自動推斷** HTTPS 網址（Render 已支援）。

## 步驟 4：部署

1. 點 **Create Web Service**（或 **Manual Deploy → Deploy latest commit**）
2. 等待 Build 與 Deploy 完成（約 2～5 分鐘）
3. 取得網址，例如：`https://sfbs.onrender.com`

## 步驟 5：驗證

在瀏覽器開啟：

- 首頁：`https://你的服務名.onrender.com`
- 健康檢查：`https://你的服務名.onrender.com/api/health`
- 下載頁：`https://你的服務名.onrender.com/download.html`

`/api/health` 應顯示 `tdxConfigured: true`（金鑰正確時）。

## 分享給組員

把 HTTPS 網址傳給組員即可：

```
https://你的服務名.onrender.com
```

- **網頁版**：直接開啟，可「加入主畫面」（PWA）
- **Android App**：下載 APK 後，App 會自動讀取 `/config.json` 連到後端（無需填 IP）

## 使用 Blueprint（可選）

repo 已含 `render.yaml`。也可在 Render：

**New +** → **Blueprint** → 選 repo → 依提示填入 `TDX_CLIENT_ID`、`TDX_CLIENT_SECRET`。

## 免費方案限制

| 項目 | 說明 |
|------|------|
| 休眠 | 15 分鐘無流量會 sleep，下次連線需等約 **30～60 秒** 冷啟動 |
| 流量 | 每月有免費額度，Demo / 組員測試通常足夠 |
| HTTPS | 自動提供，無需付費 |
| APK | 需在本機 `build-apk.bat` 建置後 commit `public/downloads/smart-boarding.apk`，或使用 GitHub Actions 建置 |

## 更新部署

修改程式後 push 到 GitHub，Render 會自動重新部署：

```powershell
git add .
git commit -m "Update feature"
git push
```

## 常見問題

| 狀況 | 解法 |
|------|------|
| Build 失敗 | 確認 Root Directory 指向含 `package.json` 的資料夾 |
| 502 / 啟動失敗 | 查看 Render **Logs**，確認 `TDX_CLIENT_ID`、`TDX_CLIENT_SECRET` 已設定 |
| 查詢無資料 | 確認 TDX 會員已審核通過；`/api/health` 檢查金鑰 |
| 第一次開很慢 | 免費方案冷啟動正常，等 1 分鐘再試 |
| App 連不上 | 確認手機有網路；網址為 `https://` 開頭 |

## 相關文件

- [PUBLIC_DOWNLOAD.md](./PUBLIC_DOWNLOAD.md) — APK 下載流程
- [MOBILE_APP.md](./MOBILE_APP.md) — 手機 App 說明

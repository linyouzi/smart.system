@echo off
cd /d "%~dp0"
echo ========================================
echo  智慧搭乘 - Android App 建置
echo ========================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo 請先安裝 Node.js：https://nodejs.org/
  pause
  exit /b 1
)

echo [1/4] 安裝 npm 套件...
call npm install
if errorlevel 1 pause & exit /b 1

echo [2/4] 初始化 Capacitor Android（首次執行）...
if not exist "android" (
  call npx cap add android
)

echo [3/4] 同步網頁到 Android 專案...
call npx cap sync android
if errorlevel 1 pause & exit /b 1

echo [4/4] 開啟 Android Studio...
echo.
echo 在 Android Studio 中：Build ^> Build Bundle(s) / APK(s) ^> Build APK(s)
echo 手機測試前請先在 App 內「伺服器設定」填入電腦區網 IP，例如 http://192.168.0.10:3000
echo 並在同一 Wi-Fi 執行 start.bat
echo.
call npx cap open android
pause

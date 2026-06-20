@echo off
cd /d "%~dp0"
echo ========================================
echo  建置 APK 並放到下載目錄
echo ========================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo 請先安裝 Node.js
  pause & exit /b 1
)

where java >nul 2>nul
if errorlevel 1 (
  echo 請安裝 JDK 17+（Android Studio 內建即可）
  pause & exit /b 1
)

if not exist "android\local.properties" (
  echo 設定 Android SDK 路徑...
  call setup-android-sdk.bat
)

call npm install
if errorlevel 1 pause & exit /b 1

if not exist "android" (
  call npx cap add android
)

call npx cap sync android
if errorlevel 1 pause & exit /b 1

echo.
echo 正在編譯 Debug APK（約 1～3 分鐘）...
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (
  cd ..
  echo 編譯失敗。若首次建置，可先執行 build-android.bat 用 Android Studio 同步 SDK。
  pause & exit /b 1
)
cd ..

if not exist "public\downloads" mkdir "public\downloads"

copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "public\downloads\smart-boarding.apk"

echo.
echo ========================================
echo  完成！
echo  APK: public\downloads\smart-boarding.apk
echo  下載頁: http://localhost:3000/download.html
echo  請執行 start.bat 後，分享下載頁網址給使用者
echo ========================================
pause

@echo off
cd /d "%~dp0"
set "SDK=%LOCALAPPDATA%\Android\Sdk"
if exist "%SDK%" goto found
echo 找不到 Android SDK。
echo 請先安裝 Android Studio，並在 SDK Manager 安裝 Android SDK。
echo 或設定 ANDROID_HOME 環境變數後再執行此腳本。
pause & exit /b 1
:found
set "PROP=android\local.properties"
echo sdk.dir=%SDK:\=\\%> "%PROP%"
echo 已寫入 %PROP%
echo sdk.dir=%SDK%
pause

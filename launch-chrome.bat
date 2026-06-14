@echo off
taskkill /f /im chrome.exe >nul 2>&1
timeout /t 1 /nobreak >nul
start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-debug"

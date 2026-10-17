@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
chcp 65001 >nul
title TELEGRAM CONTROL BOT - BOT CAPCUT AUTOMATION
cls

echo =========================================================================
echo              PUSAT KENDALI BOT CAPCUT VIA TELEGRAM
echo =========================================================================
echo.

:: 1. Cek Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js tidak ditemukan di komputer ini!
    echo         Silakan pasang Node.js terlebih dahulu dari: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Jalankan telebot.js
echo [INFO] Menghubungkan ke Bot Telegram...
node telebot.js
set "BOT_EXIT_CODE=%errorlevel%"

echo.
echo =========================================================================
echo     BOT TELEGRAM BERHENTI DENGAN KODE: %BOT_EXIT_CODE%
echo =========================================================================
echo.
pause

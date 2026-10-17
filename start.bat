@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
chcp 65001 >nul
title BOT CAPCUT TEAM 5 SEATS - t.me/Drosek
cls

echo =========================================================================
echo                       BOT CAPCUT TEAM 5 SEATS
echo                             t.me/Drosek
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

:: 2. Cek Folder node_modules
if not exist "node_modules" (
    echo [ERROR] Folder node_modules belum ditemukan!
    echo         Memulai proses instalasi otomatis sekarang...
    echo.
    call install.bat
    if not exist "node_modules" (
        echo [ERROR] Instalasi dependensi belum berhasil. Silakan periksa koneksi internet Anda.
        echo.
        pause
        exit /b 1
    )
)

:: 3. Cek File .env
if not exist ".env" (
    echo [INFO] File .env belum ada. Membuat .env default dengan 5 kursi dan browser chrome...
    echo password_google=masuk123> .env
    echo planmode=teams>> .env
    echo seats/kursi=5>> .env
    echo browser=chrome>> .env
)

:: 4. Cek File gsuite
if not exist "gsuite" (
    type nul > gsuite
    echo [INFO] File gsuite baru saja dibuat dan masih kosong.
    echo        Silakan masukkan daftar email pada file gsuite terlebih dahulu!
    echo.
    pause
    exit /b 1
)

:: 5. Jalankan Bot
echo [INFO] Menjalankan Bot CapCut Moraxstore...
echo.

node index.js
set "BOT_EXIT_CODE=%errorlevel%"

echo.
echo =========================================================================
if %BOT_EXIT_CODE% equ 0 (
    echo     PROSES EKSEKUSI BOT SELESAI DENGAN SUKSES.
) else (
    echo     PROSES EKSEKUSI BOT SELESAI ATAU BERHENTI DENGAN KODE: %BOT_EXIT_CODE%
)
echo =========================================================================
echo.
pause

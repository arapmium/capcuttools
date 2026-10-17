@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
chcp 65001 >nul
title Install Dependencies - BOT CAPCUT TEAM 5 SEATS
cls

echo =========================================================================
echo              INSTALASI DAN PREPARASI BOT CAPCUT TEAM 5 SEATS
echo                                t.me/Drosek
echo =========================================================================
echo.

:: 1. Cek Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js tidak ditemukan di komputer ini!
    echo         Silakan unduh dan pasang Node.js dari: https://nodejs.org/
    echo.
    echo Tekan tombol apa saja untuk keluar...
    pause >nul
    exit /b 1
)

echo [1/5] Node.js terdeteksi:
node -v
echo.

:: 2. Install NPM Packages
echo [2/5] Menginstal paket modul Node.js...
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo [WARNING] NPM install mencoba ulang secara normal...
    call npm install
)
if %errorlevel% neq 0 (
    echo [ERROR] Gagal menginstal dependensi npm. Periksa koneksi internet Anda.
    echo.
    pause
    exit /b 1
)
echo [OK] Paket modul Node.js siap.
echo.

:: 3. Install Playwright Browsers (Chromium dan Firefox engine)
echo [3/5] Menginstal browser engine untuk Playwright...
call npx playwright install chromium firefox
if %errorlevel% neq 0 (
    echo [WARNING] Mencoba install chromium saja...
    call npx playwright install chromium
)
echo [OK] Playwright browser engine siap.
echo.

:: 4. Cek dan buat file konfigurasi bawaan jika belum ada
echo [4/5] Memeriksa file konfigurasi dan berkas pendukung...

if not exist ".env" (
    echo [INFO] Membuat file .env default dengan 5 kursi dan browser chrome...
    echo password_google=masuk123> .env
    echo planmode=teams>> .env
    echo seats/kursi=5>> .env
    echo browser=chrome>> .env
    echo [OK] File .env berhasil dibuat.
) else (
    echo [OK] File .env sudah ada.
)

if not exist "gsuite" (
    echo [INFO] Membuat file gsuite kosong...
    type nul > gsuite
    echo [OK] File gsuite berhasil dibuat.
) else (
    echo [OK] File gsuite sudah ada.
)

if not exist "akun_sudah_login" (
    type nul > akun_sudah_login
    echo [OK] File akun_sudah_login siap.
)

if not exist "result.txt" (
    echo email:password:link_cashier > result.txt
    echo [OK] File result.txt siap.
)
echo.

:: 5. Deteksi Browser yang Tersedia di Komputer
echo [5/5] Memeriksa ketersediaan browser dan konfigurasi bot...
echo.
node index.js --check

echo.
echo =========================================================================
echo       INSTALASI SUKSES DAN SEMUA KOMPONEN SIAP DIGUNAKAN!
echo   Silakan atur browser di .env sesuai keinginan Anda:
echo   - chrome
echo   - opera
echo   - brave
echo   - firefox
echo   - edge
echo   - auto
echo.
echo   Lalu klik 2x pada file [start.bat] untuk menjalankan bot.
echo =========================================================================
echo.
pause

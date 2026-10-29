@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
chcp 65001 >nul
title BOT CAPCUT AUTOMATION - LAPTOP RUNNER
cls

:: Mode Non-Headless (Layar browser Chrome/Edge terbuka di laptop)
set HEADLESS=false

:: 1. Cek Node.js
where node >nul 2>nul
if %errorlevel% neq 0 goto ERROR_NODE

:: 2. Cek Folder node_modules
if not exist "node_modules" goto INSTALL_MODULES
goto CHECK_FILES

:ERROR_NODE
echo =========================================================================
echo [ERROR] Node.js tidak ditemukan di komputer ini!
echo         Silakan unduh dan pasang Node.js dari: https://nodejs.org/
echo =========================================================================
echo.
pause
exit /b 1

:INSTALL_MODULES
echo [INFO] Folder node_modules belum ditemukan!
echo        Memasang modul yang diperlukan...
echo.
call npm install
if not exist "node_modules" (
    echo [ERROR] Instalasi modul gagal. Periksa koneksi internet Anda.
    pause
    exit /b 1
)

:CHECK_FILES
:: Cek file gsuite
if not exist "gsuite" type nul > gsuite

:: Cek file .env
if not exist ".env" (
    echo password_google=masuk123> .env
    echo planmode=teams>> .env
    echo seats/kursi=5>> .env
    echo browser=chrome>> .env
    echo proxy_mode=http>> .env
    echo proxy=>> .env
)

:: Jika ada argumen CLI langsung (contoh: capcut.bat %*)
if not "%~1"=="" (
    echo [INFO] Menjalankan: node index.js %*
    echo.
    node index.js %*
    echo.
    pause
    exit /b 0
)

:MENU
cls
echo =========================================================================
echo                       BOT CAPCUT AUTOMATION
echo                (Mode Laptop: Layar Browser Tampil / Non-Headless)
echo =========================================================================
echo.
echo  File Antrean : gsuite
echo  Akun Sukses  : result.txt
echo  Akun Gagal   : akun_gagal.txt
echo  Akun Terkait : akun_terkait.txt
echo.
echo -------------------------------------------------------------------------
echo  PILIH MODE EKSEKUSI CAPCUT:
echo -------------------------------------------------------------------------
echo  [1] Mode TEAM - CapCut Team Seats (Default 5 Kursi)
echo  [2] Mode PRO - CapCut Pro Diskon Rp14.500 (Bulan Pertama)
echo  [3] Mode DAFTAR Akun Baru (@arapmium.web.id)
echo  [4] Mode DAFTAR + JOIN Tim CapCut
echo  [5] Mode LOGIN + JOIN Tim CapCut
echo  [6] Mode RESET Password Akun CapCut
echo  [7] Jalankan Bot Telegram Pusat Kendali (telebot.js)
echo  [8] Edit File Antrean Akun (Buka 'gsuite' di Notepad)
echo  [9] Edit Pengaturan / Proxy (Buka '.env' di Notepad)
echo  [0] Keluar
echo -------------------------------------------------------------------------
echo.

set "CHOICE="
set /p "CHOICE=Pilih nomor menu [1-9 / 0] lalu tekan Enter: "
if defined CHOICE set "CHOICE=!CHOICE: =!"

if "%CHOICE%"=="1" goto SET_TEAM
if "%CHOICE%"=="2" goto SET_PRO
if "%CHOICE%"=="3" goto SET_DAFTAR
if "%CHOICE%"=="4" goto SET_DAFTAR_JOIN
if "%CHOICE%"=="5" goto SET_LOGIN_JOIN
if "%CHOICE%"=="6" goto SET_RESET
if "%CHOICE%"=="7" goto RUN_TELEBOT
if "%CHOICE%"=="8" goto EDIT_GSUITE
if "%CHOICE%"=="9" goto EDIT_ENV
if "%CHOICE%"=="0" exit /b 0

goto MENU

:SET_TEAM
set "planmode=teams"
set "MODE_LABEL=MODE TEAM (CapCut Team 5 Seats)"
goto TAHAP_JUMLAH_AKUN

:SET_PRO
set "planmode=pro"
set "MODE_LABEL=MODE PRO (CapCut Pro Rp14.500)"
goto TAHAP_JUMLAH_AKUN

:SET_DAFTAR
set "planmode=daftar"
set "MODE_LABEL=MODE DAFTAR AKUN BARU"
goto TAHAP_JUMLAH_AKUN

:SET_DAFTAR_JOIN
set "planmode=daftar_join"
set "MODE_LABEL=MODE DAFTAR + JOIN TIM"
goto TAHAP_JUMLAH_AKUN

:SET_LOGIN_JOIN
set "planmode=login_join"
set "MODE_LABEL=MODE LOGIN + JOIN TIM"
goto TAHAP_JUMLAH_AKUN

:SET_RESET
set "planmode=reset_password"
set "MODE_LABEL=MODE RESET PASSWORD"
goto TAHAP_JUMLAH_AKUN

:TAHAP_JUMLAH_AKUN
cls
echo =========================================================================
echo  KONFIGURASI: %MODE_LABEL%
echo =========================================================================
echo.
set "JUMLAH_INPUT="
set /p "JUMLAH_INPUT=Proses berapa akun? [Kosongkan atau ketik 0 = Semua Akun]: "
if defined JUMLAH_INPUT set "JUMLAH_INPUT=!JUMLAH_INPUT: =!"
if "%JUMLAH_INPUT%"=="" set "JUMLAH_INPUT=0"
set "max_process=%JUMLAH_INPUT%"
set "MAX_PROCESS=%JUMLAH_INPUT%"
echo.
echo [OK] Jumlah target: %JUMLAH_INPUT% akun
echo.
goto TAHAP_PROXY

:TAHAP_PROXY
set "CONFIRM_PROXY="
set /p "CONFIRM_PROXY=Use Proxy? (y/n) [Tekan Enter = n / Tanpa Proxy]: "
if defined CONFIRM_PROXY set "CONFIRM_PROXY=!CONFIRM_PROXY: =!"

if /i "%CONFIRM_PROXY%"=="y" goto PROXY_YA
goto PROXY_TIDAK

:PROXY_YA
set "USE_PROXY=true"
echo.
echo [INFO] Mode Proxy AKTIF.
echo Alamat proxy di .env saat ini:
findstr /i "^proxy=" .env
echo.
set "INPUT_CUSTOM_PROXY="
set /p "INPUT_CUSTOM_PROXY=Ganti proxy untuk sesi ini? [Kosongkan jika pakai yang di .env]: "
if not "!INPUT_CUSTOM_PROXY!"=="" (
    set "proxy=!INPUT_CUSTOM_PROXY!"
    echo [INFO] Proxy sesi diset ke: !proxy!
)
goto RUN_BOT

:PROXY_TIDAK
set "USE_PROXY=false"
set "proxy=direct"
echo.
echo [INFO] Mode DIRECT (Tanpa Proxy) aktif.
goto RUN_BOT

:RUN_BOT
echo.
echo =========================================================================
echo  MENJALANKAN BOT CAPCUT...
echo  Mode     : %MODE_LABEL%
echo  Target   : %JUMLAH_INPUT% akun
echo  Proxy    : %USE_PROXY%
echo  Browser  : Tampil di Layar (Non-Headless)
echo =========================================================================
echo.

node index.js
set "EXIT_CODE=%errorlevel%"

echo.
echo =========================================================================
if "%EXIT_CODE%"=="0" goto SUCCESS_MSG
echo  PROSES BOT CAPCUT SELESAI ATAU BERHENTI DENGAN KODE: %EXIT_CODE%
goto END_MSG
:SUCCESS_MSG
echo  PROSES BOT CAPCUT SELESAI DENGAN SUKSES.
:END_MSG
echo =========================================================================
echo.
pause
goto MENU

:RUN_TELEBOT
cls
echo =========================================================================
echo              MENJALANKAN PUSAT KENDALI TELEGRAM BOT
echo =========================================================================
echo.
echo [INFO] Menghubungkan ke Bot Telegram...
echo.
node telebot.js
echo.
pause
goto MENU

:EDIT_GSUITE
echo [INFO] Membuka file 'gsuite' di Notepad...
start notepad.exe gsuite
goto MENU

:EDIT_ENV
echo [INFO] Membuka file '.env' di Notepad...
start notepad.exe .env
goto MENU

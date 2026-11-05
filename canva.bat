@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
chcp 65001 >nul
title BOT CANVA AUTOMATION - LAPTOP RUNNER
cls

:: Mode Non-Headless (Layar browser Chrome/Edge terbuka di laptop)
set HEADLESS=false

:: 1. Cek Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo =========================================================================
    echo [ERROR] Node.js tidak ditemukan di komputer ini!
    echo         Silakan unduh dan pasang Node.js dari: https://nodejs.org/
    echo =========================================================================
    echo.
    pause
    exit /b 1
)

:: 2. Cek Folder node_modules
if not exist "node_modules" (
    echo [INFO] Folder node_modules belum ditemukan!
    echo        Memasang modul yang diperlukan...
    echo.
    call npm install
    if not exist "node_modules" (
        echo [ERROR] Instalasi modul gagal. Periksa koneksi internet Anda.
        pause
        exit /b 1
    )
)

:: 3. Cek File akun_canva.txt
if not exist "akun_canva.txt" (
    type nul > akun_canva.txt
)

:: Jika ada argumen CLI langsung (contoh: canva.bat signup 5)
if not "%~1"=="" (
    echo [INFO] Menjalankan: node canva.js %*
    echo [INFO] Browser akan terbuka di layar laptop...
    echo.
    node canva.js %*
    echo.
    pause
    exit /b 0
)

:MENU
cls
echo =========================================================================
echo                       BOT CANVA AUTOMATION
echo                (Mode Laptop: Layar Browser Tampil / Non-Headless)
echo =========================================================================
echo.
echo  File Antrean  : akun_canva.txt
echo  Hasil Sukses  : akun_canva_terdaftar.txt
echo  Hasil Gagal   : akun_canva_gagal.txt
echo  Screenshot    : folder screenshots\
echo.
echo -------------------------------------------------------------------------
echo  PILIH MENU:
echo -------------------------------------------------------------------------
echo  [1] Daftar Akun Canva Baru (Sign Up via OTP Outlook)
echo  [2] Reset Password Akun Canva (Lupa Kata Sandi)
echo  [3] Edit / Isi Akun Canva (Buka akun_canva.txt di Notepad)
echo  [4] Lihat Hasil Sukses (Buka akun_canva_terdaftar.txt)
echo  [5] Lihat Hasil Gagal (Buka akun_canva_gagal.txt)
echo  [6] Buka Folder Screenshot Bukti
echo  [0] Keluar
echo -------------------------------------------------------------------------
echo.

set "CHOICE="
set /p "CHOICE=Pilih menu [1/2/3/4/5/6/0] lalu tekan Enter: "

if "%CHOICE%"=="1" goto DAFTAR
if "%CHOICE%"=="2" goto RESET
if "%CHOICE%"=="3" goto EDIT_AKUN
if "%CHOICE%"=="4" goto HASIL_SUKSES
if "%CHOICE%"=="5" goto HASIL_GAGAL
if "%CHOICE%"=="6" goto BUKA_SCREENSHOT
if "%CHOICE%"=="0" exit /b 0

goto MENU

:DAFTAR
cls
echo =========================================================================
echo              MENU 1: DAFTAR AKUN CANVA BARU (SIGN UP)
echo =========================================================================
echo.
echo Format akun di akun_canva.txt:
echo email^|password^|refresh_token^|client_id  ATAU  email^|password
echo.
set "JUMLAH="
set /p "JUMLAH=Berapa akun yang ingin diproses? [Kosongkan/0 = Semua]: "
if "%JUMLAH%"=="" set JUMLAH=0
echo.
echo [INFO] Menjalankan Canva Signup (Browser akan muncul di layar)...
echo.
node canva.js signup %JUMLAH%
echo.
echo =========================================================================
echo  PROSES SELESAI.
echo =========================================================================
echo.
pause
goto MENU

:RESET
cls
echo =========================================================================
echo              MENU 2: RESET PASSWORD AKUN CANVA
echo =========================================================================
echo.
echo Format akun di akun_canva.txt:
echo email^|password^|refresh_token^|client_id
echo.
set "JUMLAH="
set /p "JUMLAH=Berapa akun yang ingin di-reset? [Kosongkan/0 = Semua]: "
if "%JUMLAH%"=="" set JUMLAH=0
echo.
echo [INFO] Menjalankan Canva Reset (Browser akan muncul di layar)...
echo.
node canva.js reset %JUMLAH%
echo.
echo =========================================================================
echo  PROSES SELESAI.
echo =========================================================================
echo.
pause
goto MENU

:EDIT_AKUN
echo [INFO] Membuka akun_canva.txt di Notepad...
start notepad.exe akun_canva.txt
goto MENU

:HASIL_SUKSES
if not exist "akun_canva_terdaftar.txt" type nul > akun_canva_terdaftar.txt
echo [INFO] Membuka akun_canva_terdaftar.txt di Notepad...
start notepad.exe akun_canva_terdaftar.txt
goto MENU

:HASIL_GAGAL
if not exist "akun_canva_gagal.txt" type nul > akun_canva_gagal.txt
echo [INFO] Membuka akun_canva_gagal.txt di Notepad...
start notepad.exe akun_canva_gagal.txt
goto MENU

:BUKA_SCREENSHOT
if not exist "screenshots" mkdir screenshots
echo [INFO] Membuka folder screenshots di Windows Explorer...
start explorer.exe screenshots
goto MENU

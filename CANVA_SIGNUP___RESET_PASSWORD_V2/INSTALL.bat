@echo off
setlocal enabledelayedexpansion
title CANVA SIGNUP + RESET PASSWORD - INSTALLER
color 0B
cd /d "%~dp0"

cls
echo ================================================================================
echo        CANVA SIGNUP + RESET PASSWORD TOOL - ENVIRONMENT INSTALLER
echo ================================================================================
echo.

REM ─────────────────────────────────────────────────────────────────────────────
REM [1] Deteksi Python Interpreter
REM ─────────────────────────────────────────────────────────────────────────────
echo [*] Memeriksa Python Interpreter...
set "PY_CMD="

python --version >nul 2>&1
if !errorlevel! equ 0 (
    set "PY_CMD=python"
    goto :PY_FOUND
)

py -3 --version >nul 2>&1
if !errorlevel! equ 0 (
    set "PY_CMD=py -3"
    goto :PY_FOUND
)

python3 --version >nul 2>&1
if !errorlevel! equ 0 (
    set "PY_CMD=python3"
    goto :PY_FOUND
)

echo.
echo [X] ERROR: Python tidak ditemukan di sistem Anda!
echo.
echo     Panduan Solusi:
echo       1. Download Python 3.10+ di: https://www.python.org/downloads/
echo       2. PENTING saat install: centang "Add Python to PATH"
echo       3. Setelah install selesai, jalankan kembali INSTALL.bat ini
echo.
goto :FAILED

:PY_FOUND
for /f "tokens=*" %%v in ('!PY_CMD! --version 2^>&1') do set "PY_VER=%%v"
echo [OK] Ditemukan: !PY_VER!  (perintah: !PY_CMD!)
echo.

REM ─────────────────────────────────────────────────────────────────────────────
REM [2] Cek versi Python minimal (3.8+)
REM ─────────────────────────────────────────────────────────────────────────────
echo [*] Memeriksa versi Python (minimal 3.8)...
!PY_CMD! -c "import sys; exit(0 if sys.version_info >= (3,8) else 1)" >nul 2>&1
if !errorlevel! neq 0 (
    echo [X] ERROR: Python versi terlalu lama!
    echo     Dibutuhkan Python 3.8 atau lebih baru.
    echo     Download: https://www.python.org/downloads/
    goto :FAILED
)
echo [OK] Versi Python OK.
echo.

REM ─────────────────────────────────────────────────────────────────────────────
REM [3] Upgrade pip ke versi terbaru
REM ─────────────────────────────────────────────────────────────────────────────
echo [*] Upgrade pip ke versi terbaru...
!PY_CMD! -m pip install --upgrade pip
if !errorlevel! neq 0 (
    echo [!] Peringatan: Gagal upgrade pip — melanjutkan dengan versi saat ini...
)
echo.

REM ─────────────────────────────────────────────────────────────────────────────
REM [4] Upgrade setuptools & wheel (WAJIB sebelum undetected-chromedriver)
REM ─────────────────────────────────────────────────────────────────────────────
echo [*] Upgrade setuptools dan wheel (build tools)...
!PY_CMD! -m pip install --upgrade setuptools wheel
if !errorlevel! neq 0 (
    echo [!] Peringatan: Gagal upgrade setuptools/wheel — melanjutkan...
)
echo.

REM ─────────────────────────────────────────────────────────────────────────────
REM [5] Install semua dependencies dari requirements.txt
REM ─────────────────────────────────────────────────────────────────────────────
echo [*] Menginstall semua dependencies dari requirements.txt...
echo     (undetected-chromedriver, selenium, requests, colorama, python-dotenv)
echo.
!PY_CMD! -m pip install -r requirements.txt
if !errorlevel! neq 0 (
    echo.
    echo [X] ERROR: Gagal install satu atau lebih dependencies!
    echo.
    echo     Coba solusi berikut:
    echo       1. Pastikan koneksi internet aktif
    echo       2. Jalankan manual: !PY_CMD! -m pip install -r requirements.txt
    echo       3. Coba: !PY_CMD! -m pip install --upgrade --force-reinstall -r requirements.txt
    echo.
    goto :FAILED
)
echo.
echo [OK] Semua library Python berhasil diinstall.
echo.

REM ─────────────────────────────────────────────────────────────────────────────
REM [6] Verifikasi modul-modul penting bisa di-import
REM ─────────────────────────────────────────────────────────────────────────────
echo [*] Verifikasi import modul...
!PY_CMD! -c "import undetected_chromedriver; print('  [OK] undetected_chromedriver')"
if !errorlevel! neq 0 (
    echo [X] GAGAL: undetected_chromedriver tidak bisa diimport!
    goto :VERIFY_FAIL
)

!PY_CMD! -c "import selenium; print('  [OK] selenium', selenium.__version__)"
if !errorlevel! neq 0 (
    echo [X] GAGAL: selenium tidak bisa diimport!
    goto :VERIFY_FAIL
)

!PY_CMD! -c "import requests; print('  [OK] requests', requests.__version__)"
if !errorlevel! neq 0 (
    echo [X] GAGAL: requests tidak bisa diimport!
    goto :VERIFY_FAIL
)

!PY_CMD! -c "import colorama; print('  [OK] colorama')"
if !errorlevel! neq 0 (
    echo [X] GAGAL: colorama tidak bisa diimport!
    goto :VERIFY_FAIL
)

!PY_CMD! -c "import dotenv; print('  [OK] python-dotenv')"
if !errorlevel! neq 0 (
    echo [X] GAGAL: python-dotenv tidak bisa diimport!
    goto :VERIFY_FAIL
)

goto :VERIFY_OK

:VERIFY_FAIL
echo.
echo [X] Ada modul yang gagal terinstall. Coba jalankan ulang INSTALL.bat.
goto :FAILED

:VERIFY_OK
echo [OK] Semua modul terverifikasi.
echo.

REM ─────────────────────────────────────────────────────────────────────────────
REM [7] Buat folder runtime yang dibutuhkan
REM ─────────────────────────────────────────────────────────────────────────────
echo [*] Membuat folder runtime...
if not exist "logs" (
    mkdir "logs"
    echo   [OK] Folder logs/ dibuat.
) else (
    echo   [OK] Folder logs/ sudah ada.
)
if not exist "chrome_profiles" (
    mkdir "chrome_profiles"
    echo   [OK] Folder chrome_profiles/ dibuat.
) else (
    echo   [OK] Folder chrome_profiles/ sudah ada.
)
if not exist "result" (
    mkdir "result"
    echo   [OK] Folder result/ dibuat.
) else (
    echo   [OK] Folder result/ sudah ada.
)
echo.

REM ─────────────────────────────────────────────────────────────────────────────
REM [8] Cek & inisialisasi file data
REM ─────────────────────────────────────────────────────────────────────────────
echo [*] Memeriksa file konfigurasi dan data...
if not exist "emails.txt" (
    echo # Format: email@outlook.com^|passwordoutlook^|refresh_token^|client_id> "emails.txt"
    echo   [OK] File emails.txt baru dibuat.
) else (
    echo   [OK] File emails.txt sudah ada.
)

if not exist ".env" (
    echo # CANVA_PASSWORD=Bisnis2024!> ".env"
    echo # outlook_api_url=https://outlookreader.my.id/api/v1/otp>> ".env"
    echo # outlook_api_key=ISI_API_KEY_DISINI>> ".env"
    echo   [OK] File .env template dibuat ^(isi sesuai kebutuhan^).
) else (
    echo   [OK] File .env sudah ada.
)
echo.

REM ─────────────────────────────────────────────────────────────────────────────
REM [9] Ringkasan Status
REM ─────────────────────────────────────────────────────────────────────────────
echo ================================================================================
echo                        RINGKASAN STATUS INSTALASI
echo ================================================================================
echo   [OK] Python Interpreter    : !PY_VER!
echo   [OK] pip                   : Up-to-date
echo   [OK] setuptools + wheel    : Up-to-date
echo   [OK] undetected-chromedriver
echo   [OK] selenium
echo   [OK] requests
echo   [OK] colorama
echo   [OK] python-dotenv
echo   [OK] Folder Runtime        : logs/ chrome_profiles/ result/
echo   [OK] File Data             : emails.txt .env
echo ================================================================================
echo.
echo [SUKSES] Instalasi selesai! Langkah selanjutnya:
echo.
echo   1. Isi emails.txt dengan format:
echo         email@outlook.com^|passwordoutlook^|refresh_token^|client_id
echo.
echo   2. Edit .env:
echo         CANVA_PASSWORD=PasswordYangMauDiSet
echo         outlook_api_key=API_KEY_DARI_OUTLOOKREADER
echo.
echo   3. Jalankan START.bat atau: python main.py
echo.
pause
exit /b 0

:FAILED
echo.
echo ================================================================================
echo   [!] INSTALASI GAGAL ATAU BELUM SELESAI
echo   Tekan tombol apa saja untuk menutup...
echo ================================================================================
pause >nul
exit /b 1

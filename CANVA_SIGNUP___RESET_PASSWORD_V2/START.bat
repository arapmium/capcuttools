@echo off
cd /d "%~dp0"
title CANVA SIGNUP + RESET PASSWORD

set "PY_CMD="
python --version >nul 2>&1
if %errorlevel% equ 0 (set "PY_CMD=python" & goto :RUN)
py -3 --version >nul 2>&1
if %errorlevel% equ 0 (set "PY_CMD=py -3" & goto :RUN)

echo [X] Python tidak ditemukan! Jalankan INSTALL.bat dulu.
pause
exit /b 1

:RUN
%PY_CMD% main.py
pause

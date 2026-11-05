@echo off
setlocal
cd /d "%~dp0"
py flash_board.py
if errorlevel 1 exit /b 1
echo Installation complete. Tap RESET and follow MANUAL-SETUP.md.
pause

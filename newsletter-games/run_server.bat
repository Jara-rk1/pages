@echo off
REM =============================================================================
REM KPMG Newsletter Minigames — Persistent Server Launcher
REM
REM Runs the minigames server in the background. Survives AVD disconnects.
REM Double-click to start. Server runs on port 8080.
REM
REM To stop:  taskkill /F /FI "WINDOWTITLE eq KPMG Minigames Server"
REM =============================================================================

title KPMG Minigames Server

cd /d "%~dp0"

REM Initialise database if missing
if not exist "games.db" (
    echo [MINIGAMES] Initialising database...
    python init_db.py
)

echo.
echo  ========================================
echo  KPMG Newsletter Minigames Server
echo  ========================================
echo.
echo  Starting on http://0.0.0.0:8080
echo  Share your AVD hostname to give access.
echo.
echo  To find your hostname, run: hostname
echo  Your URL will be: http://YOUR-HOSTNAME:8080
echo.
echo  Press Ctrl+C to stop.
echo  ========================================
echo.

:loop
echo [%date% %time%] Starting server...
python server.py 8080
echo [%date% %time%] Server stopped. Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop

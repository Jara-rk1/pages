@echo off
REM =============================================================================
REM KPMG Newsletter Minigames — Install as Scheduled Task (auto-start on login)
REM
REM Run this ONCE to register the server as a scheduled task.
REM It will auto-start whenever you log into the AVD.
REM =============================================================================

cd /d "%~dp0"

echo.
echo  Installing KPMG Minigames as a scheduled task...
echo.

REM Initialise database if missing
if not exist "games.db" (
    echo  Initialising database...
    python init_db.py
)

REM Create the scheduled task — triggers on user logon, runs hidden
schtasks /create ^
    /tn "KPMG Minigames Server" ^
    /tr "pythonw \"%~dp0server.py\" 8080" ^
    /sc onlogon ^
    /rl limited ^
    /f

if %errorlevel%==0 (
    echo.
    echo  Scheduled task created successfully!
    echo.
    echo  The server will auto-start when you log in.
    echo  Starting it now...
    echo.
    schtasks /run /tn "KPMG Minigames Server"
    echo.
    echo  ========================================
    echo  Server starting on port 8080
    echo.
    echo  Local:    http://127.0.0.1:8080
    echo  Network:  http://AU-5CD5150YX9:8080
    echo  IP:       http://10.214.102.138:8080
    echo  ========================================
    echo.
    echo  To stop:     schtasks /end /tn "KPMG Minigames Server"
    echo  To remove:   schtasks /delete /tn "KPMG Minigames Server" /f
    echo.
) else (
    echo.
    echo  ERROR: Could not create scheduled task.
    echo  Try running this script as Administrator,
    echo  or just use run_server.bat instead.
    echo.
)

pause

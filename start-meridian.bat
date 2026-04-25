@echo off
REM MeridianITSM — Start all services via PM2
REM Place a shortcut to this file in shell:startup for auto-start on boot

cd /d "C:\Users\greiner\OneDrive\ClaudeAI\MeridianITSM-Application"

REM Resurrect saved pm2 processes
pm2 resurrect

REM If resurrect found nothing, start from ecosystem config
pm2 list | findstr "online" >nul 2>&1
if errorlevel 1 (
    pm2 start ecosystem.config.cjs
    pm2 save
)

echo MeridianITSM services started.

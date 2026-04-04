# MeridianITSM Inventory Agent — Windows Uninstaller
# Run as Administrator

$ServiceName = "MeridianAgent"
$InstallDir = "C:\Program Files\MeridianAgent"

$ErrorActionPreference = "Stop"

Write-Host "MeridianITSM Agent Uninstaller" -ForegroundColor Cyan

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "ERROR: Run as Administrator." -ForegroundColor Red; exit 1 }

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Write-Host "Stopping service..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName 2>$null
    Write-Host "Service removed." -ForegroundColor Green
}

if (Test-Path $InstallDir) {
    Write-Host "Removing files..."
    Remove-Item -Path $InstallDir -Recurse -Force
    Write-Host "Files removed." -ForegroundColor Green
}

Write-Host ""
Write-Host "Agent uninstalled. Config preserved at %ProgramData%\Meridian\" -ForegroundColor Yellow
Write-Host "Delete manually if no longer needed: Remove-Item -Recurse $env:ProgramData\Meridian" -ForegroundColor Gray

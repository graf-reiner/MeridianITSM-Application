# MeridianITSM Inventory Agent — Windows Installer
# Run as Administrator: powershell -ExecutionPolicy Bypass -File install.ps1
#
# Parameters:
#   -ServerUrl   https://your-meridian.com  (required)
#   -Token       enrollment-token           (required)
#   -PrivacyTier full|restricted|anonymized (default: full)

param(
    [Parameter(Mandatory=$true)]
    [string]$ServerUrl,

    [Parameter(Mandatory=$true)]
    [string]$Token,

    [string]$PrivacyTier = "full",

    [string]$InstallDir = "C:\Program Files\MeridianAgent"
)

$ErrorActionPreference = "Stop"
$ServiceName = "MeridianAgent"
$ConfigDir = "$env:ProgramData\Meridian"

Write-Host "MeridianITSM Inventory Agent Installer" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator." -ForegroundColor Red
    exit 1
}

# Stop existing service if running
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Write-Host "Stopping existing service..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName 2>$null
    Start-Sleep -Seconds 2
}

# Create directories
Write-Host "Creating directories..."
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
New-Item -ItemType Directory -Force -Path "$ConfigDir\logs" | Out-Null

# Copy files
Write-Host "Copying agent files to $InstallDir..."
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PublishDir = Join-Path $SourceDir "..\..\publish\win-x64"
if (-not (Test-Path "$PublishDir\InvAgent.exe")) {
    Write-Host "ERROR: InvAgent.exe not found in $PublishDir" -ForegroundColor Red
    Write-Host "Build first: dotnet publish -c Release -r win-x64 --self-contained" -ForegroundColor Yellow
    exit 1
}
Copy-Item -Path "$PublishDir\*" -Destination $InstallDir -Recurse -Force

# Write config
Write-Host "Writing configuration..."
$config = @{
    AgentConfig = @{
        ServerUrl = $ServerUrl
        EnrollmentToken = $Token
        PrivacyTier = $PrivacyTier
        HeartbeatIntervalSeconds = 300
        InventoryIntervalSeconds = 14400
        LocalWebUiPort = 8787
        LocalQueueMaxSizeMb = 100
        LogLevel = "Information"
    }
} | ConvertTo-Json -Depth 3

Set-Content -Path "$ConfigDir\config.json" -Value $config -Encoding UTF8

# Install Windows Service
Write-Host "Installing Windows Service..."
New-Service -Name $ServiceName `
    -BinaryPathName "$InstallDir\InvAgent.exe" `
    -DisplayName "Meridian ITSM Inventory Agent" `
    -Description "Collects hardware and software inventory for MeridianITSM" `
    -StartupType Automatic | Out-Null

# Start service
Write-Host "Starting service..."
Start-Service -Name $ServiceName

# Verify
Start-Sleep -Seconds 3
$svc = Get-Service -Name $ServiceName
if ($svc.Status -eq "Running") {
    Write-Host ""
    Write-Host "SUCCESS: Agent installed and running!" -ForegroundColor Green
    Write-Host "  Service: $ServiceName ($($svc.Status))" -ForegroundColor Green
    Write-Host "  Config:  $ConfigDir\config.json" -ForegroundColor Gray
    Write-Host "  Logs:    $ConfigDir\logs\agent.log" -ForegroundColor Gray
    Write-Host "  Web UI:  http://127.0.0.1:8787" -ForegroundColor Gray
} else {
    Write-Host "WARNING: Service installed but not running. Check Event Viewer." -ForegroundColor Yellow
}

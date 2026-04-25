#Requires -Version 5.1
# Invoked by the MSI WriteConfigCA custom action to produce C:\ProgramData\Meridian\config.json.
# Using PowerShell (not cmd /c echo) so we don't fight MSI Formatted-type brace stripping
# or cmd.exe escape quirks — we receive values as named args with zero {} in the MSI ExeCommand.

param(
    [Parameter(Mandatory=$true)] [string]$ServerUrl,
    [Parameter(Mandatory=$true)] [string]$EnrollmentToken,
    [Parameter(Mandatory=$true)] [string]$PrivacyTier,
    [Parameter(Mandatory=$true)] [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

$dir = Split-Path -Parent $OutputPath
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$config = @{
    AgentConfig = @{
        ServerUrl                = $ServerUrl
        EnrollmentToken          = $EnrollmentToken
        PrivacyTier              = $PrivacyTier
        HeartbeatIntervalSeconds = 300
        InventoryIntervalSeconds = 14400
        LocalWebUiPort           = 8787
        LocalQueueMaxSizeMb      = 100
        LogLevel                 = 'Information'
        InstallFormat            = 'MSI'
    }
}

$json = $config | ConvertTo-Json -Depth 5
Set-Content -Path $OutputPath -Value $json -Encoding UTF8

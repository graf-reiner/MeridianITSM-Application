#Requires -Version 5.1
# Invoked by the MSI WriteConfigCA custom action to produce C:\ProgramData\Meridian\config.json.
# Using PowerShell (not cmd /c echo) so we don't fight MSI Formatted-type brace stripping
# or cmd.exe escape quirks — we receive values as named args with zero {} in the MSI ExeCommand.
#
# Behavior matrix:
#   ServerUrl + EnrollmentToken supplied → write fresh config (initial install via setup wrapper).
#   Both empty AND OutputPath already exists → no-op; preserves enrolled config across upgrades/repairs.
#   Both empty AND no existing config → fail loud (a fresh install missing required args is broken).
#
# [AllowEmptyString()] is required because PowerShell's Mandatory check rejects empty strings
# in non-interactive mode (CAQuietExec) and would error before the script body runs.

param(
    [Parameter(Mandatory=$true)] [AllowEmptyString()] [string]$ServerUrl,
    [Parameter(Mandatory=$true)] [AllowEmptyString()] [string]$EnrollmentToken,
    [Parameter(Mandatory=$true)] [AllowEmptyString()] [string]$PrivacyTier,
    [Parameter(Mandatory=$true)] [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

$argsEmpty = [string]::IsNullOrWhiteSpace($ServerUrl) -and [string]::IsNullOrWhiteSpace($EnrollmentToken)
$configExists = Test-Path -LiteralPath $OutputPath

if ($argsEmpty -and $configExists) {
    # Upgrade / repair path: the wrapper didn't pass enrollment args, but a previously-enrolled
    # config exists. Preserve it verbatim. Any new defaults the agent needs are picked up at
    # runtime via Configuration defaults.
    Write-Host "write-config: preserving existing config at $OutputPath (no enrollment args provided)."
    exit 0
}

if ($argsEmpty -and -not $configExists) {
    Write-Error "write-config: no ServerUrl/EnrollmentToken supplied and no existing config at $OutputPath. A fresh install requires enrollment args."
    exit 1
}

$dir = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $dir)) {
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

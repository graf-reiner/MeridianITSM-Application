# Build the Meridian Agent + Setup EXE into a single distributable folder.
# Output: publish/win-x64-installer/ containing both InvAgent.exe and MeridianAgentSetup.exe
#
# Usage: powershell -ExecutionPolicy Bypass -File build-installer.ps1

param(
    [string]$Runtime = "win-x64",
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutputDir = Join-Path $RepoRoot "publish\$Runtime-installer"

Write-Host ""
Write-Host "Building Meridian Agent Installer ($Runtime, $Configuration)" -ForegroundColor Cyan
Write-Host "Output: $OutputDir" -ForegroundColor Gray
Write-Host ""

# Clean output
if (Test-Path $OutputDir) { Remove-Item -Recurse -Force $OutputDir }

# Build the agent
Write-Host "Building InvAgent.CLI..." -ForegroundColor Yellow
dotnet publish "$RepoRoot\src\InvAgent.CLI\InvAgent.CLI.csproj" `
    -c $Configuration -r $Runtime --self-contained `
    -o $OutputDir -verbosity:minimal
if ($LASTEXITCODE -ne 0) { throw "Agent build failed" }

# Build the setup EXE into the same folder
Write-Host "Building MeridianAgentSetup..." -ForegroundColor Yellow
dotnet publish "$RepoRoot\src\InvAgent.Setup\InvAgent.Setup.csproj" `
    -c $Configuration -r $Runtime --self-contained `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
    -o $OutputDir -verbosity:minimal
if ($LASTEXITCODE -ne 0) { throw "Setup build failed" }

Write-Host ""
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "  Agent:   $OutputDir\InvAgent.exe" -ForegroundColor Gray
Write-Host "  Setup:   $OutputDir\MeridianAgentSetup.exe" -ForegroundColor Gray
Write-Host ""
Write-Host "To install interactively:  Run MeridianAgentSetup.exe as Administrator" -ForegroundColor White
Write-Host "To install silently:       MeridianAgentSetup.exe --server-url URL --token TOKEN --quiet" -ForegroundColor White

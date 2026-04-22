# Build the Meridian Agent + Setup EXE + MSI into a single distributable folder.
# Output: publish/win-x64-installer/ containing InvAgent.exe, MeridianAgentSetup.exe,
#         and MeridianAgent.msi (stamped with version from Directory.Build.props).
#
# Usage: powershell -ExecutionPolicy Bypass -File build-installer.ps1
#        powershell -ExecutionPolicy Bypass -File build-installer.ps1 -SkipMsi

param(
    [string]$Runtime = "win-x64",
    [string]$Configuration = "Release",
    [switch]$SkipMsi
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutputDir = Join-Path $RepoRoot "publish\$Runtime-installer"

# Single source of truth for the version — drives both .NET assembly metadata
# (via Directory.Build.props itself) AND the MSI Package Version (via -d Version=).
[xml]$propsXml = Get-Content (Join-Path $RepoRoot "Directory.Build.props")
$Version = $propsXml.Project.PropertyGroup.Version
if (-not $Version) { throw "Could not read <Version> from Directory.Build.props" }

Write-Host ""
Write-Host "Building Meridian Agent Installer ($Runtime, $Configuration, v$Version)" -ForegroundColor Cyan
Write-Host "Output: $OutputDir" -ForegroundColor Gray
Write-Host ""

# Clean output (clear contents rather than remove folder — OneDrive/Explorer
# can hold a handle on the directory itself, which blocks a folder-level delete).
if (Test-Path $OutputDir) {
    Get-ChildItem $OutputDir -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
} else {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

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

# Build the MSI with WiX (unless -SkipMsi). Version is passed in so Product.wxs
# can't drift from Directory.Build.props.
if (-not $SkipMsi) {
    $wix = Get-Command wix.exe -ErrorAction SilentlyContinue
    if (-not $wix) {
        throw "wix.exe not found on PATH. Install WiX v6 (dotnet tool install --global wix) or pass -SkipMsi."
    }

    $Wxs     = Join-Path $RepoRoot "src\InvAgent.Installers\windows\Product.wxs"
    $ProjDir = Join-Path $RepoRoot "src\InvAgent.Installers"
    $MsiOut  = Join-Path $OutputDir "MeridianAgent.msi"

    Write-Host "Building MeridianAgent.msi (v$Version)..." -ForegroundColor Yellow
    & wix build $Wxs `
        -d "Version=$Version" `
        -d "PublishDir=$OutputDir" `
        -d "ProjectDir=$ProjDir" `
        -o $MsiOut
    if ($LASTEXITCODE -ne 0) { throw "MSI build failed" }
}

Write-Host ""
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "  Agent:   $OutputDir\InvAgent.exe" -ForegroundColor Gray
Write-Host "  Setup:   $OutputDir\MeridianAgentSetup.exe" -ForegroundColor Gray
if (-not $SkipMsi) {
    Write-Host "  MSI:     $OutputDir\MeridianAgent.msi (v$Version)" -ForegroundColor Gray
}
Write-Host ""
Write-Host "To install interactively:  Run MeridianAgentSetup.exe as Administrator" -ForegroundColor White
Write-Host "To install silently:       MeridianAgentSetup.exe --server-url URL --token TOKEN --quiet" -ForegroundColor White

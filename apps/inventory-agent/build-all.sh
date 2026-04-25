#!/bin/bash
# Build self-contained binaries (and Linux .deb / .rpm packages) for all platforms.
set -euo pipefail

cd "$(dirname "$0")"

# AGENT_VERSION env wins over Directory.Build.props default — lets CI bump
# the version per-build without an in-tree edit. Used for BOTH the assembly
# version baked into the binary AND the .deb / .rpm package version, so
# the heartbeat-side version-change detection (which clears forceUpdateUrl
# after a successful self-update) sees the new version on next heartbeat.
DEFAULT_VERSION=$(grep -oP '(?<=<Version>)[^<]+' Directory.Build.props | head -n1)
AGENT_VERSION="${AGENT_VERSION:-${DEFAULT_VERSION:-1.0.0}}"
export AGENT_VERSION

echo "Building MeridianITSM Inventory Agent v${AGENT_VERSION}..."
echo ""

TARGETS=("win-x64" "linux-x64" "osx-x64" "osx-arm64")

for target in "${TARGETS[@]}"; do
    echo "Building $target..."
    dotnet publish src/InvAgent.CLI/InvAgent.CLI.csproj \
        -c Release \
        -r "$target" \
        --self-contained \
        -o "publish/$target" \
        -p:PublishSingleFile=false \
        -p:Version="${AGENT_VERSION}" \
        -p:AssemblyVersion="${AGENT_VERSION}" \
        -p:FileVersion="${AGENT_VERSION}" \
        -p:InformationalVersion="${AGENT_VERSION}" \
        -verbosity:minimal
    echo "  -> publish/$target/ ($(du -sh "publish/$target" | cut -f1))"
done

# Linux native packages (.deb + .rpm). Each script no-ops with a friendly
# warning if its build tool isn't installed, so this works on any host.
if [[ -d publish/linux-x64 ]]; then
    echo ""
    echo "Building Linux packages..."
    PUBLISH_DIR=publish/linux-x64 OUTPUT_DIR=publish bash scripts/build-deb.sh
    PUBLISH_DIR=publish/linux-x64 OUTPUT_DIR=publish bash scripts/build-rpm.sh
fi

echo ""
echo "All builds complete:"
ls -d publish/*/ 2>/dev/null || true
ls -1 publish/*.deb publish/*.rpm 2>/dev/null || true

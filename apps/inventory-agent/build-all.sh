#!/bin/bash
# Build self-contained binaries for all platforms
set -euo pipefail

cd "$(dirname "$0")"

echo "Building MeridianITSM Inventory Agent..."
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
        -verbosity:minimal
    echo "  -> publish/$target/ ($(du -sh "publish/$target" | cut -f1))"
done

echo ""
echo "All builds complete:"
ls -d publish/*/

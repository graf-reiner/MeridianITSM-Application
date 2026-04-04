#!/bin/bash
# MeridianITSM Inventory Agent — macOS Installer
# Usage: sudo ./install.sh --server-url https://your-meridian.com --token <enrollment-token>

set -euo pipefail

INSTALL_DIR="/usr/local/meridian-agent"
CONFIG_DIR="/etc/meridian-agent"
LOG_DIR="/var/log/meridian-agent"
PLIST_PATH="/Library/LaunchDaemons/com.meridian.agent.plist"
SERVER_URL=""
TOKEN=""
PRIVACY_TIER="full"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --server-url) SERVER_URL="$2"; shift 2 ;;
        --token) TOKEN="$2"; shift 2 ;;
        --privacy-tier) PRIVACY_TIER="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

if [[ -z "$SERVER_URL" || -z "$TOKEN" ]]; then
    echo "Usage: sudo $0 --server-url <url> --token <token> [--privacy-tier <tier>]"
    exit 1
fi

if [[ $EUID -ne 0 ]]; then echo "ERROR: Run with sudo."; exit 1; fi

echo "================================================="
echo "  MeridianITSM Agent — macOS Installer"
echo "================================================="

# Stop existing
launchctl unload "$PLIST_PATH" 2>/dev/null || true

# Create directories
mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$LOG_DIR"

# Detect architecture
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
    PUBLISH_DIR="$(cd "$(dirname "$0")" && pwd)/../../publish/osx-arm64"
else
    PUBLISH_DIR="$(cd "$(dirname "$0")" && pwd)/../../publish/osx-x64"
fi

if [[ ! -f "$PUBLISH_DIR/InvAgent" ]]; then
    echo "ERROR: Binary not found in $PUBLISH_DIR"
    echo "Build: dotnet publish -c Release -r osx-${ARCH/arm64/arm64} --self-contained"
    exit 1
fi

echo "Copying agent files ($ARCH)..."
cp -R "$PUBLISH_DIR/"* "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/InvAgent"

# Config
cat > "$CONFIG_DIR/config.json" <<EOF
{
  "AgentConfig": {
    "ServerUrl": "$SERVER_URL",
    "EnrollmentToken": "$TOKEN",
    "PrivacyTier": "$PRIVACY_TIER",
    "HeartbeatIntervalSeconds": 300,
    "InventoryIntervalSeconds": 14400,
    "LocalWebUiPort": 8787,
    "LocalQueueMaxSizeMb": 100,
    "LogLevel": "Information"
  }
}
EOF

# LaunchDaemon plist
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.meridian.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/InvAgent</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/agent.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/agent-error.log</string>
</dict>
</plist>
EOF

launchctl load "$PLIST_PATH"

sleep 3
echo ""
echo "SUCCESS: Agent installed!"
echo "  Config:  $CONFIG_DIR/config.json"
echo "  Logs:    $LOG_DIR/agent.log"
echo "  Web UI:  http://127.0.0.1:8787"
echo "  Stop:    sudo launchctl unload $PLIST_PATH"
echo "  Start:   sudo launchctl load $PLIST_PATH"

#!/bin/bash
# MeridianITSM Inventory Agent — Linux Installer
# Usage: sudo ./install.sh --server-url https://your-meridian.com --token <enrollment-token>
#
# Options:
#   --server-url   URL       MeridianITSM server URL (required)
#   --token        TOKEN     Enrollment token (required)
#   --privacy-tier TIER      full|restricted|anonymized (default: full)

set -euo pipefail

INSTALL_DIR="/opt/meridian-agent"
CONFIG_DIR="/etc/meridian-agent"
LOG_DIR="/var/log/meridian-agent"
SERVICE_USER="meridian-agent"
SERVICE_NAME="meridian-agent"
SERVER_URL=""
TOKEN=""
PRIVACY_TIER="full"

# Parse args
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

if [[ $EUID -ne 0 ]]; then
    echo "ERROR: This script must be run as root (sudo)."
    exit 1
fi

echo "================================================="
echo "  MeridianITSM Inventory Agent — Linux Installer"
echo "================================================="

# Stop existing service
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "Stopping existing service..."
    systemctl stop "$SERVICE_NAME"
fi

# Create service user
if ! id "$SERVICE_USER" &>/dev/null; then
    echo "Creating service user: $SERVICE_USER"
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# Create directories
echo "Creating directories..."
mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$LOG_DIR"

# Copy files
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLISH_DIR="$SCRIPT_DIR/../../publish/linux-x64"
if [[ ! -f "$PUBLISH_DIR/InvAgent" ]]; then
    echo "ERROR: InvAgent binary not found in $PUBLISH_DIR"
    echo "Build first: dotnet publish -c Release -r linux-x64 --self-contained"
    exit 1
fi

echo "Copying agent files to $INSTALL_DIR..."
cp -r "$PUBLISH_DIR/"* "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/InvAgent"

# Write config
echo "Writing configuration..."
cat > "$CONFIG_DIR/config.json" <<CONFIGEOF
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
CONFIGEOF

# Set ownership
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR" "$CONFIG_DIR" "$LOG_DIR"

# Install systemd service
echo "Installing systemd service..."
cat > "/etc/systemd/system/$SERVICE_NAME.service" <<SERVICEEOF
[Unit]
Description=Meridian ITSM Inventory Agent
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
ExecStart=$INSTALL_DIR/InvAgent
WorkingDirectory=$INSTALL_DIR
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=multi-user.target
SERVICEEOF

# Enable and start
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

# Verify
sleep 3
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo ""
    echo "SUCCESS: Agent installed and running!"
    echo "  Service: $SERVICE_NAME ($(systemctl is-active $SERVICE_NAME))"
    echo "  Config:  $CONFIG_DIR/config.json"
    echo "  Logs:    journalctl -u $SERVICE_NAME -f"
    echo "  Web UI:  http://127.0.0.1:8787"
else
    echo "WARNING: Service installed but not running. Check: journalctl -u $SERVICE_NAME"
fi

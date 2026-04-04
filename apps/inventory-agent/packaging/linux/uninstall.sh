#!/bin/bash
# MeridianITSM Inventory Agent — Linux Uninstaller
# Usage: sudo ./uninstall.sh

set -euo pipefail

SERVICE_NAME="meridian-agent"
INSTALL_DIR="/opt/meridian-agent"

if [[ $EUID -ne 0 ]]; then echo "ERROR: Run as root (sudo)."; exit 1; fi

echo "Uninstalling MeridianITSM Agent..."

if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    systemctl stop "$SERVICE_NAME"
fi
systemctl disable "$SERVICE_NAME" 2>/dev/null || true
rm -f "/etc/systemd/system/$SERVICE_NAME.service"
systemctl daemon-reload

rm -rf "$INSTALL_DIR"

echo "Agent uninstalled."
echo "Config preserved at /etc/meridian-agent/ — delete manually if needed."
echo "Logs: journalctl --vacuum-time=0 -u $SERVICE_NAME"

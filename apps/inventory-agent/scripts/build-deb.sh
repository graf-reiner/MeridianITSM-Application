#!/bin/bash
# Build a .deb package for the Linux inventory agent.
#
# Inputs (env vars):
#   AGENT_VERSION   — version string written into the control file (default: 1.0.0)
#   PUBLISH_DIR     — dotnet publish output for linux-x64 (default: publish/linux-x64)
#   OUTPUT_DIR      — where to drop the .deb (default: publish)
#
# Output: $OUTPUT_DIR/agent-linux-${AGENT_VERSION}_amd64.deb

set -euo pipefail

cd "$(dirname "$0")/.."

AGENT_VERSION="${AGENT_VERSION:-1.0.0}"
PUBLISH_DIR="${PUBLISH_DIR:-publish/linux-x64}"
OUTPUT_DIR="${OUTPUT_DIR:-publish}"

if ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "build-deb.sh: dpkg-deb not found — skipping .deb build."
  echo "  Install: apt-get install -y dpkg-dev   (Debian/Ubuntu)"
  echo "           brew install dpkg              (macOS)"
  exit 0
fi

if [[ ! -f "$PUBLISH_DIR/InvAgent" ]]; then
  echo "build-deb.sh: $PUBLISH_DIR/InvAgent not found. Run dotnet publish first."
  exit 1
fi

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

# ── Layered filesystem the .deb installs into ────────────────────────────────
mkdir -p "$STAGING/DEBIAN"
mkdir -p "$STAGING/opt/meridian-agent"
mkdir -p "$STAGING/etc/systemd/system"
mkdir -p "$STAGING/etc/sudoers.d"
mkdir -p "$STAGING/etc/meridian-agent"
mkdir -p "$STAGING/var/log/meridian-agent"
mkdir -p "$STAGING/var/lib/meridian-agent"

# Agent binary + .NET self-contained dependencies
cp -r "$PUBLISH_DIR/"* "$STAGING/opt/meridian-agent/"
chmod 755 "$STAGING/opt/meridian-agent/InvAgent"

# systemd unit
cp src/InvAgent.Installers/linux/meridian-agent.service \
   "$STAGING/etc/systemd/system/meridian-agent.service"

# Sudoers fragment — minimal privilege for the service user to invoke the
# self-update path. dpkg/rpm and systemctl are the only escalations allowed.
cat > "$STAGING/etc/sudoers.d/meridian-agent" <<'SUDOERS'
# Meridian Inventory Agent — self-update privilege
# Installed by the meridian-agent .deb / .rpm. Allows the service user to
# run only these exact commands without a password. Required so the agent
# can apply update packages received via the heartbeat directive flow.
#
# UpdateInstaller wraps dpkg/rpm in `systemd-run --collect --unit=...` so
# the package manager runs as a transient unit OUTSIDE the agent's cgroup
# (escapes ProtectSystem=strict + namespace mounts that would otherwise
# block dpkg's own database). The sudoers wildcards must therefore match
# the full systemd-run invocation, not bare dpkg/rpm.
meridian-agent ALL=(root) NOPASSWD: /usr/bin/systemd-run --collect --unit=meridian-update-* /usr/bin/dpkg -i /var/lib/meridian-agent/updates/*.deb
meridian-agent ALL=(root) NOPASSWD: /usr/bin/systemd-run --collect --unit=meridian-update-* /usr/bin/rpm -U --force /var/lib/meridian-agent/updates/*.rpm
SUDOERS
chmod 440 "$STAGING/etc/sudoers.d/meridian-agent"

# DEBIAN/control — substitute the version we're building
cat > "$STAGING/DEBIAN/control" <<CONTROL
Package: meridian-agent
Version: ${AGENT_VERSION}
Architecture: amd64
Maintainer: Meridian ITSM <support@meridianitsm.com>
Section: admin
Priority: optional
Description: Meridian ITSM Inventory Agent
 Cross-platform endpoint inventory agent for Meridian ITSM.
 Collects hardware, software, services, and network inventory
 from endpoints and reports to the Meridian server via REST API.
 Runs as a systemd service (meridian-agent.service).
CONTROL
# NB: no Depends:dotnet-runtime — we ship a self-contained binary that
# bundles its own runtime, so the package works on minimal distros.

# postinst — service user, ownership, daemon-reload, enable+start
cat > "$STAGING/DEBIAN/postinst" <<'POSTINST'
#!/bin/sh
set -e

INSTALL_DIR="/opt/meridian-agent"
CONFIG_DIR="/etc/meridian-agent"
LOG_DIR="/var/log/meridian-agent"
LIB_DIR="/var/lib/meridian-agent"
SERVICE_NAME="meridian-agent"
AGENT_USER="meridian-agent"

if ! id -u "${AGENT_USER}" >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "${AGENT_USER}"
fi
mkdir -p "${LIB_DIR}"

# Default config — only written if no existing config (preserve enrollment
# state across upgrades).
if [ ! -f "${CONFIG_DIR}/config.json" ]; then
    cat > "${CONFIG_DIR}/config.json" <<'DEFAULTCFG'
{
  "AgentConfig": {
    "ServerUrl": "https://your-meridian-server.com",
    "EnrollmentToken": "",
    "PrivacyTier": "full",
    "HeartbeatIntervalSeconds": 300,
    "InventoryIntervalSeconds": 14400,
    "LocalWebUiPort": 8787,
    "LocalQueueMaxSizeMb": 100,
    "LogLevel": "Information",
    "InstallFormat": "DEB"
  }
}
DEFAULTCFG
    chmod 640 "${CONFIG_DIR}/config.json"
fi

chown -R "${AGENT_USER}:${AGENT_USER}" "${INSTALL_DIR}" "${CONFIG_DIR}" "${LOG_DIR}" "${LIB_DIR}"

if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1 || true
    # Don't fail postinst if start fails — config may not have a real
    # ServerUrl yet (fresh install before the bash installer rewrites it).
    systemctl restart "${SERVICE_NAME}" >/dev/null 2>&1 || true
fi
POSTINST
chmod 755 "$STAGING/DEBIAN/postinst"

# prerm — stop the service before removal
cat > "$STAGING/DEBIAN/prerm" <<'PRERM'
#!/bin/sh
set -e
if command -v systemctl >/dev/null 2>&1; then
    systemctl stop meridian-agent >/dev/null 2>&1 || true
    systemctl disable meridian-agent >/dev/null 2>&1 || true
fi
PRERM
chmod 755 "$STAGING/DEBIAN/prerm"

# postrm — purge service user only on full purge
cat > "$STAGING/DEBIAN/postrm" <<'POSTRM'
#!/bin/sh
set -e
if [ "$1" = "purge" ]; then
    rm -f /etc/sudoers.d/meridian-agent
    if id -u meridian-agent >/dev/null 2>&1; then
        userdel meridian-agent >/dev/null 2>&1 || true
    fi
    rm -rf /etc/meridian-agent /var/log/meridian-agent /opt/meridian-agent
fi
POSTRM
chmod 755 "$STAGING/DEBIAN/postrm"

mkdir -p "$OUTPUT_DIR"
OUT="$OUTPUT_DIR/agent-linux-${AGENT_VERSION}_amd64.deb"

# Force xz compression and root ownership so the package is reproducible.
dpkg-deb --root-owner-group --build "$STAGING" "$OUT" >/dev/null

echo "  -> $OUT ($(du -h "$OUT" | cut -f1))"

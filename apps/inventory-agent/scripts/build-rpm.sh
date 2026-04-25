#!/bin/bash
# Build an .rpm package for the Linux inventory agent.
#
# Inputs (env vars):
#   AGENT_VERSION   — version string (default: 1.0.0)
#   PUBLISH_DIR     — dotnet publish output for linux-x64 (default: publish/linux-x64)
#   OUTPUT_DIR      — where to drop the .rpm (default: publish)
#
# Output: $OUTPUT_DIR/agent-linux-${AGENT_VERSION}.x86_64.rpm

set -euo pipefail

cd "$(dirname "$0")/.."

AGENT_VERSION="${AGENT_VERSION:-1.0.0}"
PUBLISH_DIR="${PUBLISH_DIR:-publish/linux-x64}"
OUTPUT_DIR="${OUTPUT_DIR:-publish}"

if ! command -v rpmbuild >/dev/null 2>&1; then
  echo "build-rpm.sh: rpmbuild not found — skipping .rpm build."
  echo "  Install: apt-get install -y rpm   (Debian/Ubuntu build host)"
  echo "           dnf install -y rpm-build (Fedora/RHEL)"
  echo "           brew install rpm         (macOS)"
  exit 0
fi

if [[ ! -f "$PUBLISH_DIR/InvAgent" ]]; then
  echo "build-rpm.sh: $PUBLISH_DIR/InvAgent not found. Run dotnet publish first."
  exit 1
fi

PUBLISH_DIR_ABS="$(cd "$PUBLISH_DIR" && pwd)"

RPM_TOPDIR="$(mktemp -d)"
trap 'rm -rf "$RPM_TOPDIR"' EXIT
mkdir -p "$RPM_TOPDIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS,BUILDROOT}

# Stage the package payload as a tarball so rpmbuild can pick it up via Source0.
PAYLOAD_DIR="$RPM_TOPDIR/SOURCES/meridian-agent-${AGENT_VERSION}"
mkdir -p "$PAYLOAD_DIR"
cp -r "$PUBLISH_DIR_ABS/"* "$PAYLOAD_DIR/"
( cd "$RPM_TOPDIR/SOURCES" && tar czf "meridian-agent-${AGENT_VERSION}.tar.gz" "meridian-agent-${AGENT_VERSION}" )

# systemd unit + sudoers fragment go into SOURCES alongside the payload tarball
cp src/InvAgent.Installers/linux/meridian-agent.service "$RPM_TOPDIR/SOURCES/meridian-agent.service"
cat > "$RPM_TOPDIR/SOURCES/meridian-agent.sudoers" <<'SUDOERS'
# Meridian Inventory Agent — self-update privilege
# Path matches UpdateInstaller's /var/lib/meridian-agent/updates/ download
# directory (must survive systemd restart, so /tmp can't be used under
# PrivateTmp=yes).
meridian-agent ALL=(root) NOPASSWD: /usr/bin/dpkg -i /var/lib/meridian-agent/updates/*.deb
meridian-agent ALL=(root) NOPASSWD: /usr/bin/rpm -U --force /var/lib/meridian-agent/updates/*.rpm
meridian-agent ALL=(root) NOPASSWD: /usr/bin/systemctl restart meridian-agent
meridian-agent ALL=(root) NOPASSWD: /bin/systemctl restart meridian-agent
SUDOERS

# SPEC
cat > "$RPM_TOPDIR/SPECS/meridian-agent.spec" <<SPEC
# Self-contained .NET binary has no separate debug symbols, and rpmbuild on
# Debian-based hosts trips on the empty debuginfo extract. Disable.
%global debug_package %{nil}
%global __os_install_post %{nil}

Name:           meridian-agent
Version:        ${AGENT_VERSION}
Release:        1%{?dist}
Summary:        Meridian ITSM Inventory Agent

License:        Proprietary
URL:            https://meridianitsm.com
Source0:        meridian-agent-%{version}.tar.gz
Source1:        meridian-agent.service
Source2:        meridian-agent.sudoers
BuildArch:      x86_64
AutoReqProv:    no

%description
Cross-platform endpoint inventory agent for Meridian ITSM.
Collects hardware, software, services, and network inventory
and reports to the Meridian server via REST API.
Runs as a systemd service (meridian-agent.service).

%prep
%setup -q -n meridian-agent-%{version}

%install
mkdir -p %{buildroot}/opt/meridian-agent
cp -r * %{buildroot}/opt/meridian-agent/
chmod 755 %{buildroot}/opt/meridian-agent/InvAgent

mkdir -p %{buildroot}/etc/systemd/system
install -m 644 %{SOURCE1} %{buildroot}/etc/systemd/system/meridian-agent.service

mkdir -p %{buildroot}/etc/sudoers.d
install -m 440 %{SOURCE2} %{buildroot}/etc/sudoers.d/meridian-agent

mkdir -p %{buildroot}/etc/meridian-agent
mkdir -p %{buildroot}/var/log/meridian-agent
mkdir -p %{buildroot}/var/lib/meridian-agent

%files
/opt/meridian-agent
/etc/systemd/system/meridian-agent.service
/etc/sudoers.d/meridian-agent
%dir /etc/meridian-agent
%dir /var/log/meridian-agent
%dir /var/lib/meridian-agent

%pre
if ! id -u meridian-agent >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /sbin/nologin meridian-agent
fi

%post
if [ ! -f /etc/meridian-agent/config.json ]; then
    cat > /etc/meridian-agent/config.json <<'CFG'
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
    "InstallFormat": "RPM"
  }
}
CFG
    chmod 640 /etc/meridian-agent/config.json
fi
chown -R meridian-agent:meridian-agent /opt/meridian-agent /etc/meridian-agent /var/log/meridian-agent /var/lib/meridian-agent
if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload
    systemctl enable meridian-agent >/dev/null 2>&1 || true
    systemctl restart meridian-agent >/dev/null 2>&1 || true
fi

%preun
if [ \$1 -eq 0 ] && command -v systemctl >/dev/null 2>&1; then
    systemctl stop meridian-agent >/dev/null 2>&1 || true
    systemctl disable meridian-agent >/dev/null 2>&1 || true
fi

%postun
if [ \$1 -eq 0 ]; then
    rm -f /etc/sudoers.d/meridian-agent
    userdel meridian-agent >/dev/null 2>&1 || true
fi

%changelog
* $(date '+%a %b %d %Y') Meridian ITSM Build <build@meridianitsm.com> - ${AGENT_VERSION}-1
- Built from CI for version ${AGENT_VERSION}
SPEC

rpmbuild --define "_topdir $RPM_TOPDIR" \
         --define "_binary_payload w9.xzdio" \
         -bb "$RPM_TOPDIR/SPECS/meridian-agent.spec" >/dev/null

mkdir -p "$OUTPUT_DIR"
OUT="$OUTPUT_DIR/agent-linux-${AGENT_VERSION}.x86_64.rpm"
SRC="$RPM_TOPDIR/RPMS/x86_64/meridian-agent-${AGENT_VERSION}-1"*".x86_64.rpm"
cp $SRC "$OUT"

echo "  -> $OUT ($(du -h "$OUT" | cut -f1))"

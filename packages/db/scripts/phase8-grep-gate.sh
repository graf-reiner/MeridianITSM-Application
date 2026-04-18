#!/usr/bin/env bash
# Phase 8 grep gate: ensure no code reads/writes the 10 dropped Asset hardware fields.
#
# Wave 0: WARN mode (default PHASE8_GATE_ENFORCE=0). Gate never fails CI in
#         Waves 0-2 because legacy fields still exist on the Asset model.
# Wave 3: ENFORCE mode (plan 08-04 flips the default to 1 via CI env export).
#
# Patterns are pinned to specific field names so a contributor cannot satisfy
# the gate by renaming a variable (T-7-01-02 mitigation carried forward).
#
# The 10 watched Asset field names:
#   hostname, operatingSystem, osVersion, cpuModel, cpuCores,
#   ramGb, disks, networkInterfaces, softwareInventory, lastInventoryAt

set -euo pipefail

ENFORCE="${PHASE8_GATE_ENFORCE:-0}"   # WAVE 0 DEFAULT IS 0; Wave 3 task flips to 1
FAIL=0

check() {
  local pattern="$1"
  local file="$2"
  if [ -f "$file" ] && grep -nE "$pattern" "$file" 2>/dev/null; then
    echo "x Dropped Asset field referenced in $file (pattern: $pattern)"
    FAIL=1
  fi
}

# Service layer
check "data\.(hostname|operatingSystem|osVersion|cpuModel|cpuCores|ramGb|disks|networkInterfaces|softwareInventory|lastInventoryAt)" \
      apps/api/src/services/asset.service.ts
check "asset\.(hostname|operatingSystem|osVersion|cpuModel|cpuCores|ramGb|disks|networkInterfaces|softwareInventory|lastInventoryAt)" \
      apps/api/src/services/asset.service.ts

# Routes
check "(hostname|operatingSystem|osVersion|cpuModel|cpuCores|ramGb|disks|networkInterfaces|softwareInventory|lastInventoryAt)" \
      apps/api/src/routes/v1/assets/index.ts

# Worker (must NOT write Asset hardware fields - Pitfall 5)
check "prisma\.asset\.(create|update|upsert)[\s\S]*hostname" \
      apps/worker/src/workers/cmdb-reconciliation.ts

# Web app - Asset detail TypeScript interface (Pitfall 6)
check "  (hostname|operatingSystem|osVersion|cpuModel|cpuCores|ramGb|disks|networkInterfaces):" \
      'apps/web/src/app/dashboard/assets/[id]/page.tsx'

if [ "$FAIL" -ne 0 ]; then
  echo ""
  if [ "$ENFORCE" = "1" ]; then
    echo "x Phase 8 grep gate FAILED — dropped Asset fields still referenced"
    exit 1
  fi
  echo "! Phase 8 grep gate WARN — dropped Asset fields still referenced (expected in Waves 0-2)."
  echo "  Plan 08-04 (Wave 3) will remove these and enable enforce mode (PHASE8_GATE_ENFORCE=1)."
  exit 0
fi
echo "ok Phase 8 grep gate PASSED"

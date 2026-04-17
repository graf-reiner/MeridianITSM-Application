#!/usr/bin/env bash
# Phase 7 grep gate: ensure no legacy enum writes remain in CMDB code paths.
#
# Plan 04 (Wave 3) flipped the gate to ENFORCE mode (default `PHASE7_GATE_ENFORCE=1`).
# The script now exits non-zero on any legacy enum write detected in the 4
# watched files (cmdb.service, application.service, cmdb-import.service,
# cmdb-reconciliation worker) plus the audit-only assets/index.ts.
#
# Patterns are pinned to specific enum tokens so a contributor cannot satisfy
# the gate by renaming the variable alone. (T-7-01-02 mitigation.)
#
# Operators can opt-out with `PHASE7_GATE_ENFORCE=0 bash phase7-grep-gate.sh`
# for an emergency rollback, but the default in master is ENFORCE.

set -euo pipefail

ENFORCE="${PHASE7_GATE_ENFORCE:-1}"
FAIL=0

check() {
  local pattern="$1"
  local file="$2"
  if [ -f "$file" ] && grep -nE "$pattern" "$file" 2>/dev/null; then
    echo "x Legacy enum write found in $file (pattern: $pattern)"
    FAIL=1
  fi
}

# cmdb.service.ts
check "type:[[:space:]]*['\"]?(SERVER|WORKSTATION|NETWORK_DEVICE|SOFTWARE|SERVICE|DATABASE|VIRTUAL_MACHINE|CONTAINER|OTHER)['\"]?[[:space:]]+as[[:space:]]+(never|any)" \
      apps/api/src/services/cmdb.service.ts
check "status:[[:space:]]*['\"]?(ACTIVE|INACTIVE|DECOMMISSIONED|PLANNED)['\"]?[[:space:]]+as[[:space:]]+(never|any)" \
      apps/api/src/services/cmdb.service.ts
check "environment:[[:space:]]*['\"]?(PRODUCTION|STAGING|DEV|DR)['\"]?[[:space:]]+as[[:space:]]+(never|any)" \
      apps/api/src/services/cmdb.service.ts
check "relationshipType:.*as[[:space:]]+(never|any)" \
      apps/api/src/services/cmdb.service.ts

# application.service.ts
check "type:[[:space:]]*['\"]?(SERVER|WORKSTATION|NETWORK_DEVICE|SOFTWARE|SERVICE|DATABASE|VIRTUAL_MACHINE|CONTAINER|OTHER)['\"]?[[:space:]]+as[[:space:]]+(never|any)" \
      apps/api/src/services/application.service.ts
check "status:[[:space:]]*['\"]?(ACTIVE|INACTIVE|DECOMMISSIONED|PLANNED)['\"]?[[:space:]]+as[[:space:]]+(never|any)" \
      apps/api/src/services/application.service.ts
check "environment:[[:space:]]*['\"]?(PRODUCTION|STAGING|DEV|DR)['\"]?[[:space:]]+as[[:space:]]+(never|any)" \
      apps/api/src/services/application.service.ts

# cmdb-import.service.ts
check "type:[[:space:]]*data\.type[[:space:]]+as[[:space:]]+(never|any)" \
      apps/api/src/services/cmdb-import.service.ts
check "status:[[:space:]]*data\.status[[:space:]]+as[[:space:]]+(never|any)" \
      apps/api/src/services/cmdb-import.service.ts
check "environment:[[:space:]]*data\.environment[[:space:]]+as[[:space:]]+(never|any)" \
      apps/api/src/services/cmdb-import.service.ts

# cmdb-reconciliation.ts (worker)
check "type:[[:space:]]*[a-zA-Z]+[[:space:]]+as[[:space:]]+(never|any)" \
      apps/worker/src/workers/cmdb-reconciliation.ts
check "status:[[:space:]]*['\"]?(ACTIVE|INACTIVE|DECOMMISSIONED|PLANNED)['\"]?[[:space:]]+as[[:space:]]+(never|any)" \
      apps/worker/src/workers/cmdb-reconciliation.ts
check "environment:[[:space:]]*['\"]?(PRODUCTION|STAGING|DEV|DR)['\"]?[[:space:]]+as[[:space:]]+(never|any)" \
      apps/worker/src/workers/cmdb-reconciliation.ts

# Audit-only: assets/index.ts:270,297 (RESEARCH A5) — verify no enum writes here
check "(type|status|environment):[[:space:]]*['\"][A-Z_]+['\"]" \
      apps/api/src/routes/v1/assets/index.ts

if [ "$FAIL" -ne 0 ]; then
  echo ""
  if [ "$ENFORCE" = "1" ]; then
    echo "x Phase 7 grep gate FAILED — legacy enum writes detected"
    exit 1
  fi
  echo "! Phase 7 grep gate WARN — legacy enum writes still present (expected in Waves 0-3)."
  echo "  Plan 04 will remove these and enable enforce mode (PHASE7_GATE_ENFORCE=1)."
  exit 0
fi
echo "ok Phase 7 grep gate PASSED — no legacy enum writes"

#!/bin/bash
# Seed demo data: Assets, CMDB CIs, Relationships, Application, Certificate

API='http://localhost:4000'
CT='Content-Type: application/json'

# Get auth token
REDIRECT=$(curl -s -o /dev/null -w "%{redirect_url}" "$API/api/auth/form-login" -H "$CT" -d '{"email":"admin@msp.local","password":"Admin123!"}')
TOKEN=$(echo "$REDIRECT" | sed 's/.*token=//;s/&.*//')
AUTH="Authorization: Bearer $TOKEN"

echo "=== Creating Assets ==="

A1=$(curl -s -X POST "$API/api/v1/assets" -H "$CT" -H "$AUTH" -d '{
  "assetTag":"SRV-PROD-001","manufacturer":"Dell","model":"PowerEdge R740","serialNumber":"DL7402026A001",
  "status":"DEPLOYED","hostname":"PROD-WEB-01","purchaseCost":12500,"cpuModel":"Xeon Gold 6248","cpuCores":20,"ramGb":128
}')
A1_ID=$(echo "$A1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','FAIL'))")
echo "Asset Web Server: $A1_ID"

A2=$(curl -s -X POST "$API/api/v1/assets" -H "$CT" -H "$AUTH" -d '{
  "assetTag":"SRV-PROD-002","manufacturer":"Dell","model":"PowerEdge R740","serialNumber":"DL7402026A002",
  "status":"DEPLOYED","hostname":"PROD-DB-01","purchaseCost":18900,"cpuModel":"Xeon Gold 6248","cpuCores":24,"ramGb":256
}')
A2_ID=$(echo "$A2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','FAIL'))")
echo "Asset DB Server: $A2_ID"

A3=$(curl -s -X POST "$API/api/v1/assets" -H "$CT" -H "$AUTH" -d '{
  "assetTag":"NET-FW-001","manufacturer":"Palo Alto","model":"PA-3260","serialNumber":"PA3260-2026",
  "status":"DEPLOYED","hostname":"FW-PROD-01","purchaseCost":28000
}')
A3_ID=$(echo "$A3" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','FAIL'))")
echo "Asset Firewall: $A3_ID"

echo ""
echo "=== Creating CMDB CIs ==="

# Get class IDs
CLASSES=$(curl -s "$API/api/v1/cmdb/classes" -H "$AUTH")
SERVER_CLASS=$(echo "$CLASSES" | python3 -c "import sys,json; cs=json.load(sys.stdin); print(next(c['id'] for c in cs if c['classKey']=='server'))")
DB_CLASS=$(echo "$CLASSES" | python3 -c "import sys,json; cs=json.load(sys.stdin); print(next(c['id'] for c in cs if c['classKey']=='database'))")
NET_CLASS=$(echo "$CLASSES" | python3 -c "import sys,json; cs=json.load(sys.stdin); print(next(c['id'] for c in cs if c['classKey']=='network_device'))")
EP_CLASS=$(echo "$CLASSES" | python3 -c "import sys,json; cs=json.load(sys.stdin); print(next(c['id'] for c in cs if c['classKey']=='endpoint'))")
APP_CLASS=$(echo "$CLASSES" | python3 -c "import sys,json; cs=json.load(sys.stdin); print(next(c['id'] for c in cs if c['classKey']=='application'))")
echo "Classes: server=$SERVER_CLASS db=$DB_CLASS net=$NET_CLASS ep=$EP_CLASS app=$APP_CLASS"

# Web Server CI (linked to Asset)
CI1=$(curl -s -X POST "$API/api/v1/cmdb/cis" -H "$CT" -H "$AUTH" -d "{
  \"name\":\"PROD-WEB-01\",\"classId\":\"$SERVER_CLASS\",\"criticality\":\"high\",
  \"hostname\":\"prod-web-01.meridian.local\",\"ipAddress\":\"10.1.100.10\",
  \"assetId\":\"$A1_ID\",
  \"confidentialityClass\":\"INTERNAL\",\"integrityClass\":\"HIGH\",\"availabilityClass\":\"HIGH\",
  \"serverExt\":{\"serverType\":\"PHYSICAL\",\"operatingSystem\":\"Ubuntu\",\"osVersion\":\"22.04 LTS\",\"cpuCount\":20,\"memoryGb\":128,\"storageGb\":2000}
}")
CI1_ID=$(echo "$CI1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','FAIL'))")
echo "CI Web Server: $CI1_ID"

# Database Server CI (linked to Asset)
CI2=$(curl -s -X POST "$API/api/v1/cmdb/cis" -H "$CT" -H "$AUTH" -d "{
  \"name\":\"PROD-DB-01\",\"classId\":\"$SERVER_CLASS\",\"criticality\":\"mission_critical\",
  \"hostname\":\"prod-db-01.meridian.local\",\"ipAddress\":\"10.1.100.20\",
  \"assetId\":\"$A2_ID\",
  \"confidentialityClass\":\"CONFIDENTIAL\",\"integrityClass\":\"CRITICAL\",\"availabilityClass\":\"CRITICAL\",
  \"serverExt\":{\"serverType\":\"PHYSICAL\",\"operatingSystem\":\"Ubuntu\",\"osVersion\":\"22.04 LTS\",\"cpuCount\":24,\"memoryGb\":256,\"storageGb\":4000}
}")
CI2_ID=$(echo "$CI2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','FAIL'))")
echo "CI DB Server: $CI2_ID"

# PostgreSQL Database CI
CI3=$(curl -s -X POST "$API/api/v1/cmdb/cis" -H "$CT" -H "$AUTH" -d "{
  \"name\":\"PostgreSQL-Production\",\"classId\":\"$DB_CLASS\",\"criticality\":\"mission_critical\",
  \"hostname\":\"prod-db-01.meridian.local\",
  \"databaseExt\":{\"dbEngine\":\"PostgreSQL\",\"dbVersion\":\"15.4\",\"port\":5432,\"backupRequired\":true,\"encryptionEnabled\":true,\"containsSensitiveData\":true}
}")
CI3_ID=$(echo "$CI3" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','FAIL'))")
echo "CI PostgreSQL: $CI3_ID"

# Firewall CI (linked to Asset)
CI4=$(curl -s -X POST "$API/api/v1/cmdb/cis" -H "$CT" -H "$AUTH" -d "{
  \"name\":\"FW-PROD-01\",\"classId\":\"$NET_CLASS\",\"criticality\":\"high\",
  \"hostname\":\"fw-prod-01.meridian.local\",\"ipAddress\":\"10.1.100.1\",
  \"assetId\":\"$A3_ID\",
  \"networkDeviceExt\":{\"deviceType\":\"FIREWALL\",\"firmwareVersion\":\"10.2.3\",\"managementIp\":\"10.1.100.1\"}
}")
CI4_ID=$(echo "$CI4" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','FAIL'))")
echo "CI Firewall: $CI4_ID"

# HTTPS Endpoint CI (with SSL cert expiring Aug 2026)
CI5=$(curl -s -X POST "$API/api/v1/cmdb/cis" -H "$CT" -H "$AUTH" -d "{
  \"name\":\"portal.meridian.com\",\"classId\":\"$EP_CLASS\",\"criticality\":\"high\",
  \"endpointExt\":{\"endpointType\":\"HTTPS\",\"url\":\"https://portal.meridian.com\",\"dnsName\":\"portal.meridian.com\",\"tlsRequired\":true,\"certificateExpiryDate\":\"2026-08-15T00:00:00.000Z\",\"certificateIssuer\":\"DigiCert SHA2 Extended Validation\"}
}")
CI5_ID=$(echo "$CI5" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','FAIL'))")
echo "CI HTTPS Endpoint (cert): $CI5_ID"

# Application CI (primary CI for the Customer Portal app)
CI6=$(curl -s -X POST "$API/api/v1/cmdb/cis" -H "$CT" -H "$AUTH" -d "{
  \"name\":\"Customer Portal App\",\"classId\":\"$APP_CLASS\",\"criticality\":\"high\"
}")
CI6_ID=$(echo "$CI6" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','FAIL'))")
echo "CI App (Customer Portal): $CI6_ID"

echo ""
echo "=== Creating Relationships ==="

# Customer Portal App DEPENDS_ON Web Server
curl -s -X POST "$API/api/v1/cmdb/relationships" -H "$CT" -H "$AUTH" -d "{
  \"sourceId\":\"$CI6_ID\",\"targetId\":\"$CI1_ID\",\"relationshipType\":\"DEPENDS_ON\"
}" -o /dev/null -w "Portal App -> Web Server (DEPENDS_ON): %{http_code}\n"

# Customer Portal App DEPENDS_ON PostgreSQL
curl -s -X POST "$API/api/v1/cmdb/relationships" -H "$CT" -H "$AUTH" -d "{
  \"sourceId\":\"$CI6_ID\",\"targetId\":\"$CI3_ID\",\"relationshipType\":\"DEPENDS_ON\"
}" -o /dev/null -w "Portal App -> PostgreSQL (DEPENDS_ON): %{http_code}\n"

# Customer Portal App CONNECTS_TO HTTPS Endpoint
curl -s -X POST "$API/api/v1/cmdb/relationships" -H "$CT" -H "$AUTH" -d "{
  \"sourceId\":\"$CI6_ID\",\"targetId\":\"$CI5_ID\",\"relationshipType\":\"CONNECTS_TO\"
}" -o /dev/null -w "Portal App -> Endpoint (CONNECTS_TO): %{http_code}\n"

# PostgreSQL RUNS_ON DB Server
curl -s -X POST "$API/api/v1/cmdb/relationships" -H "$CT" -H "$AUTH" -d "{
  \"sourceId\":\"$CI3_ID\",\"targetId\":\"$CI2_ID\",\"relationshipType\":\"RUNS_ON\"
}" -o /dev/null -w "PostgreSQL -> DB Server (RUNS_ON): %{http_code}\n"

# Web Server CONNECTS_TO Firewall
curl -s -X POST "$API/api/v1/cmdb/relationships" -H "$CT" -H "$AUTH" -d "{
  \"sourceId\":\"$CI1_ID\",\"targetId\":\"$CI4_ID\",\"relationshipType\":\"CONNECTS_TO\"
}" -o /dev/null -w "Web Server -> Firewall (CONNECTS_TO): %{http_code}\n"

echo ""
echo "=== Creating Application ==="

APP=$(curl -s -X POST "$API/api/v1/applications" -H "$CT" -H "$AUTH" -d '{
  "name":"Customer Portal","type":"WEB","status":"ACTIVE","criticality":"CRITICAL",
  "description":"Customer-facing self-service portal for ticket submission, knowledge base, and account management.",
  "hostingModel":"ON_PREMISE","lifecycleStage":"RUN","annualCost":45000,
  "authMethod":"SAML SSO","dataClassification":"CONFIDENTIAL",
  "rpo":60,"rto":30,"strategicRating":5,
  "techStack":["Next.js","React","PostgreSQL","Redis","TailwindCSS"],
  "vendorContact":"Internal Engineering","supportNotes":"Runbook: restart via pm2 restart web. Check /opt/meridian/logs for errors. DB failover documented in DR plan.",
  "osRequirements":"Ubuntu 22.04+"
}')
APP_ID=$(echo "$APP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','FAIL'))")
echo "Application Customer Portal: $APP_ID"

# Link application to its primary CI
curl -s -X POST "$API/api/v1/applications/$APP_ID/link-ci/$CI6_ID" -H "$AUTH" -o /dev/null -w "Link App -> Primary CI: %{http_code}\n"

# Add dependency on Email Server (if it exists)
EXISTING=$(curl -s "$API/api/v1/applications?search=Email&pageSize=1" -H "$AUTH")
EMAIL_ID=$(echo "$EXISTING" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['id'] if d else 'NONE')" 2>/dev/null)
if [ "$EMAIL_ID" != "NONE" ] && [ -n "$EMAIL_ID" ]; then
  curl -s -X POST "$API/api/v1/applications/$APP_ID/dependencies" -H "$CT" -H "$AUTH" -d "{
    \"targetApplicationId\":\"$EMAIL_ID\",\"dependencyType\":\"API_CALL\",\"description\":\"Sends notification emails via SMTP relay\"
  }" -o /dev/null -w "Dependency Portal -> Email Server: %{http_code}\n"
fi

# Add dependency on Accounting System (if it exists)
EXISTING2=$(curl -s "$API/api/v1/applications?search=Accounting&pageSize=1" -H "$AUTH")
ACCT_ID=$(echo "$EXISTING2" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['id'] if d else 'NONE')" 2>/dev/null)
if [ "$ACCT_ID" != "NONE" ] && [ -n "$ACCT_ID" ]; then
  curl -s -X POST "$API/api/v1/applications/$APP_ID/dependencies" -H "$CT" -H "$AUTH" -d "{
    \"targetApplicationId\":\"$ACCT_ID\",\"dependencyType\":\"SHARED_DATABASE\",\"description\":\"Shares customer billing data\"
  }" -o /dev/null -w "Dependency Portal -> Accounting: %{http_code}\n"
fi

echo ""
echo "========================================="
echo "DEMO DATA CREATED SUCCESSFULLY"
echo "========================================="
echo ""
echo "Explore these pages:"
echo "  Application:  /dashboard/applications/$APP_ID"
echo "  DB Server CI: /dashboard/cmdb/$CI2_ID  (blast radius: Customer Portal depends on PostgreSQL which runs on this)"
echo "  Firewall CI:  /dashboard/cmdb/$CI4_ID  (linked asset: Palo Alto PA-3260)"
echo "  Web Server:   /dashboard/cmdb/$CI1_ID  (linked asset: Dell R740)"
echo "  SSL Cert:     /dashboard/applications/ssl-certificates  (portal.meridian.com expires Aug 2026)"
echo ""
echo "Relationship chain:"
echo "  Customer Portal (App) -> Customer Portal App (CI) -> DEPENDS_ON Web Server + PostgreSQL + Endpoint"
echo "  PostgreSQL (CI) -> RUNS_ON DB Server (CI) -> linked to Asset SRV-PROD-002"
echo "  portal.meridian.com (CI) -> SSL cert expires 2026-08-15"

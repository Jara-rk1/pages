#!/bin/bash
# =============================================================================
# KPMG Newsletter Minigames — Azure App Service Deployment
#
# Prerequisites: Azure CLI installed and logged in (az login)
# Usage: bash deploy_azure.sh
# =============================================================================

set -e

AZ="/c/Program Files/Microsoft SDKs/Azure/CLI2/wbin/az.cmd"

# Configuration — change these if needed
APP_NAME="kpmg-minigames"
RESOURCE_GROUP="kpmg-minigames-rg"
LOCATION="australiaeast"           # Sydney region
SKU="F1"                           # Free tier
PYTHON_VERSION="3.10"

echo ""
echo "  ========================================"
echo "  KPMG Newsletter Minigames — Azure Deploy"
echo "  ========================================"
echo ""

# 1. Verify login
echo "  [1/5] Checking Azure login..."
"$AZ" account show --query "{name:name, id:id}" -o table 2>/dev/null || {
    echo "  ERROR: Not logged in. Run: az login"
    exit 1
}
echo ""

# 2. Create resource group
echo "  [2/5] Creating resource group: $RESOURCE_GROUP ($LOCATION)..."
"$AZ" group create \
    --name "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none 2>/dev/null || true
echo "  Done."
echo ""

# 3. Create App Service plan (Free tier)
echo "  [3/5] Creating App Service plan (Free tier)..."
"$AZ" appservice plan create \
    --name "${APP_NAME}-plan" \
    --resource-group "$RESOURCE_GROUP" \
    --sku "$SKU" \
    --is-linux \
    --output none
echo "  Done."
echo ""

# 4. Create web app
echo "  [4/5] Creating web app: $APP_NAME..."
"$AZ" webapp create \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --plan "${APP_NAME}-plan" \
    --runtime "PYTHON:${PYTHON_VERSION}" \
    --startup-file "startup.sh" \
    --output none
echo "  Done."
echo ""

# 5. Deploy code via zip
echo "  [5/5] Packaging and deploying..."

# Create zip of the app (exclude unnecessary files)
cd "$(dirname "$0")"
TMPZIP=$(mktemp /tmp/minigames-XXXXXX.zip)
zip -r "$TMPZIP" . \
    -x ".git/*" \
    -x "*.db" \
    -x "__pycache__/*" \
    -x "*.pyc" \
    -x "deploy_azure.sh" \
    -x "DEPLOY.md" \
    -x ".deployment" \
    > /dev/null

"$AZ" webapp deploy \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --src-path "$TMPZIP" \
    --type zip \
    --output none

rm -f "$TMPZIP"
echo "  Done."
echo ""

# Get the URL
URL=$("$AZ" webapp show \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "defaultHostName" -o tsv)

# ---------------------------------------------------------------------------
# Smoke the deploy before claiming success.
#
# gunicorn 23.0.0 -> 26.0.0 (PR #30, merged 2026-08-20) is the one bump in that PR
# that NO test covers: no workflow installs newsletter-games/requirements.txt, and
# news-dashboard.yml rsyncs with --exclude='requirements.txt'. So CI cannot catch a
# gunicorn regression here; only this deploy can.
#
# Analysis clears the obvious failure modes. startup.sh runs the DEFAULT sync worker
# (no --worker-class, and no eventlet/gevent anywhere in newsletter-games/), so 26's
# headline breaking change, eventlet worker removal, does not apply. Its three flags
# (--bind, --timeout, --workers) are all core and unchanged. PyPI reports
# requires_python ">=3.10" for 26.0.0 and PYTHON_VERSION above is exactly "3.10", so
# pip will not refuse at SCM_DO_BUILD_DURING_DEPLOYMENT. Note that is the FLOOR, not
# headroom: a future major that raises the floor breaks this deploy.
#
# What analysis cannot clear is 26's stricter RFC 9112 request-target validation and
# its dropped body framing on HEAD/204/304. Only a live request rules those out, so
# make one rather than printing SUCCESS and assuming.
#
# The retry loop is load-bearing, not defensive padding: `az webapp deploy` returns
# before App Service has restarted the container, so an immediate single request gets
# a cold-start 503 and would read as a gunicorn regression that is not there.
echo "  Smoke test (App Service cold start, up to 2 min)..."
CODE=""
for _ in $(seq 1 12); do
    CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "https://$URL/" 2>/dev/null) || CODE=""
    [ "$CODE" = "200" ] && break
    sleep 10
done

if [ "$CODE" != "200" ]; then
    echo ""
    echo "  ========================================"
    echo "  SMOKE TEST FAILED"
    echo ""
    echo "  URL:  https://$URL"
    echo "  GET / returned: ${CODE:-no response} after ~2 minutes."
    echo ""
    echo "  The deploy itself succeeded, so the app is up but not serving."
    echo "  Logs:     az webapp log tail --name kpmg-minigames --resource-group kpmg-minigames-rg"
    echo "  Rollback: pin gunicorn==23.0.0 in newsletter-games/requirements.txt, redeploy."
    echo "  ========================================"
    exit 1
fi

echo "  Smoke OK: GET / returned 200."
echo ""
# ---------------------------------------------------------------------------

echo "  ========================================"
echo "  DEPLOYED SUCCESSFULLY!"
echo ""
echo "  URL:  https://$URL"
echo ""
echo "  Share this URL firm-wide."
echo "  ========================================"
echo ""
echo "  Monthly game rotation:"
echo "    az webapp ssh --name $APP_NAME --resource-group $RESOURCE_GROUP"
echo "    cd /home/site/wwwroot && python manage.py activate 2026-05"
echo ""

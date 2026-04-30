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

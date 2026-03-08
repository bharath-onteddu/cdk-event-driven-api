#!/bin/bash

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAMBDA_BASE="$SCRIPT_DIR/service/lambda-functions"
NO_DEPLOY=false

# Parse arguments
if [ "$1" == "--no-deploy" ]; then
  NO_DEPLOY=true
fi

echo "Building api-handler..."
cd "$LAMBDA_BASE/api-handler"
npm install && npm run build

echo "Building consumer1..."
cd "$LAMBDA_BASE/consumer1"
npm install && npm run build

echo "Building consumer2..."
cd "$LAMBDA_BASE/consumer2"
npm install && npm run build

echo "Building CDK stack..."
cd "$SCRIPT_DIR"
npm run build

# Skip interactive approval if --no-deploy flag is set
if [ "$NO_DEPLOY" == true ]; then
  echo "✓ Build completed (deploy skipped)"
  exit 0
fi

echo ""
echo "=========================================="
echo "Checking for infrastructure changes..."
echo "=========================================="
cdk diff

echo ""
echo "=========================================="
read -p "Do you want to deploy these changes? (yes/no): " approval

if [ "$approval" != "yes" ]; then
  echo "Deployment cancelled."
  exit 0
fi

echo "Deploying to AWS..."
cdk deploy --require-approval never


echo "✓ All builds and deployment completed successfully!"
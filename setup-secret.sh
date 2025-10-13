#!/bin/bash
# mouse-detection/setup-secrets.sh

set -e

PROJECT_ID=$(gcloud config get-value project)

echo "🔐 Creating secrets for mouse-detection project..."

# Function to create or update secret
create_secret() {
  local secret_name=$1
  local secret_value=$2
  
  if gcloud secrets describe $secret_name &>/dev/null; then
    echo "Updating existing secret: $secret_name"
    echo -n "$secret_value" | gcloud secrets versions add $secret_name --data-file=-
  else
    echo "Creating new secret: $secret_name"
    echo -n "$secret_value" | gcloud secrets create $secret_name --data-file=-
  fi
}

# Shared secrets
create_secret "GCS_BUCKET" "mouse-video-bucket"
create_secret "MONGO_URI" "mongodb+srv://YOUR_MONGODB_URI"
create_secret "GCP_PROJECT_ID" "$PROJECT_ID"

# Backend secrets
create_secret "JWT_SECRET" "YOUR_JWT_SECRET"
create_secret "PROGRESS_SECRET" "YOUR_PROGRESS_SECRET"
create_secret "GOOGLE_CLIENT_ID" "YOUR_GOOGLE_CLIENT_ID"
create_secret "GOOGLE_CLIENT_EMAIL" "mouse-detection-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# Firebase secrets
create_secret "FIREBASE_API_KEY" "YOUR_FIREBASE_API_KEY"
create_secret "FIREBASE_AUTH_DOMAIN" "YOUR_FIREBASE_AUTH_DOMAIN"
create_secret "FIREBASE_PROJECT_ID" "YOUR_FIREBASE_PROJECT_ID"
create_secret "FIREBASE_STORAGE_BUCKET" "YOUR_FIREBASE_STORAGE_BUCKET"
create_secret "FIREBASE_MESSAGING_SENDER_ID" "YOUR_FIREBASE_MESSAGING_SENDER_ID"
create_secret "FIREBASE_APP_ID" "YOUR_FIREBASE_APP_ID"
create_secret "FIREBASE_MEASUREMENT_ID" "YOUR_FIREBASE_MEASUREMENT_ID"

echo "✅ All secrets created/updated!"
echo ""
echo "📋 List of secrets:"
gcloud secrets list
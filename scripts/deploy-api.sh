#!/usr/bin/env bash
set -euo pipefail

repo=$(git rev-parse --show-toplevel)
source_dir=$(mktemp -d)
trap 'rm -rf -- "$source_dir"' EXIT

# Upload the checked commit without local files or the runner's credentials.
git -C "$repo" archive HEAD:backend | tar -x -C "$source_dir"

gcloud run deploy pull-api \
  --project=congress-pull \
  --region=us-east1 \
  --source="$source_dir" \
  --port=8080 \
  --update-env-vars=FIREBASE_PROJECT_ID=congress-pull \
  --set-build-env-vars='GOOGLE_ENTRYPOINT=uvicorn app.main:app --host 0.0.0.0 --port 8080' \
  --quiet \
  "$@"

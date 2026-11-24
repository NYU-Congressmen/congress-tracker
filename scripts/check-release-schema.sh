#!/usr/bin/env bash
set -euo pipefail

expected=${1:?Pass the release Alembic revision}
if [[ ! "$expected" =~ ^[A-Za-z0-9_-]+$ ]]; then
  printf 'Invalid release Alembic revision.\n' >&2
  exit 1
fi

cloud=(--project=congress-pull --region=us-east1)
job=pull-schema-check

# Compare secret references without fetching either secret value.
secret_ref() {
  jq -er '
    [.. | objects | select(.name == "DATABASE_URL") | .valueFrom.secretKeyRef
      | select(.name and .key) | [.name, .key]]
    | if length != 1 then error("Expected one DATABASE_URL secret reference")
      elif (.[0][1] | test("^[1-9][0-9]*$") | not)
      then error("DATABASE_URL needs a numbered Secret Manager version")
      else .[0] | @tsv end
  '
}

api_database=$(gcloud run services describe pull-api "${cloud[@]}" --format=json | secret_ref)
job_database=$(gcloud run jobs describe "$job" "${cloud[@]}" --format=json | secret_ref)
if [[ "$api_database" != "$job_database" ]]; then
  printf 'The Cloud Run API and schema check use different database secret versions.\n' >&2
  exit 1
fi

printf 'Checking Supabase for Alembic revision %s.\n' "$expected"
if ! gcloud run jobs execute "$job" "${cloud[@]}" --args="$expected" --wait; then
  printf 'Supabase readiness check failed. See the Cloud Run execution logs for details.\n' >&2
  exit 1
fi

---
name: Cloud Run env var update — use --env-vars-file not --set-env-vars
description: Using --set-env-vars with a single key wipes all other env vars; always use --env-vars-file with the full set
---

## Rule
Never use `gcloud run services update --set-env-vars KEY=VALUE` with a single key.
It REPLACES the entire env var set, wiping all others.

## How to apply
Always update Cloud Run env vars via `--env-vars-file=/tmp/envvars.yaml` containing ALL vars.
Build the YAML file in Python using `json.dumps(value)` for each value (safe quoting for any content including large JSON blobs).

**Why:** We wiped Firebase, Anthropic, Admin, Square, and Resend vars this way, causing 503s on every route that touches Firestore.

## Safe pattern
```python
lines = []
for k, v in env_vars.items():
    lines.append(f"{k}: {json.dumps(v)}")
with open('/tmp/envvars.yaml', 'w') as f:
    f.write('\n'.join(lines) + '\n')
# Then:
# gcloud run services update api --region us-central1 --project $PROJECT --env-vars-file=/tmp/envvars.yaml
```

## Full var list (as of api-00052)
NODE_ENV, APP_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT (full SA JSON),
ANTHROPIC_API_KEY, ADMIN_MASTER_SECRET, SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID,
SQUARE_WEBHOOK_SIGNATURE_KEY, SQUARE_APPLICATION_ID, SQUARE_ENVIRONMENT, RESEND_API_KEY.
Plus Cloud Run secret refs: OPENAI_API_KEY, GEMINI_API_KEY, XAI_API_KEY (untouched by --env-vars-file).

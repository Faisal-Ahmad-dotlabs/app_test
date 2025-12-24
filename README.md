# OAuth Pipeline (Sage, eBay, Amazon) → BigQuery

A minimal app to capture OAuth tokens from Sage, eBay and Amazon and persist them into BigQuery for automated use in Python data pipelines.

## What this repo contains
- `server.js` - Express backend that provides:
  - `/auth/:provider` to start OAuth flows for `sage`, `ebay`, and `amazon`
  - `/oauth/callback/:provider` to exchange code for tokens and save into BigQuery
  - `/status/:provider` simple debug endpoint (redacts access token by default)
- `public/index.html` - simple frontend that opens the auth flow for each provider
- `python/` - helper modules that use tokens stored in BigQuery to call Sage API (`sage_client.py`) and insert/read tokens (`bigquery_tokens.py`)

## BigQuery table
This app expects a table with the following fields (your SQL looked correct):

```
CREATE TABLE IF NOT EXISTS auto-ml-ai.shopify.oauth_tokens (
  provider STRING,
  access_token STRING,
  refresh_token STRING,
  expires_in INT64,
  expires_at TIMESTAMP,
  scope STRING,
  obtained_at TIMESTAMP,
  raw STRING
);
```

No changes are required if your table matches those column types.

## Setup (local)
1. Copy `.env.example` to `.env` and fill the values (client IDs/secrets, project/dataset/table, and PUBLIC_BASE_URL).
2. For local runs, set `GOOGLE_APPLICATION_CREDENTIALS` to the path of your service account JSON file (or paste the JSON as an env var as described).
3. `npm install`
4. `npm run dev` and visit `http://localhost:3000`

## Redirect URLs to register in provider console
- Sage: `${PUBLIC_BASE_URL}/oauth/callback/sage`
- eBay: `${PUBLIC_BASE_URL}/oauth/callback/ebay`
- Amazon: `${PUBLIC_BASE_URL}/oauth/callback/amazon`

> Sage often requires a fully qualified `https://` redirect URL (cannot be `localhost` for production). Use your deployed domain (Vercel/Firebase) for production setup.

## Deploying
- Vercel: set environment variables (including service account JSON as `GOOGLE_APPLICATION_CREDENTIALS` or provide a key file via Secrets). Deploy static `public/` and server as API (this repo uses an Express server; for Vercel you can convert endpoints into serverless functions or deploy as a plain Node service).
- Firebase Hosting + Cloud Functions: deploy `server.js` as an HTTP function and `public/` as hosting.

## Notes & recommendations
- The backend supports `GOOGLE_APPLICATION_CREDENTIALS` either as a JSON string (convenient for serverless envs) or as a filepath to a service account key.
- The Sage auth URL builder is now robust and will add `?` or `&` as needed based on your `SAGE_AUTH_URL` value.
- Tokens are saved to BigQuery; your Python pipeline (`python/run_sage_pipeline.py`) reads tokens from BigQuery and automatically refreshes them when needed.

## Security
- Keep client secrets and service account keys out of source control. Use environment variables or your cloud provider's secret manager.

---
If you want, I can:
- Add Vercel-friendly API route wrappers
- Add GitHub Actions for deploy
- Add a small admin page showing connection status per provider


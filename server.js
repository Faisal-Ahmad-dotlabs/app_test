// server.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const axios = require('axios');
const { BigQuery } = require('@google-cloud/bigquery');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- BigQuery client ----------
// Support either a JSON string in the env var or a path to the service account key file.
const bqOptions = { projectId: process.env.GCP_PROJECT_ID };
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    // If the env var contains JSON (e.g. when deployed to Vercel), parse it to credentials
    bqOptions.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  } catch (e) {
    // Otherwise treat it as a keyFilename path
    bqOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
}
const bigquery = new BigQuery(bqOptions);

const datasetId = process.env.BQ_DATASET || 'etl_tokens';
const tableId = process.env.BQ_TABLE || 'oauth_tokens';

// Serve static frontend from /public
app.use(express.static(path.join(__dirname, 'public')));

// Helper: insert row into BigQuery (one row per token event)
async function saveTokenToBigQuery(provider, tokenData) {
  const now = new Date();
  const expiresIn = tokenData.expires_in || tokenData.expires || null;

  // Compute expires_at if possible
  let expiresAt = null;
  if (expiresIn != null) {
    const expiresDate = new Date(now.getTime() + expiresIn * 1000);
    expiresAt = expiresDate.toISOString();
  }

  const rows = [
    {
      provider,
      access_token: tokenData.access_token || null,
      refresh_token: tokenData.refresh_token || null,
      expires_in: expiresIn,
      expires_at: expiresAt,
      scope: tokenData.scope || null,
      obtained_at: now.toISOString(),
      raw: JSON.stringify(tokenData),
    },
  ];

  await bigquery.dataset(datasetId).table(tableId).insert(rows);
  console.log(`Saved ${provider} token row to BigQuery`);
}

// ---------- AUTH URL builders ----------

function buildSageAuthUrl(state) {
  // Be permissive: allow SAGE_AUTH_URL to be either the base endpoint or include a ?existing=params
  let baseUrl = process.env.SAGE_AUTH_URL || 'https://oauth.accounting.sage.com/authorize';
  const redirectUri = `${process.env.PUBLIC_BASE_URL}/oauth/callback/sage`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SAGE_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: process.env.SAGE_SCOPE || 'full_access',
    state,
  });
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${params.toString()}`;
}

function buildEbayAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.EBAY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.EBAY_REDIRECT_URI,
    scope: process.env.EBAY_SCOPE,
    state,
  });
  return `${process.env.EBAY_AUTH_URL}?${params.toString()}`;
}

function buildAmazonAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.AMZ_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.AMZ_REDIRECT_URI,
    scope: process.env.AMZ_SCOPE,
    state,
  });
  return `${process.env.AMZ_AUTH_URL}?${params.toString()}`;
}

// ---------- CODE → TOKEN exchangers ----------

async function exchangeSageCodeForToken(code) {
  const tokenUrl = process.env.SAGE_TOKEN_URL;
  const redirectUri = `${process.env.PUBLIC_BASE_URL}/oauth/callback/sage`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: process.env.SAGE_CLIENT_ID,
    client_secret: process.env.SAGE_CLIENT_SECRET,
    redirect_uri: redirectUri,
  });

  const resp = await axios.post(tokenUrl, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
  });

  return resp.data;
}

async function exchangeEbayCodeForToken(code) {
  const tokenUrl = process.env.EBAY_TOKEN_URL;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.EBAY_REDIRECT_URI,
  });

  const basic = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString('base64');

  const resp = await axios.post(tokenUrl, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
  });

  return resp.data;
}

async function exchangeAmazonCodeForToken(code) {
  const tokenUrl = process.env.AMZ_TOKEN_URL;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: process.env.AMZ_CLIENT_ID,
    client_secret: process.env.AMZ_CLIENT_SECRET,
    redirect_uri: process.env.AMZ_REDIRECT_URI,
  });

  const resp = await axios.post(tokenUrl, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  return resp.data;
}

// ---------- ROUTES ----------

// 1) Start OAuth: /auth/:provider
app.get('/auth/:provider', (req, res) => {
  const { provider } = req.params;
  const state = `state-${provider}-${Date.now()}`;

  let authUrl;
  if (provider === 'sage') {
    authUrl = buildSageAuthUrl(state);
  } else if (provider === 'ebay') {
    authUrl = buildEbayAuthUrl(state);
  } else if (provider === 'amazon') {
    authUrl = buildAmazonAuthUrl(state);
  } else {
    return res.status(400).send('Unknown provider');
  }

  return res.redirect(authUrl);
});

// 2) OAuth callback: /oauth/callback/:provider
app.get('/oauth/callback/:provider', async (req, res) => {
  const { provider } = req.params;
  const { code, error, error_description } = req.query;

  if (error) {
    return res
      .status(400)
      .send(`Error from ${provider}: ${error_description || error}`);
  }
  if (!code) {
    return res.status(400).send('Missing ?code in callback');
  }

  try {
    let tokenData;
    if (provider === 'sage') {
      tokenData = await exchangeSageCodeForToken(code);
    } else if (provider === 'ebay') {
      tokenData = await exchangeEbayCodeForToken(code);
    } else if (provider === 'amazon') {
      tokenData = await exchangeAmazonCodeForToken(code);
    } else {
      return res.status(400).send('Unknown provider');
    }

    await saveTokenToBigQuery(provider, tokenData);

    res.send(`
      <html>
        <head><title>${provider} Connected</title></head>
        <body style="font-family: system-ui, sans-serif;">
          <h1>${provider.toUpperCase()} connected ✅</h1>
          <p>Tokens have been saved into BigQuery table: <code>${datasetId}.${tableId}</code>.</p>
          <p>You can close this tab now.</p>
          <a href="/">Back to home</a>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Callback error:', err.response?.data || err.message);
    res
      .status(500)
      .send(`Failed to exchange code or save tokens for ${provider}.`);
  }
});

// Debug/status endpoint: returns latest token row for a provider (access token is redacted)
app.get('/status/:provider', async (req, res) => {
  const { provider } = req.params;
  try {
    const query = `
      SELECT provider, access_token, refresh_token, expires_in, expires_at, scope, obtained_at, raw
      FROM \`${process.env.GCP_PROJECT_ID}.${datasetId}.${tableId}\`
      WHERE provider = @provider
      ORDER BY obtained_at DESC
      LIMIT 1
    `;

    const options = { query, params: { provider } };
    const [job] = await bigquery.createQueryJob(options);
    const [rows] = await job.getQueryResults();
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'no token found for provider' });
    }

    const row = rows[0];
    // redact access token by default
    const out = {
      provider: row.provider,
      access_token: row.access_token ? 'REDACTED' : null,
      refresh_token: !!row.refresh_token,
      expires_in: row.expires_in,
      expires_at: row.expires_at,
      scope: row.scope,
      obtained_at: row.obtained_at,
      raw: row.raw,
    };

    res.json(out);
  } catch (err) {
    console.error('Status error:', err);
    res.status(500).send('Failed to query BigQuery');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

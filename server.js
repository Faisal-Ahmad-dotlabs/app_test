// server.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const axios = require('axios');
const { BigQuery } = require('@google-cloud/bigquery');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- BigQuery client ----------
// We support two modes:
// 1) GOOGLE_SERVICE_ACCOUNT_JSON  = full JSON of the service account (recommended on Railway)
// 2) GOOGLE_APPLICATION_CREDENTIALS = path OR JSON (for local dev / legacy)
const bqOptions = { projectId: process.env.GCP_PROJECT_ID };

if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  // Preferred for Railway: full JSON in a single env var
  try {
    bqOptions.credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    console.log('Loaded BigQuery credentials from GOOGLE_SERVICE_ACCOUNT_JSON');
  } catch (err) {
    console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', err.message);
  }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // Backwards-compatible behaviour
  try {
    // If the env var contains JSON, parse it
    bqOptions.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    console.log('Loaded BigQuery credentials from GOOGLE_APPLICATION_CREDENTIALS (JSON)');
  } catch (e) {
    // Otherwise treat it as a keyFilename path
    bqOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    console.log('Using GOOGLE_APPLICATION_CREDENTIALS as keyFilename:', bqOptions.keyFilename);
  }
}

const bigquery = new BigQuery(bqOptions);

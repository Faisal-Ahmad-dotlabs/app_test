# python/config.py
import os
from dotenv import load_dotenv

# Load from .env if present (for local dev)
load_dotenv()

GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "your_gcp_project_id")
BQ_DATASET = os.environ.get("BQ_DATASET", "etl_tokens")
BQ_TABLE = os.environ.get("BQ_TABLE", "oauth_tokens")

# Sage OAuth / API endpoints
SAGE_TOKEN_URL = os.environ.get("SAGE_TOKEN_URL", "https://oauth.accounting.sage.com/token")
SAGE_API_BASE = os.environ.get("SAGE_API_BASE", "https://api.accounting.sage.com/v3.1")

# Client credentials (same as Node uses)
SAGE_CLIENT_ID = os.environ.get("SAGE_CLIENT_ID")
SAGE_CLIENT_SECRET = os.environ.get("SAGE_CLIENT_SECRET")
#os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service_account.json"
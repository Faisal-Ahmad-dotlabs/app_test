# python/sage_client.py
from datetime import datetime, timezone, timedelta
import requests

from .config import (
    SAGE_TOKEN_URL,
    SAGE_CLIENT_ID,
    SAGE_CLIENT_SECRET,
    SAGE_API_BASE,
)
from .bigquery_tokens import get_latest_token, insert_token


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _is_token_valid(expires_at) -> bool:
    if expires_at is None:
        return False
    # Refresh 1 minute before expiry
    margin = timedelta(seconds=60)
    return expires_at - margin > _now_utc()


def _refresh_sage_token(refresh_token: str) -> dict:
    """
    Call Sage token endpoint with refresh_token to get new access_token.
    """
    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": SAGE_CLIENT_ID,
        "client_secret": SAGE_CLIENT_SECRET,
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    }
    resp = requests.post(SAGE_TOKEN_URL, data=data, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()


def get_valid_sage_access_token() -> str:
    """
    Returns a valid Sage access_token.
    If the last one is expired, refreshes it automatically and stores new row in BigQuery.
    """
    row = get_latest_token("sage")
    if not row:
        raise RuntimeError(
            "No Sage token found in BigQuery. "
            "You must complete the OAuth flow once via the web app."
        )

    expires_at = row["expires_at"]
    refresh_token = row["refresh_token"]

    if _is_token_valid(expires_at):
        return row["access_token"]

    if not refresh_token:
        raise RuntimeError("No refresh_token available to refresh Sage access token.")

    # Refresh
    new_data = _refresh_sage_token(refresh_token)

    # If new response doesn't contain a new refresh_token, keep the old one
    if "refresh_token" not in new_data and refresh_token:
        new_data["refresh_token"] = refresh_token

    insert_token("sage", new_data)

    return new_data["access_token"]


def get_sage_headers() -> dict:
    """
    Headers to call Sage API with a valid access token.
    """
    token = get_valid_sage_access_token()
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }


def fetch_sage_customers() -> dict:
    """
    Example API call: fetch Sage contacts/customers.
    """
    headers = get_sage_headers()
    url = f"{SAGE_API_BASE}/contacts"
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()

# python/bigquery_tokens.py
from typing import Optional, Dict
from google.cloud import bigquery
from datetime import datetime, timezone
from .config import GCP_PROJECT_ID, BQ_DATASET, BQ_TABLE

client = bigquery.Client(project=GCP_PROJECT_ID)
TABLE_REF = f"{GCP_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}"


def get_latest_token(provider: str) -> Optional[Dict]:
    """
    Get the most recent token row for a provider from BigQuery.
    Returns a dict or None if no row found.
    """
    query = f"""
      SELECT *
      FROM `{TABLE_REF}`
      WHERE provider = @provider
      ORDER BY obtained_at DESC
      LIMIT 1
    """
    job = client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("provider", "STRING", provider)
            ]
        ),
    )
    rows = list(job.result())
    if not rows:
        return None

    row = rows[0]

    # Normalize expires_at to timezone-aware datetime if possible
    expires_at = row.expires_at
    if expires_at is not None:
        # If BigQuery returned a string, try parsing ISO format
        if isinstance(expires_at, str):
            try:
                expires_at = datetime.fromisoformat(expires_at)
            except Exception:
                pass
        # If it's a naive datetime, assume UTC
        if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

    return {
        "provider": row.provider,
        "access_token": row.access_token,
        "refresh_token": row.refresh_token,
        "expires_in": row.expires_in,
        "expires_at": expires_at,
        "scope": row.scope,
        "obtained_at": row.obtained_at,
        "raw": row.raw,
    }


def insert_token(provider: str, token_data: Dict) -> None:
    """
    Insert a new token row to BigQuery (e.g. after refresh).
    token_data should include: access_token, refresh_token, expires_in, scope.
    """
    table = client.get_table(TABLE_REF)

    now = datetime.now(timezone.utc)
    expires_in = token_data.get("expires_in")
    expires_at = None
    if expires_in is not None:
        expires_at_ts = now.timestamp() + int(expires_in)
        expires_at = datetime.fromtimestamp(expires_at_ts, tz=timezone.utc)

    row = {
        "provider": provider,
        "access_token": token_data.get("access_token"),
        "refresh_token": token_data.get("refresh_token"),
        "expires_in": token_data.get("expires_in"),
        "expires_at": expires_at,
        "scope": token_data.get("scope"),
        "obtained_at": now,
        "raw": str(token_data),
    }

    errors = client.insert_rows(table, [row])
    if errors:
        raise RuntimeError(f"Error inserting token row: {errors}")

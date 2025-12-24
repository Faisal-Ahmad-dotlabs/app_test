# python/run_sage_pipeline.py
from pprint import pprint
from google.cloud import bigquery

from .config import GCP_PROJECT_ID
from .sage_client import fetch_sage_customers


def load_to_bigquery(data: dict, table_fqn: str) -> None:
    """
    Example loader: writes Sage contacts into a separate BigQuery table
    like `your_project.etl_sage.sage_contacts`.
    Adjust schema + transformation to your needs.
    """
    client = bigquery.Client(project=GCP_PROJECT_ID)

    items = data.get("$items", []) or data.get("items", [])
    if not items:
        print("No contacts to load.")
        return

    rows_to_insert = []
    for item in items:
        email = None
        if isinstance(item.get("email"), dict):
            email = item["email"].get("address")

        rows_to_insert.append(
            {
                "id": item.get("id"),
                "name": item.get("name"),
                "contact_type": item.get("contact_type"),
                "email": email,
            }
        )

    table = client.get_table(table_fqn)
    errors = client.insert_rows(table, rows_to_insert)
    if errors:
        print("Errors while inserting rows:", errors)
    else:
        print(f"Inserted {len(rows_to_insert)} rows into {table_fqn}")


def main():
    # 1) Extract from Sage (tokens handled automatically)
    data = fetch_sage_customers()
    print("Sample received from Sage:")
    pprint(data.get("$items", [])[:2])

    # 2) Load into BigQuery (you create this table separately)
    contacts_table = f"{GCP_PROJECT_ID}.etl_sage.sage_contacts"
    load_to_bigquery(data, contacts_table)


if __name__ == "__main__":
    main()

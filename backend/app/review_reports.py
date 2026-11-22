"""List and dismiss reports from the private review queue."""

import argparse
import json

from app.db import fetch_all, fetch_one


def main() -> int:
    """List unresolved reports or dismiss one by its report ID."""
    parser = argparse.ArgumentParser(description="Manage Pull review reports.")
    commands = parser.add_subparsers(dest="command", required=True)
    listing = commands.add_parser("list", help="List unresolved reports.")
    listing.add_argument("--after", type=int, default=0)
    dismiss = commands.add_parser("dismiss", help="Dismiss one report.")
    dismiss.add_argument("report_id", type=int)
    args = parser.parse_args()

    if args.command == "list":
        rows = fetch_all(
            """
            SELECT report_id, review_id, reason, details, created_at
            FROM review_reports
            WHERE dismissed_at IS NULL AND report_id > %s
            ORDER BY report_id LIMIT 100
            """,
            (args.after,),
        )
        print(json.dumps(rows, default=str, indent=2))
        return 0

    row = fetch_one(
        """
        UPDATE review_reports
        SET dismissed_at = COALESCE(dismissed_at, now())
        WHERE report_id = %s RETURNING report_id
        """,
        (args.report_id,),
    )
    if row is None:
        print("Report not found.")
        return 1
    print(f"Dismissed report {row['report_id']}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

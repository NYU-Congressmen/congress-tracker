"""Seed the sample demo account and sample constituents' activity on real bills.

Every seeded account has users.is_sample set, so its stances and reviews appear only to a viewer
signed in with a sample account. Rerunning replaces the previous seed with the same records.
The filter lives in the API, so the seed runs against a database only after the API serving it
includes the is_sample filter, or the sample activity appears in public totals.

    uv run --directory backend python -m app.demo_seed
"""

import argparse
import random
from datetime import UTC, datetime, timedelta
from itertools import cycle
from uuid import NAMESPACE_URL, uuid5

from psycopg.types.json import Jsonb

from app.config import settings
from app.db import connect

# The Firebase project's fictional test number signs in as this account.
VIEWER_UID = "9bVp6U75ItXOcuVGapdsz3hcTX63"
VIEWER_PHONE = "+16505550101"
VIEWER_PROFILE = {
    "username": "maya",
    "district": {"state": "NY", "district": 12, "method": "address"},
    "topics": [3, 9, 4],
    "socials": [{"platform": "bluesky", "handle": "maya.example"}],
}
VIEWER_CUSTOM_TOPICS = ["Entry-level tech jobs", "Student loan relief"]

# Sample constituents per district, weighted toward the viewer's district.
DISTRICTS = [
    ("NY", 12, 220),
    ("NY", 10, 80),
    ("NY", 14, 60),
    ("CA", 34, 80),
    ("TX", 7, 60),
    ("IL", 7, 50),
    ("FL", 27, 50),
    ("OH", 3, 50),
]
# Fictional 555-01XX numbers keep sample phones apart from real accounts.
AREA_CODES = ["202", "212", "213", "310", "312", "415", "512", "617", "713", "718"]

# Each bill's chance of support and of opposition, with the rest unsure, and its story theme.
BILLS = {
    "119-s-3108": (0.68, 0.17, "ai"),
    "119-hr-9352": (0.66, 0.19, "ai"),
    "119-hr-1": (0.38, 0.52, "general"),
    "119-hr-1190": (0.55, 0.25, "jobs"),
    "119-hr-10159": (0.48, 0.14, "general"),
    "119-hr-5764": (0.61, 0.21, "ai"),
    "119-hr-1770": (0.57, 0.18, "ai"),
    "119-hr-8881": (0.52, 0.27, "ai"),
    "119-hr-2550": (0.63, 0.24, "jobs"),
    "119-hr-7342": (0.59, 0.26, "jobs"),
    "119-hr-6644": (0.71, 0.16, "housing"),
    "119-hr-965": (0.77, 0.09, "housing"),
    "119-hr-5184": (0.54, 0.31, "housing"),
    "119-hr-1069": (0.46, 0.38, "education"),
    "119-hr-2616": (0.35, 0.51, "education"),
    "119-hr-1049": (0.49, 0.29, "education"),
}
AI_BILLS = {"119-s-3108", "119-hr-9352"}

STORIES = {
    ("ai", "support"): [
        (
            "I graduate in May and every internship listing now mentions AI. Clear data on which "
            "jobs are changing would help me plan."
        ),
        (
            "My entry-level role was reorganized around an AI tool this year. Reporting on job "
            "impacts is a reasonable first step."
        ),
        (
            "I teach community college students who ask me which careers will still exist. They "
            "deserve real numbers."
        ),
        "My paralegal program changed half its courses this year, and nobody can say why.",
        "I was laid off from a call center after it moved to an AI system. Track this.",
        (
            "My younger brother is choosing a major now. Better data on which jobs are shrinking "
            "would help him."
        ),
        "Companies already measure what AI saves them. Workers deserve the same numbers.",
        "I manage a small design team, and I want facts before we restructure anything.",
        "Our union keeps asking for this information. A federal report would settle it.",
    ],
    ("ai", "oppose"): [
        (
            "I run a small software shop, and more federal reporting tends to land on businesses "
            "like mine."
        ),
        "I would rather Congress fund retraining directly than start with another study.",
        "A report every year will be out of date before anyone reads it.",
        "I worry the survey questions will make every tool look like a job cut.",
        "The Labor Department already has job data. Fund that instead of a new report.",
    ],
    ("ai", "unsure"): [
        (
            "I support transparency, but I want to know who collects the data and how it stays "
            "private."
        ),
        "I like the idea, but I want to see whether small employers have to file anything.",
        "Measuring job changes makes sense. I am less sure what Congress will do with it.",
        "I would support this if the data were broken down by region and age.",
    ],
    ("jobs", "support"): [
        (
            "Steady, well-paid work is the difference between renting with roommates and living "
            "on my own."
        ),
        "My family's business could hire two more people with better access to capital.",
        "I started a cleaning business last year, and a small loan would let me hire.",
    ],
    ("jobs", "oppose"): [
        "I worry the costs fall on small employers who are already stretched.",
        "Programs like this tend to help the businesses that already have accountants.",
    ],
    ("jobs", "unsure"): [
        "I like the goal, and I want to see how it works for part-time and gig workers.",
    ],
    ("housing", "support"): [
        (
            "Half my paycheck goes to rent. Anything that adds homes near transit helps people "
            "like me."
        ),
        (
            "My uncle is a veteran who spent a winter without stable housing. This matters to our"
            " family."
        ),
    ],
    ("housing", "oppose"): [
        "I want more housing too, but I am not convinced this approach reaches renters quickly.",
        "New buildings near me have all been luxury units. I doubt this changes that.",
    ],
    ("housing", "unsure"): [
        "I need to understand how this changes local zoning decisions before I decide.",
        "My landlord says this would raise rents during construction. I want to check that.",
    ],
    ("education", "support"): [
        "As a parent, I want more say in what happens at my kids' school.",
    ],
    ("education", "oppose"): [
        "I am a teacher, and I think these decisions belong with local districts.",
    ],
    ("education", "unsure"): [
        "I see arguments on both sides and want to hear from teachers in my district.",
    ],
    ("general", "support"): [
        "I read the summary and the changes look practical for my community.",
    ],
    ("general", "oppose"): [
        "The cost is too high for what it delivers in my district.",
    ],
    ("general", "unsure"): [
        "This bill is long, and I am still working through what it changes.",
    ],
}

VIEWER_REVIEWS = [
    (
        "119-s-3108",
        "support",
        (
            "My group chat keeps asking how we get experience if the jobs that give us experience"
            " are changing. I want Congress to measure it first."
        ),
        True,
        True,
    ),
    ("119-hr-9352", "support", None, False, True),
    ("119-hr-6644", "unsure", None, False, False),
]
VIEWER_CALLS = [
    ("119-hr-9352", "N000002", "Asked whether the office supports the House version.", 3),
    ("119-s-3108", "S000148", "Left a voicemail asking for the senator's position.", 2),
    ("119-s-3108", "G000555", None, 1),
]


def sample_accounts(rng: random.Random) -> list[tuple[str, str, str, int]]:
    """Return each sample constituent's uid, fictional phone, state and district."""
    accounts = []
    for state, district, count in DISTRICTS:
        for _ in range(count):
            index = len(accounts)
            phone = f"+1{AREA_CODES[index // 100]}55501{index % 100:02d}"
            accounts.append((f"sample-{index:04d}", phone, state, district))
    rng.shuffle(accounts)
    return accounts


def sample_reviews(rng: random.Random, accounts, bills: list[str]) -> list[tuple]:
    """Return sample stances, with some stories shared publicly or with the brief."""
    now = datetime.now(UTC)
    reviews = []
    # Each theme and stance deals its stories in a shuffled rotation, so neighboring reviews
    # rarely repeat one.
    decks = {key: cycle(rng.sample(stories, len(stories))) for key, stories in STORIES.items()}
    for uid, _, state, district in accounts:
        for bill_id in bills:
            # The viewer's district follows the AI jobs bills closely, which fills its view.
            chance = 0.8 if bill_id in AI_BILLS and (state, district) == ("NY", 12) else 0.42
            if rng.random() > chance:
                continue
            support, oppose, theme = BILLS[bill_id]
            roll = rng.random()
            stance = (
                "support" if roll < support else "oppose" if roll < support + oppose else "unsure"
            )
            story = next(decks[(theme, stance)]) if rng.random() < 0.16 else None
            written = now - timedelta(days=rng.uniform(0.2, 21))
            reviews.append(
                (
                    uid,
                    bill_id,
                    stance,
                    story,
                    story is not None and rng.random() < 0.7,
                    story is not None and rng.random() < 0.55,
                    written,
                )
            )
    return reviews


def seed(conn, rng_seed: int = 119) -> dict[str, int]:
    """Replace the sample seed in one transaction and return the number of records written."""
    rng = random.Random(rng_seed)
    bills = [
        row["bill_id"]
        for row in conn.execute(
            "SELECT bill_id FROM bills WHERE bill_id = ANY(%s) ORDER BY bill_id", (list(BILLS),)
        )
    ]
    conn.execute("DELETE FROM users WHERE is_sample AND uid LIKE 'sample-%'")
    conn.execute(
        """
        INSERT INTO users (uid, phone, state, district, is_sample, profile)
        VALUES (%s, %s, 'NY', 12, true, %s)
        ON CONFLICT (uid) DO UPDATE SET is_sample = true, state = 'NY', district = 12,
            profile = EXCLUDED.profile
        """,
        (
            VIEWER_UID,
            VIEWER_PHONE,
            Jsonb({**VIEWER_PROFILE, "updated_at": datetime.now(UTC).isoformat()}),
        ),
    )
    conn.execute("DELETE FROM reviews WHERE uid = %s", (VIEWER_UID,))
    conn.execute("DELETE FROM actions WHERE uid = %s AND action_type = 'call'", (VIEWER_UID,))

    accounts = sample_accounts(rng)
    with conn.cursor() as cursor:
        cursor.executemany(
            (
                "INSERT INTO users (uid, phone, state, district, is_sample) VALUES (%s, %s, %s, "
                "%s, true)"
            ),
            accounts,
        )
        reviews = sample_reviews(rng, accounts, bills)
        cursor.executemany(
            """
            INSERT INTO reviews (uid, bill_id, stance, story, share_publicly, consent_to_share,
                                 created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            [(*review, review[-1]) for review in reviews],
        )
        now = datetime.now(UTC)
        cursor.executemany(
            """
            INSERT INTO reviews (uid, bill_id, stance, story, share_publicly, consent_to_share)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            [(VIEWER_UID, *review) for review in VIEWER_REVIEWS if review[0] in bills],
        )
        cursor.executemany(
            """
            INSERT INTO actions (uid, bill_id, bioguide_id, action_type, request_id, call_note,
                                 created_at)
            VALUES (%s, %s, %s, 'call', %s, %s, %s)
            """,
            [
                (
                    VIEWER_UID,
                    bill_id,
                    member,
                    uuid5(NAMESPACE_URL, f"pull-sample-{bill_id}-{member}"),
                    note,
                    now - timedelta(days=days_ago),
                )
                for bill_id, member, note, days_ago in VIEWER_CALLS
                if bill_id in bills
            ],
        )
    # The seeded stories are written for the demo, so they skip the moderation queue.
    conn.execute(
        "UPDATE reviews r SET moderation_status = 'cleared' FROM users u "
        "WHERE u.uid = r.uid AND u.is_sample"
    )
    return {
        "accounts": len(accounts) + 1,
        "bills": len(bills),
        "reviews": len(reviews) + len(VIEWER_REVIEWS),
    }


def main() -> int:
    """Seed the sample records, then add custom topics and real legislative data for the bills."""
    parser = argparse.ArgumentParser(description="Seed Pull's sample demo account and activity.")
    parser.add_argument("--skip-sync", action="store_true", help="Skip Congress.gov and OpenAI.")
    args = parser.parse_args()
    with connect() as conn:
        counts = seed(conn)
    print(
        f"Seeded {counts['accounts']} sample accounts and {counts['reviews']} stances "
        f"on {counts['bills']} bills."
    )
    if args.skip_sync:
        return 0

    from app.routes.custom_topics import add_topic_vectors, embedding_api_key

    if embedding_api_key():
        with connect() as conn:
            conn.execute("DELETE FROM custom_topics WHERE uid = %s", (VIEWER_UID,))
            topics = {name.casefold(): name for name in VIEWER_CUSTOM_TOPICS}
            saved = add_topic_vectors(conn, VIEWER_UID, topics)
        print(
            "Saved the viewer's custom topics." if saved else "Custom topics could not be embedded."
        )
    else:
        print("No OpenAI embedding key, so the viewer has no custom topics.")

    if settings.congress_api_key:
        from app.sync.client import CongressClient
        from app.sync.graph import sync_followed_graphs
        from app.sync.votes import sync_followed_votes

        with CongressClient(settings.congress_api_key, retry_read_timeouts=True) as client:
            graphs = sync_followed_graphs(client)
            print(f"Fetched cosponsors, committees and related bills for {graphs} bills.")
            print(f"Fetched member positions for {sync_followed_votes(client)} House votes.")
    else:
        print("No Congress.gov key, so House votes and bill relationships were not fetched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

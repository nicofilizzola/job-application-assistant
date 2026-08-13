"""One-off import of `candidatures - jul.csv`. Delete once it has run - see AGENTS.md.

Run from backend/ with: uv run python -m scripts.import_csv

Nothing here guesses. Where the source is ambiguous the row is imported with what can be read
and the ambiguity is printed at the end for a human to settle in the UI.
"""

import csv
import datetime
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import Application, StatusUpdate
from app.schemas import Status

CSV_PATH = Path(__file__).resolve().parents[2] / "candidatures - jul.csv"

# The sheet was kept during 2026 and mostly omits the year.
DEFAULT_YEAR = 2026

MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

# "7 Jul 2026", "6 Jul", "9 July", "17/Jul", "27/July", "12/Aug", "11 aug", "30/07", "11/08"
DATE = re.compile(
    r"(?P<day>\d{1,2})\s*[/ ]\s*(?P<month>[A-Za-z]+|\d{1,2})(?:\s*[/ ]\s*(?P<year>\d{4}))?"
)
LEADING_DATE = re.compile(rf"^\s*(?P<date>{DATE.pattern})\s*(?:[-–]\s*)?(?P<text>\S.*)$")

STATUSES_BY_ETAT = {
    "contact reçu": (Status.CONTACTED,),
    "envoyé": (Status.APPLIED,),
    "1e": (Status.INTERVIEW,),
    "2e": (Status.INTERVIEW,),
    "refus direct": (Status.REJECTED,),
    "no après 1e": (Status.INTERVIEW, Status.REJECTED),
}

SECTOR_FIXES = {"cosulting": "Consulting"}

# Prose that reads like a status change. Never acted on, only reported.
CLOSURE_HINTS = ("no longer interested", "not interested", "plus intéressé", "décliné")


def parse_date(text: str | None) -> datetime.date | None:
    """Returns None rather than a guess when the text is not a date."""
    if not text:
        return None
    match = DATE.match(text.strip())
    if match is None:
        return None

    raw_month = match["month"]
    month = int(raw_month) if raw_month.isdigit() else MONTHS.get(raw_month[:3].lower())
    if month is None:
        return None

    year = int(match["year"]) if match["year"] else DEFAULT_YEAR
    try:
        return datetime.date(year, month, int(match["day"]))
    except ValueError:
        return None


def split_comment(comment: str) -> tuple[str | None, list[tuple[datetime.date, str]]]:
    """Pulls `<date> - <text>` and `<date> <text>` lines out of a comment.

    Only a line that *starts* with a date counts. `entretien le 29/07` is prose about a date,
    not a dated entry, and stays in the comment.
    """
    kept: list[str] = []
    extracted: list[tuple[datetime.date, str]] = []

    for line in comment.splitlines():
        match = LEADING_DATE.match(line)
        date = parse_date(match["date"]) if match else None
        if date is None:
            kept.append(line)
        else:
            extracted.append((date, match["text"].strip()))

    remaining = "\n".join(kept).strip()
    return remaining or None, extracted


def loose_dates(text: str | None) -> list[str]:
    """Dates sitting inside prose, which are never turned into status updates."""
    if not text:
        return []
    return [match.group(0) for match in DATE.finditer(text) if parse_date(match.group(0))]


@dataclass
class Report:
    applications: int = 0
    updates: int = 0
    notes: list[str] = field(default_factory=list)

    def flag(self, company: str, message: str) -> None:
        self.notes.append(f"{company}: {message}")


def build(rows: list[dict], report: Report) -> list[Application]:
    applications = []

    for row in rows:
        company = (row["Boîte"] or "").strip()
        etat = (row["État"] or "").strip()
        statuses = STATUSES_BY_ETAT.get(etat.lower())
        if statuses is None:
            report.flag(company, f"unknown État {etat!r}, row skipped")
            continue

        applied_on = parse_date(row["Candidaté le"])
        if applied_on is None:
            report.flag(company, f"unreadable Candidaté le {row['Candidaté le']!r}, row skipped")
            continue

        comment = (row["Commentaire"] or "").strip()
        # The header ends in a bare comma, so the unnamed eleventh column is keyed on "".
        research = (row.get("") or "").strip()
        if research:
            comment = f"{comment}\n\n{research}".strip()

        remaining, extracted = split_comment(comment)

        # The Etat-derived update always comes first; extracted entries inherit that status,
        # because the prose says what happened but not what it means.
        updates = [StatusUpdate(date=applied_on, status=status) for status in statuses]
        updates += [
            StatusUpdate(date=date, status=statuses[0], note=text) for date, text in extracted
        ]

        rating = None
        if raw_rating := (row["Rating /5"] or "").strip():
            rating = float(raw_rating)
            if not 1 <= rating <= 5 or rating * 2 % 1:
                report.flag(company, f"rating {raw_rating!r} is out of range, dropped")
                rating = None

        sector = (row["secteur"] or "").strip()
        sector = SECTOR_FIXES.get(sector.lower(), sector)

        applications.append(
            Application(
                title=(row["Poste"] or "").strip(),
                company=company,
                sector=sector,
                location=(row["Où"] or "").strip(),
                rating=rating,
                comment=remaining,
                link=(row["Link"] or "").strip() or None,
                updates=updates,
            )
        )

        last_seen = parse_date(row["Dernière maj"])
        if last_seen and last_seen > max(update.date for update in updates):
            report.flag(
                company,
                f"Dernière maj {row['Dernière maj'].strip()!r} is later than any imported update; "
                f"the event it records has no date of its own in the sheet",
            )

        if stranded := loose_dates(remaining):
            report.flag(
                company, f"dates left inside the comment, not made into updates: {stranded}"
            )

        if statuses[-1] not in (Status.REJECTED, Status.WITHDRAWN) and any(
            hint in comment.lower() for hint in CLOSURE_HINTS
        ):
            report.flag(company, "comment reads as closed, but status is never inferred from prose")

        report.applications += 1
        report.updates += len(updates)

    return applications


def main() -> int:
    with CSV_PATH.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    report = Report()
    applications = build(rows, report)

    with SessionLocal() as session:
        existing = session.execute(select(func.count()).select_from(Application)).scalar()
        if existing:
            print(f"Refusing to run: {existing} applications already exist. Truncate first.")
            return 1
        session.add_all(applications)
        session.commit()

    print(f"Imported {report.applications} applications and {report.updates} status updates.")
    print(f"Rows read: {len(rows)}. Rows skipped: {len(rows) - report.applications}.")

    if report.notes:
        print(f"\nNeeds a human ({len(report.notes)}):")
        for note in report.notes:
            print(f"  - {note}")

    return 0


if __name__ == "__main__":
    sys.exit(main())

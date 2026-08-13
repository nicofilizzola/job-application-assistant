import csv
import datetime

import pytest

from app.schemas import Status
from scripts.import_csv import CSV_PATH, Report, build, loose_dates, parse_date, split_comment


@pytest.fixture(scope="module")
def rows() -> list[dict]:
    with CSV_PATH.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


@pytest.fixture(scope="module")
def imported(rows) -> tuple[list, Report]:
    report = Report()
    return build(rows, report), report


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("7 Jul 2026", datetime.date(2026, 7, 7)),
        ("12 Jul 2026", datetime.date(2026, 7, 12)),
        ("6 Jul", datetime.date(2026, 7, 6)),
        ("08 Jul", datetime.date(2026, 7, 8)),
        ("9 July", datetime.date(2026, 7, 9)),
        ("17/Jul", datetime.date(2026, 7, 17)),
        ("13/Jul", datetime.date(2026, 7, 13)),
        ("27/July", datetime.date(2026, 7, 27)),
        ("12/Aug", datetime.date(2026, 8, 12)),
        ("11 Aug", datetime.date(2026, 8, 11)),
        ("11 aug", datetime.date(2026, 8, 11)),
        ("22/jul", datetime.date(2026, 7, 22)),
        ("30/july", datetime.date(2026, 7, 30)),
        ("06/aug", datetime.date(2026, 8, 6)),
        ("30/07", datetime.date(2026, 7, 30)),
        ("11/08", datetime.date(2026, 8, 11)),
        ("3/08", datetime.date(2026, 8, 3)),
    ],
)
def test_every_observed_date_format(raw, expected):
    assert parse_date(raw) == expected


@pytest.mark.parametrize("raw", ["", None, "1 page resume", "réactivation réseau", "32/Jul", "2E"])
def test_non_dates_return_none_rather_than_a_guess(raw):
    assert parse_date(raw) is None


def test_a_leading_date_becomes_an_update():
    remaining, extracted = split_comment("1 page resume\n22/jul - ajouté recruteuse sur lkd")

    assert remaining == "1 page resume"
    assert extracted == [(datetime.date(2026, 7, 22), "ajouté recruteuse sur lkd")]


def test_a_leading_date_without_a_dash_also_counts():
    remaining, extracted = split_comment("30/07 premier appel téléphonique. elle me recontactera")

    assert remaining is None
    assert extracted == [
        (datetime.date(2026, 7, 30), "premier appel téléphonique. elle me recontactera")
    ]


def test_a_date_inside_a_sentence_stays_in_the_comment():
    comment = "girl contacted me on lkd.\nentretien le 29/07 - bien passé."

    remaining, extracted = split_comment(comment)

    assert remaining == comment
    assert extracted == []


def test_a_date_inside_an_extracted_line_is_not_extracted_again():
    _, extracted = split_comment("27/july - rdv pour le 30/07.")

    assert extracted == [(datetime.date(2026, 7, 27), "rdv pour le 30/07.")]


def test_an_entirely_unparseable_comment_survives_intact():
    comment = "girl contacted me on lkd.\nelle va presenter mon profil au business mgr"

    remaining, extracted = split_comment(comment)

    assert remaining == comment
    assert extracted == []


def test_loose_dates_finds_prose_dates_only_when_they_parse():
    assert loose_dates("entretien le 29/07 avec Quentin") == ["29/07"]
    assert loose_dates("groupe castel - 5.3B€") == []


def test_the_whole_sheet_yields_twenty_six_applications(imported):
    applications, report = imported

    assert len(applications) == 26
    assert report.applications == 26
    assert all(application.updates for application in applications)


def test_exactly_seven_updates_come_from_comments(imported):
    applications, _ = imported
    from_comments = [
        (application.company, update.date.isoformat(), update.note)
        for application in applications
        for update in application.updates
        if update.note is not None
    ]

    assert [(company, date) for company, date, _ in from_comments] == [
        ("Swissquote bank", "2026-08-11"),
        ("SalesForce", "2026-07-22"),
        ("mc2i", "2026-07-27"),
        ("mc2i", "2026-07-30"),
        ("mc2i", "2026-08-06"),
        ("Smoteo", "2026-07-30"),
        ("Alpine Consulting (client: SICPA)", "2026-08-11"),
    ]


def test_keyteo_and_castel_keep_their_mid_sentence_dates(imported):
    applications, _ = imported
    by_company = {application.company: application for application in applications}

    assert "29/07" in by_company["Keyteo"].comment
    assert len(by_company["Keyteo"].updates) == 2
    castel = next(a for a in applications if a.company.startswith("Morgan Phillips"))
    assert "29/07" in castel.comment
    assert len(castel.updates) == 1


def test_no_apres_1e_becomes_interview_then_rejected(imported):
    applications, _ = imported
    keyteo = next(a for a in applications if a.company == "Keyteo")

    assert [u.status for u in keyteo.updates] == [Status.INTERVIEW, Status.REJECTED]


def test_eight_applications_end_closed(imported):
    applications, _ = imported
    closed = [
        a for a in applications if a.updates[-1].status in (Status.REJECTED, Status.WITHDRAWN)
    ]

    assert len(closed) == 8


def test_the_two_organisation_companies_are_left_whole(imported):
    applications, _ = imported
    companies = {application.company for application in applications}

    assert "Alpine Consulting (client: SICPA)" in companies
    assert "Morgan Phillips Recruitment.\nCastel Afrique" in companies


def test_the_sector_typo_is_fixed(imported):
    applications, _ = imported

    assert not any(a.sector == "Cosulting" for a in applications)
    assert next(a for a in applications if a.company == "Netlight").sector == "Consulting"


def test_the_unnamed_column_is_appended_to_the_castel_comment(imported):
    applications, _ = imported
    castel = next(a for a in applications if a.company.startswith("Morgan Phillips"))

    assert castel.comment.endswith("première expérience - Claude Code")


def test_links_are_stored_verbatim(imported):
    applications, _ = imported
    sanofi = next(a for a in applications if a.company == "sanofi")

    assert sanofi.link.startswith("https://jobs.sanofi.com/")
    assert "utm_campaign=Linkedin_Job_Slots_via_PJ" in sanofi.link


def test_the_half_point_rating_survives(imported):
    applications, _ = imported
    salesforce = next(a for a in applications if a.title.startswith("AI Builder - fr"))

    assert salesforce.rating == 4.5


def test_the_report_flags_thoughtlabs_and_the_stranded_dates(imported):
    _, report = imported
    notes = "\n".join(report.notes)

    assert "ThoughtLabs: comment reads as closed" in notes
    assert "Keyteo: dates left inside the comment" in notes
    assert "29/07" in notes

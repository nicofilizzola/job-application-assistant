import pytest

from app.ai import half_step, stub_enrich, stub_tailor


@pytest.mark.parametrize(
    ("returned", "expected"),
    [
        (4.0, 4.0),
        (3.5, 3.5),
        (3.7, 3.5),
        (3.8, 4.0),
        (0.5, 1.0),
        (7.0, 5.0),
        (None, None),
    ],
)
def test_a_rating_is_snapped_onto_the_half_point_scale(returned, expected):
    assert half_step(returned) == expected


def test_the_stub_enricher_appends_one_line_carrying_the_instruction():
    assert stub_enrich("Nicolas, engineer.", "Learned Rust") == (
        "Nicolas, engineer.\nAdded by the stub: Learned Rust"
    )


def test_the_stub_enricher_leaves_no_blank_first_line_on_an_empty_profile():
    assert stub_enrich("", "Learned Rust") == "Added by the stub: Learned Rust"


def test_the_stub_tailor_returns_a_document_carrying_the_advert():
    resume = stub_tailor("Full Stack Engineer - AI Finance Agent. Remote, Sweden.", "Nicolas.")

    assert resume.startswith("NICOLAS STUB")
    assert resume.endswith("TAILORED FOR\nFull Stack Engineer - AI Finance Agent. Remote, Sweden.")


def test_the_stub_tailor_keeps_only_the_opening_of_a_long_advert():
    """A whole advert echoed back would make the end-to-end assertions match half the page."""
    resume = stub_tailor("x" * 200, "Nicolas.")

    assert resume.endswith("TAILORED FOR\n" + "x" * 60)

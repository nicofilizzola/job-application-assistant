import pytest

from app.ai import half_step


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

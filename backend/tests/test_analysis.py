import uuid

from tests.test_applications import create

ADVERT = "Full Stack Software Engineer - AI Finance Agent. Remote, Sweden."


async def test_analyse_returns_the_extracted_fields(client, stub_analyser):
    stub_analyser()

    response = await client.post("/job-ads/analyse", json={"text": ADVERT})

    assert response.status_code == 200
    assert response.json() == {
        "title": "Full stack engineer",
        "company": "BJAK",
        "sector": "Insurtech",
        "location": "Sweden",
        "match_rating": 3.5,
        "match_summary": "Three sentences would go here.",
    }


async def test_analyse_hands_the_stored_profile_to_the_model(client, stub_analyser):
    calls = stub_analyser()
    await client.put("/profile", json={"content": "Nicolas, engineer."})

    await client.post("/job-ads/analyse", json={"text": ADVERT})

    assert calls == [(ADVERT, "Nicolas, engineer.")]


async def test_analyse_without_a_profile_passes_an_empty_string(client, stub_analyser):
    calls = stub_analyser(match_rating=None, match_summary=None)

    response = await client.post("/job-ads/analyse", json={"text": ADVERT})

    assert calls == [(ADVERT, "")]
    assert response.json()["match_rating"] is None
    assert response.json()["match_summary"] is None


async def test_analyse_rejects_an_empty_advert(client, stub_analyser):
    stub_analyser()

    response = await client.post("/job-ads/analyse", json={"text": ""})

    assert response.status_code == 422


async def test_scoring_writes_the_match_onto_the_application(client, stub_analyser):
    calls = stub_analyser(match_rating=4.5, match_summary="Reassessed against a fuller profile.")
    await client.put("/profile", json={"content": "Nicolas, engineer."})
    application_id = await create(client, job_ad=ADVERT, match_rating=2.0, match_summary="Old.")

    response = await client.post(f"/applications/{application_id}/match")

    assert response.status_code == 200
    assert response.json()["match_rating"] == 4.5
    assert response.json()["match_summary"] == "Reassessed against a fuller profile."
    assert calls == [(ADVERT, "Nicolas, engineer.")]


async def test_scoring_without_a_stored_advert_is_409(client, stub_analyser):
    stub_analyser()
    await client.put("/profile", json={"content": "Nicolas, engineer."})
    application_id = await create(client)

    response = await client.post(f"/applications/{application_id}/match")

    assert response.status_code == 409


async def test_scoring_without_a_profile_is_409(client, stub_analyser):
    stub_analyser()
    application_id = await create(client, job_ad=ADVERT, match_rating=2.0)

    response = await client.post(f"/applications/{application_id}/match")

    assert response.status_code == 409
    # The refusal has to leave the old score alone, or an empty profile would erase history.
    detail = (await client.get(f"/applications/{application_id}")).json()
    assert detail["match_rating"] == 2.0


async def test_scoring_an_unknown_application_is_404(client, stub_analyser):
    stub_analyser()

    response = await client.post(f"/applications/{uuid.uuid4()}/match")

    assert response.status_code == 404

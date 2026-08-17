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
        "match_summary": "Strong stack overlap, no insurtech domain.",
        "match_strengths": ["Python and FastAPI", "Six years full stack"],
        "match_weaknesses": ["No insurtech domain"],
    }


async def test_analyse_hands_the_stored_profile_to_the_model(client, stub_analyser):
    calls = stub_analyser()
    await client.put("/profile", json={"content": "Nicolas, engineer."})

    await client.post("/job-ads/analyse", json={"text": ADVERT})

    assert calls == [(ADVERT, "Nicolas, engineer.")]


async def test_analyse_without_a_profile_passes_an_empty_string(client, stub_analyser):
    calls = stub_analyser(
        match_rating=None, match_summary=None, match_strengths=None, match_weaknesses=None
    )

    response = await client.post("/job-ads/analyse", json={"text": ADVERT})

    assert calls == [(ADVERT, "")]
    body = response.json()
    assert body["match_rating"] is None
    assert body["match_summary"] is None
    assert body["match_strengths"] is None
    assert body["match_weaknesses"] is None


async def test_analyse_rejects_an_empty_advert(client, stub_analyser):
    stub_analyser()

    response = await client.post("/job-ads/analyse", json={"text": ""})

    assert response.status_code == 422


async def test_scoring_writes_the_match_onto_the_application(client, stub_analyser):
    calls = stub_analyser(
        match_rating=4.5,
        match_summary="Reassessed against a fuller profile.",
        match_strengths=["Ships LLM features in production"],
        match_weaknesses=["No Kubernetes"],
    )
    await client.put("/profile", json={"content": "Nicolas, engineer."})
    application_id = await create(
        client,
        job_ad=ADVERT,
        match_rating=2.0,
        match_summary="Old.",
        match_strengths=["Old strength"],
        match_weaknesses=["Old weakness"],
    )

    response = await client.post(f"/applications/{application_id}/match")

    assert response.status_code == 200
    body = response.json()
    assert body["match_rating"] == 4.5
    assert body["match_summary"] == "Reassessed against a fuller profile."
    assert body["match_strengths"] == ["Ships LLM features in production"]
    assert body["match_weaknesses"] == ["No Kubernetes"]
    assert calls == [(ADVERT, "Nicolas, engineer.")]


async def test_rescoring_replaces_the_lists_rather_than_adding_to_them(client, stub_analyser):
    """The columns are replaced wholesale. A shorter answer must shorten them, not merge in."""
    stub_analyser(match_strengths=["Only this one"], match_weaknesses=["Only this gap"])
    await client.put("/profile", json={"content": "Nicolas, engineer."})
    application_id = await create(
        client,
        job_ad=ADVERT,
        match_strengths=["First", "Second", "Third"],
        match_weaknesses=["First gap", "Second gap"],
    )

    body = (await client.post(f"/applications/{application_id}/match")).json()

    assert body["match_strengths"] == ["Only this one"]
    assert body["match_weaknesses"] == ["Only this gap"]


async def test_scoring_without_a_stored_advert_is_409(client, stub_analyser):
    stub_analyser()
    await client.put("/profile", json={"content": "Nicolas, engineer."})
    application_id = await create(client)

    response = await client.post(f"/applications/{application_id}/match")

    assert response.status_code == 409


async def test_scoring_without_a_profile_is_409(client, stub_analyser):
    stub_analyser()
    application_id = await create(client, job_ad=ADVERT, match_rating=2.0, match_strengths=["Kept"])

    response = await client.post(f"/applications/{application_id}/match")

    assert response.status_code == 409
    # The refusal has to leave the old score alone, or an empty profile would erase history.
    detail = (await client.get(f"/applications/{application_id}")).json()
    assert detail["match_rating"] == 2.0
    assert detail["match_strengths"] == ["Kept"]


async def test_scoring_an_unknown_application_is_404(client, stub_analyser):
    stub_analyser()

    response = await client.post(f"/applications/{uuid.uuid4()}/match")

    assert response.status_code == 404

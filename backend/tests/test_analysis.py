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

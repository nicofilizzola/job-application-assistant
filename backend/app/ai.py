from collections.abc import Callable
from typing import Annotated

from fastapi import Depends
from openai import OpenAI

from app.config import settings
from app.schemas import JobAnalysis

client = OpenAI(api_key=settings.openai_api_key)

SYSTEM = (
    "You read job adverts for a single job seeker. You extract the advert's facts and, when a "
    "candidate profile is given, score how well that candidate matches the job. Report what the "
    "advert says and never invent a detail it does not state."
)

FIELDS = """Pull these fields out of the advert:

- title: the job title, as the advert states it.
- company: the employer. If an agency posted it for a client, name the employer the role is for.
- sector: the company's industry in one to three words - insurance, fintech, public sector - not
  what the role does day to day.
- location: "City, Country". If the advert names no city, give the country on its own.

Answer in English, translating the advert's wording where it is in another language."""

NO_PROFILE = """There is no candidate profile available, so leave match_rating, match_summary,
match_strengths and match_weaknesses null. Do not guess a score."""

SCORING = """Score the match on skills and background alone: technical stack, domain experience,
seniority, and what the candidate has actually shipped. Ignore location, remote policy, salary,
visa status, language requirements and personal preference - those are the candidate's call, not
yours, and must not move the score.

Use this scale, in half points:

- 1 - almost no overlap with what the advert asks for
- 2 - a few relevant skills, most requirements unmet
- 3 - meets roughly half the requirements
- 4 - meets most requirements, gaps are minor
- 5 - meets or exceeds essentially every requirement

Put the score in match_rating, then justify it across three fields:

- match_summary: why the score is that value, in 210 characters or fewer. One or two sentences.
- match_strengths: what the candidate brings that this advert asks for. One to four entries.
- match_weaknesses: what this advert asks for that the candidate lacks. Skills and background
  only - never location, language, visa, salary or remote policy, for the same reason those do
  not move the score. One to four entries.

Give each list only as many entries as there are things worth naming: one sharp point beats four
padded ones. Never make the same point in both lists.

Write all three fields in stripped-down language. List entries are fragments, not sentences:
"Six years shipping FastAPI", not "The candidate has six years of experience shipping FastAPI
services". No leading dashes, no full stop ending an entry, no hedging ("appears to", "seems"),
no filler ("strong candidate", "good fit", "overall"), and never write "the candidate" - who is
being described is already understood.

Here is the candidate:

<candidate_profile>
{profile}
</candidate_profile>"""


def half_step(rating: float | None) -> float | None:
    """The scale is 1 to 5 in half points and the column trusts that. The model is only asked."""
    if rating is None:
        return None
    return min(5.0, max(1.0, round(rating * 2) / 2))


def analyse(ad_text: str, profile: str) -> JobAnalysis:
    task = NO_PROFILE if not profile.strip() else SCORING.format(profile=profile)
    response = client.responses.parse(
        model=settings.openai_model,
        input=[
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": f"{FIELDS}\n\n{task}\n\n<job_advert>\n{ad_text}\n</job_advert>",
            },
        ],
        text_format=JobAnalysis,
    )
    analysis = response.output_parsed
    return analysis.model_copy(update={"match_rating": half_step(analysis.match_rating)})


STUB = JobAnalysis(
    title="Stubbed Engineer",
    company="Stub Industries",
    sector="Testing",
    location="Nowhere",
    match_rating=3.5,
    match_summary="A fixed answer, so the end-to-end suite never calls OpenAI.",
    # Two on one side and one on the other, so the end-to-end suite proves the columns fill
    # independently. No entry is a substring of another: Playwright's getByText would match both.
    match_strengths=["Stubbed strength", "Another stubbed point"],
    match_weaknesses=["Stubbed weakness"],
)


Analyser = Callable[[str, str], JobAnalysis]


def get_analyser() -> Analyser:
    if settings.ai_stub:
        return lambda ad_text, profile: STUB
    return analyse


AnalyserDep = Annotated[Analyser, Depends(get_analyser)]


ENRICH_SYSTEM = (
    "You maintain one job seeker's profile document. You fold new information into it and change "
    "nothing else. You are an editor with a narrow remit, not a writer."
)

ENRICH_TASK = """Fold the update into the profile and return the whole profile back.

Rules, most important first:

1. Add only, with one narrow exception. Every line of the current profile must come back word for
   word. You may extend a line - append a skill to a list that is already there. The exception:
   where the update explicitly supplies a newer value for something a line already states - a job
   that has ended, a count of years that has grown, a title that changed - that one line may be
   brought up to date, and nothing else may. Be very wary of it. It applies only when the update
   states the newer value outright, never when it merely implies one, and if the update can be
   honoured by adding then add. Never reword, reorder, merge or summarise a line for any other
   reason, and never drop one.
2. Never change the structure. Same sections in the same order, same headings spelled the same way,
   same list style, same register. Do not add a heading, do not start a new section, do not reorder
   or re-nest anything. Put the new information under the existing heading it fits best, even when
   the fit is loose. If the profile has no headings at all, add to it in the shape it already has.
3. Add only what the update states. No inferred skills, no invented dates, no padding, and no
   restating something the profile already covers. An update naming a course earns that course, not
   the skills a course like that usually implies - the skills will be named when they are meant.
4. Write in the profile's own voice and language. Match the lines around it: a fragment where its
   neighbours are fragments, French where the profile is in French.
5. Return the profile text and nothing else. No preamble, no summary of what you changed, no code
   fence, and no Markdown that was not already there.

If the current profile is empty, the update is all you have: write a first version from it, in the
update's own words, and invent no structure you were not given.

<current_profile>
{profile}
</current_profile>

<update>
{instruction}
</update>"""


def enrich(profile: str, instruction: str) -> str:
    """The profile with the update folded in. Plain text out: the answer is the document itself,
    so there is no object to parse."""
    response = client.responses.create(
        model=settings.openai_model,
        input=[
            {"role": "system", "content": ENRICH_SYSTEM},
            {
                "role": "user",
                "content": ENRICH_TASK.format(profile=profile, instruction=instruction),
            },
        ],
    )
    return response.output_text.strip()


def stub_enrich(profile: str, instruction: str) -> str:
    """Appends one line, so the end-to-end diff has both untouched and added text to show."""
    return f"{profile}\nAdded by the stub: {instruction}".strip()


Enricher = Callable[[str, str], str]


def get_enricher() -> Enricher:
    if settings.ai_stub:
        return stub_enrich
    return enrich


EnricherDep = Annotated[Enricher, Depends(get_enricher)]

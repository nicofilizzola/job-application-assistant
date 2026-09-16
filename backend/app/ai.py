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
RESUME_SYSTEM = (
    "You are a technical recruiter who has screened thousands of engineering CVs and now writes "
    "them. You know what an applicant tracking system can parse, what a hiring manager takes in "
    "during the six seconds before deciding whether to keep reading, and that the CV which earns "
    "the call is the one answering the advert's requirements in the advert's own order. You are "
    "given one job seeker's profile and one job advert, and you return a one-page resume "
    "assembled from that profile alone. You select and cut from a source document. You never "
    "write a career you were not given."
)

RESUME_TASK = """Write a one-page ATS resume for this advert, from the profile below. It has to
survive an automated parse and then convince the person reading it that this candidate is worth a
screening call, on evidence the profile already contains.

Rules, most important first:

1. Invent nothing. Every employer, title, date, technology, number and achievement must already be
   in the profile. You may cut, reorder, shorten and reword. You may not add a fact, inflate a
   number, promote exposure into experience, or name a tool the profile does not name. Where the
   advert asks for something the profile does not show, leave it out - do not imply it and do not
   hedge it into place.

2. Tailor by choosing, not by adding. Read what the advert asks for, then lead with the profile's
   material that answers it: pick the roles worth the space, put the matching bullets first, and
   drop what this employer has no reason to care about. Where the profile and the advert mean the
   same thing in different words, use the advert's words.

3. Keep to this structure and these budgets exactly. The budgets are in characters, and they are
   ceilings, not targets.

   The candidate's name alone on the first line.
   One headline line: the positioning the profile states, not a title invented for this advert.
   One line of location, mobility and work authorisation. One line of contact details. Both only as
   far as the profile states them - omit an item the profile does not give rather than writing a
   placeholder for it.

   SUMMARY - at most 510 characters. Three or four sentences, no bullets.

   CORE SKILLS - at most 620 characters. Four to six groups, each on its own line, written as
   "Group: item, item, item." Name the groups for what this advert cares about.

   EXPERIENCE - four roles, most recent first, unless the profile holds fewer. Each opens with a
   line reading "EMPLOYER - Title" and then a line reading "Location | Start - End". The single
   most relevant role gets four bullets of at most 220 characters each. The other three get one
   bullet of at most 220 characters each. Bullets open with "- ", start with a verb - past tense
   for a role that has ended, present tense for the current one - and carry a number wherever the
   profile gives one.

   EDUCATION - at most two lines per qualification: school and degree, then location and years.

   CERTIFICATIONS AND LANGUAGES - at most two lines in total.

4. Write to be skimmed. Short declarative lines. No filler, no adjective doing a verb's job, no
   "responsible for", no "proven track record", and never the same achievement in two sections.

5. Write the whole resume in the language of the job advert, translating the profile's material
   where the two differ. Do not leave one section in the profile's language.

6. Return the resume text and nothing else. Plain text: no Markdown, no bold, no code fence, no
   table, no column layout, no icon, no preamble, and no note about what you chose or why. Section
   headings in capitals on their own line, spelled exactly as above.

<candidate_profile>
{profile}
</candidate_profile>

<job_advert>
{ad_text}
</job_advert>"""


def tailor(ad_text: str, profile: str) -> str:
    """The resume itself, as plain text. Like enrich, the answer is the document, so there is no
    object to parse."""
    response = client.responses.create(
        model=settings.openai_model,
        input=[
            {"role": "system", "content": RESUME_SYSTEM},
            {"role": "user", "content": RESUME_TASK.format(profile=profile, ad_text=ad_text)},
        ],
    )
    return response.output_text.strip()


STUB_RESUME = """NICOLAS STUB
Stubbed Product Engineer

SUMMARY
A fixed resume, so the end-to-end suite never calls OpenAI.

CORE SKILLS
Stubbed: one, two."""


def stub_tailor(ad_text: str, profile: str) -> str:
    """Echoes the advert's opening, so the end-to-end suite proves the paste reached the model
    rather than only that some text came back."""
    return f"{STUB_RESUME}\n\nTAILORED FOR\n{ad_text[:60]}"


Tailor = Callable[[str, str], str]


def get_tailor() -> Tailor:
    if settings.ai_stub:
        return stub_tailor
    return tailor


TailorDep = Annotated[Tailor, Depends(get_tailor)]

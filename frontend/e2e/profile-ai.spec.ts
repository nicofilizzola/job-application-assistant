import { expect, test, type Page } from "@playwright/test";

import { saveProfile, STORAGE_STATE } from "./helpers";

test.use({ storageState: STORAGE_STATE });

const PROFILE = "## Skills\nPython, FastAPI, Postgres\n\n## Experience\nSix years full stack";
const INSTRUCTION = "I passed the AWS Solutions Architect exam.";
const ADDED = `Added by the stub: ${INSTRUCTION}`;

/** Long enough that a single change at the end leaves most of it untouched, which is the case the
 *  panel has to stay readable in. */
const LONG = [
  "## Profile",
  "Full stack engineer, six years, based in Paris.",
  "Looking for backend work.",
  "",
  "## Skills",
  "Python, FastAPI, Postgres",
  "",
  "## Experience",
  "Senior engineer at Acme Insurance since 2023.",
  "Contract work for two fintech startups.",
  "",
  "## Certifications",
  "None yet.",
].join("\n");

/** Turns AI mode on with the profile already saved, asks for a rewrite, and waits for the panel.
 *  Returns nothing: every test then reads the page for itself. */
async function rewrite(page: Page) {
  await page.getByLabel("AI mode").click();
  await page.getByLabel("What to add").fill(INSTRUCTION);
  await page.getByRole("button", { name: "Rewrite profile" }).click();
  await expect(page.getByRole("region", { name: "Changes" })).toBeVisible();
}

test("AI mode locks the profile box and asks what to add instead", async ({ page }) => {
  await saveProfile(page, PROFILE);

  // Neither the instruction box nor the panel exists until AI mode is on.
  await expect(page.getByLabel("What to add")).toBeHidden();
  await expect(page.getByRole("region", { name: "Changes" })).toBeHidden();
  await page.getByLabel("AI mode").click();

  await expect(page.getByLabel("What to add")).toBeVisible();
  await expect(page.getByLabel("Candidate profile")).not.toBeEditable();
  // Nothing to fold in yet, so there is nothing to ask for.
  await expect(page.getByRole("button", { name: "Rewrite profile" })).toBeDisabled();
});

test("a rewrite is reviewed as a diff and saved from the box", async ({ page }) => {
  await saveProfile(page, PROFILE);
  await rewrite(page);

  const changes = page.getByRole("region", { name: "Changes" });
  // The panel is an index now, not a rendered document: the addition shows as one row's excerpt.
  await expect(changes.getByText(/Added by the stub/)).toBeVisible();
  await expect(changes.getByText(/added, 0 removed/)).toBeVisible();
  // The whole draft is in the box, and the box is editable again.
  const box = page.getByLabel("Candidate profile");
  await expect(box).toHaveValue(`${PROFILE}\n${ADDED}`);
  await expect(box).toBeEditable();

  await page.getByRole("button", { name: "Save profile" }).click();
  // exact, for the same reason saveProfile needs it: the description line contains "saved." too.
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Candidate profile")).toHaveValue(`${PROFILE}\n${ADDED}`);
});

test("hand-editing the draft re-diffs it and warns about what was dropped", async ({ page }) => {
  await saveProfile(page, PROFILE);
  await rewrite(page);

  // Drop a line the rewrite left alone. The diff is recomputed as the box is typed into, so this
  // is the removal path without a stub that removes anything.
  await page
    .getByLabel("Candidate profile")
    .fill(`## Skills\n\n## Experience\nSix years full stack\n${ADDED}`);

  const changes = page.getByRole("region", { name: "Changes" });
  await expect(changes.locator("del")).toContainText("Python, FastAPI, Postgres");
  await expect(changes.getByText("A rewrite is meant to add only")).toBeVisible();
  // The addition is still indexed as its own change.
  await expect(changes.getByText(/Added by the stub/)).toBeVisible();
});

test("Discard puts the saved profile back", async ({ page }) => {
  await saveProfile(page, PROFILE);
  await rewrite(page);

  await page.getByRole("button", { name: "Discard" }).click();

  await expect(page.getByRole("region", { name: "Changes" })).toBeHidden();
  await expect(page.getByLabel("Candidate profile")).toHaveValue(PROFILE);
  await expect(page.getByLabel("Candidate profile")).not.toBeEditable();
  await expect(page.getByLabel("What to add")).toHaveValue("");
});

test("the index names each change and does not repeat the document", async ({ page }) => {
  await saveProfile(page, LONG);
  await rewrite(page);

  const changes = page.getByRole("region", { name: "Changes" });
  // One row, naming the heading the addition landed under.
  await expect(changes.getByText("## Certifications")).toBeVisible();
  await expect(changes.getByText(/Added by the stub/)).toBeVisible();
  await expect(changes.getByText(/1 change, .* added, 0 removed/)).toBeVisible();
  // The panel is an index, not a second copy: untouched text appears nowhere in it.
  await expect(changes.getByText("Full stack engineer, six years, based in Paris.")).toBeHidden();

  // The box holds the whole profile, with the addition in it.
  await expect(page.getByLabel("Candidate profile")).toHaveValue(`${LONG}\n${ADDED}`);
});

test("clicking a change selects it in the box", async ({ page }) => {
  await saveProfile(page, LONG);
  await rewrite(page);

  await page
    .getByRole("region", { name: "Changes" })
    .getByTitle("Edit this in the profile")
    .first()
    .click();

  const box = page.getByLabel("Candidate profile");
  await expect(box).toBeFocused();
  const selected = await box.evaluate((element) => {
    const area = element as HTMLTextAreaElement;
    return area.value.slice(area.selectionStart, area.selectionEnd);
  });
  expect(selected).toContain("Added by the stub");
});

test("Undo removes one change and leaves the others", async ({ page }) => {
  await saveProfile(page, LONG);
  await rewrite(page);
  // The second change has to be in a different section. Two additions on adjacent lines are one
  // change - the grouping merges anything within a line of its neighbour - so appending next to the
  // stub's line would leave nothing behind to assert on.
  await page
    .getByLabel("Candidate profile")
    .fill(
      `${LONG}\n${ADDED}`.replace(
        "Contract work for two fintech startups.",
        "Contract work for two fintech startups.\nMentor two juniors.",
      ),
    );

  const changes = page.getByRole("region", { name: "Changes" });
  await expect(changes.getByRole("button", { name: /^Undo/ })).toHaveCount(2);

  // Rows run in document order, so the first is the hand-made one under `## Experience`.
  await changes.getByRole("button", { name: /^Undo/ }).first().click();

  // Exactly that change is gone, and the stub's addition is untouched.
  await expect(page.getByLabel("Candidate profile")).toHaveValue(`${LONG}\n${ADDED}`);
});

test("dropped text is listed with its heading and can be put back", async ({ page }) => {
  await saveProfile(page, LONG);
  await rewrite(page);

  // Drop a line by hand. It leaves the box, so it can only be shown in the list.
  await page
    .getByLabel("Candidate profile")
    .fill(`${LONG}\n${ADDED}`.replace("Python, FastAPI, Postgres\n", ""));

  const changes = page.getByRole("region", { name: "Changes" });
  await expect(changes.locator("del")).toContainText("Python, FastAPI, Postgres");
  await expect(changes.getByText("## Skills").first()).toBeVisible();

  await changes.getByRole("button", { name: /^Put it back/ }).click();

  await expect(page.getByLabel("Candidate profile")).toHaveValue(`${LONG}\n${ADDED}`);
  await expect(changes.locator("del")).toHaveCount(0);
});

test("manual mode highlights unsaved edits in the same box", async ({ page }) => {
  await saveProfile(page, LONG);

  // No AI mode, no rewrite: just typing.
  await page.getByLabel("Candidate profile").fill(`${LONG}\nMentor two juniors.`);

  const changes = page.getByRole("region", { name: "Changes" });
  await expect(changes.getByText(/Mentor two juniors/)).toBeVisible();
  await expect(changes.getByText(/1 change/)).toBeVisible();
});

/** Sixty lines, so the box overflows and its scrollbar appears - the condition the wrapping bug
 *  needed. */
const OVERFLOWING = Array.from(
  { length: 60 },
  (_, index) => `Line ${index + 1}: shipped something worth mentioning here.`,
).join("\n");

test("both layers of the box wrap at the same width", async ({ page }) => {
  await saveProfile(page, OVERFLOWING);
  await rewrite(page);

  // A scrollbar changes the content width. If the two layers ever disagree on it they wrap
  // differently, and every highlight below the first differing line is painted a row out.
  const metrics = await page.getByLabel("Candidate profile").evaluate((element) => {
    const box = element as HTMLTextAreaElement;
    const mirror = box.parentElement?.querySelector("[aria-hidden]") as HTMLElement;
    return {
      boxWidth: box.clientWidth,
      mirrorWidth: mirror.clientWidth,
      boxHeight: box.scrollHeight,
      mirrorHeight: mirror.scrollHeight,
    };
  });

  expect(metrics.mirrorWidth).toBe(metrics.boxWidth);
  expect(metrics.mirrorHeight).toBe(metrics.boxHeight);
  // The fixture has to actually overflow, or the assertions above prove nothing.
  expect(metrics.boxHeight).toBeGreaterThan(600);
});

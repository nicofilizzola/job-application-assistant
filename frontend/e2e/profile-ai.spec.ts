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
  await expect(changes.locator("ins")).toContainText(ADDED);
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
  // The addition is still shown as an addition.
  await expect(changes.locator("ins")).toContainText(ADDED);
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

test("a long profile shows only the changed lines, until asked for the rest", async ({ page }) => {
  await saveProfile(page, LONG);
  await rewrite(page);

  const changes = page.getByRole("region", { name: "Changes" });
  // The change sits under the last heading, and that heading is what labels it.
  await expect(changes.getByText("## Certifications")).toBeVisible();
  await expect(changes.locator("ins")).toContainText(ADDED);
  // Everything else is counted, not rendered.
  await expect(changes.getByText(/unchanged lines/)).toBeVisible();
  await expect(changes.getByText("Full stack engineer, six years, based in Paris.")).toBeHidden();

  await changes.getByRole("button", { name: "Show whole profile" }).click();

  await expect(changes.getByText("Full stack engineer, six years, based in Paris.")).toBeVisible();
  await expect(changes.getByText(/unchanged lines/)).toBeHidden();
});

test("clicking a change selects it in the editor", async ({ page }) => {
  await saveProfile(page, LONG);
  await rewrite(page);

  await page
    .getByRole("region", { name: "Changes" })
    .getByTitle("Edit this in the profile below")
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

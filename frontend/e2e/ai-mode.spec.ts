import { expect, test, type Page } from "@playwright/test";

import { STORAGE_STATE } from "./helpers";

test.use({ storageState: STORAGE_STATE });

const ADVERT = "Full Stack Software Engineer - AI Finance Agent. Remote, Sweden. 3+ years.";

async function saveProfile(page: Page, content: string) {
  await page.goto("/profile");
  await page.getByLabel("Candidate profile").fill(content);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
}

/** Returns the detail URL. Waiting for the heading first: the click redirects, and reading
 *  page.url() before that lands gives the form's URL, not the new application's. */
async function createThroughAiMode(page: Page): Promise<string> {
  await page.goto("/applications/new");
  await page.getByLabel("AI mode").click();
  await page.getByLabel("Job advert").fill(ADVERT);
  await page.getByRole("button", { name: "Fill the form" }).click();
  await expect(page.getByLabel("Job title")).toHaveValue("Stubbed Engineer");
  await page.getByRole("button", { name: "Create application" }).click();
  await expect(page.getByRole("heading", { name: "Stubbed Engineer" })).toBeVisible();
  return page.url();
}

test("the profile survives a reload", async ({ page }) => {
  await saveProfile(page, "Nicolas, full stack engineer.");

  await page.reload();

  await expect(page.getByLabel("Candidate profile")).toHaveValue("Nicolas, full stack engineer.");
});

test("AI mode fills the form from a pasted advert", async ({ page }) => {
  await saveProfile(page, "Nicolas, full stack engineer.");
  await page.goto("/applications/new");

  // The form is empty and the paste box is not offered until AI mode is on.
  await expect(page.getByLabel("Job advert")).toBeHidden();
  await expect(page.getByRole("region", { name: "AI match" })).toBeHidden();
  await page.getByLabel("AI mode").click();
  await page.getByLabel("Job advert").fill(ADVERT);
  await page.getByRole("button", { name: "Fill the form" }).click();

  await expect(page.getByLabel("Job title")).toHaveValue("Stubbed Engineer");
  await expect(page.getByLabel("Company")).toHaveValue("Stub Industries");
  await expect(page.getByLabel("Sector")).toHaveValue("Testing");
  await expect(page.getByLabel("Location")).toHaveValue("Nowhere");
  await expect(page.getByLabel("Date")).not.toHaveValue("");

  // Reviewable before anything is written: the same block the detail screen shows.
  const preview = page.getByRole("region", { name: "AI match" });
  await expect(preview.getByText("3.5 / 5")).toBeVisible();
  await expect(preview.getByRole("heading", { name: "What matches well" })).toBeVisible();
  await expect(preview.getByText("Stubbed strength")).toBeVisible();
  await expect(preview.getByText("Another stubbed point")).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Weaknesses" })).toBeVisible();
  await expect(preview.getByText("Stubbed weakness")).toBeVisible();

  await page.getByRole("button", { name: "Create application" }).click();

  await expect(page.getByRole("heading", { name: "Stubbed Engineer" })).toBeVisible();
  const match = page.getByRole("region", { name: "AI match" });
  await expect(match.getByText("3.5 / 5")).toBeVisible();
  await expect(match.getByText("A fixed answer")).toBeVisible();
  await expect(match.getByRole("heading", { name: "What matches well" })).toBeVisible();
  await expect(match.getByText("Stubbed strength")).toBeVisible();
  await expect(match.getByText("Another stubbed point")).toBeVisible();
  await expect(match.getByRole("heading", { name: "Weaknesses" })).toBeVisible();
  await expect(match.getByText("Stubbed weakness")).toBeVisible();
  await expect(page.getByText("Job advert")).toBeVisible();
});

test("an AI scored application shows its match on the list", async ({ page }) => {
  await saveProfile(page, "Nicolas, full stack engineer.");
  const detail = await createThroughAiMode(page);

  await page.goto("/");

  // Scoped to this application's own row: earlier tests leave identically titled ones behind,
  // since the database is only emptied once the whole suite has finished.
  const listed = page.locator(`a[href="/applications/${detail.split("/").pop()}"]`);
  await expect(listed.getByTitle("AI match")).toHaveText("AI 3.5");
  await expect(listed.getByTitle("Your rating")).toHaveText("-");
});

test("scoring is refused while the profile is empty", async ({ page }) => {
  await saveProfile(page, "Nicolas, full stack engineer.");
  const detail = await createThroughAiMode(page);

  await saveProfile(page, "");
  await page.goto(detail);
  await page.getByRole("button", { name: "Score again" }).click();

  // Not getByRole("alert"): Next renders its own empty route announcer with that role.
  await expect(page.getByText("Fill in your profile first")).toBeVisible();
  // The refusal must not have wiped the score that was already earned.
  await expect(page.getByText("3.5 / 5")).toBeVisible();
});

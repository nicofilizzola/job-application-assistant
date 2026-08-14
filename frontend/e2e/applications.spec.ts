import { expect, test } from "@playwright/test";

import { STORAGE_STATE, addUpdate, createApplication, row, timeline } from "./helpers";

test.use({ storageState: STORAGE_STATE });

test("creating an application puts it on the list with its first status", async ({ page }) => {
  await createApplication(page, { title: "Platform engineer", date: "2026-08-01" });

  await page.goto("/");
  const listed = row(page, "Platform engineer");
  await expect(listed).toContainText("Applied");
  await expect(listed).toContainText("1 Aug 2026");
});

test("a later update moves the current status shown on the list", async ({ page }) => {
  await createApplication(page, { title: "Data engineer", date: "2026-08-01" });
  await addUpdate(page, "Interview", "2026-08-09", "first round");

  await expect(page.getByRole("heading", { name: "Data engineer" })).toBeVisible();

  await page.goto("/");
  const listed = row(page, "Data engineer");
  await expect(listed).toContainText("Interview");
  await expect(listed).toContainText("9 Aug 2026");
});

test("two updates on one date resolve to the one written last", async ({ page }) => {
  await createApplication(page, { title: "Mobile engineer", date: "2026-08-11" });
  await addUpdate(page, "Interview", "2026-08-11");
  await addUpdate(page, "Rejected", "2026-08-11");

  await page.goto("/?closed=shown");
  await expect(row(page, "Mobile engineer")).toContainText("Rejected");
});

test("hide closed keeps closed applications out until it is switched off", async ({ page }) => {
  await createApplication(page, { title: "Open role", date: "2026-08-02" });
  await createApplication(page, { title: "Closed role", date: "2026-08-03" });
  await addUpdate(page, "Rejected", "2026-08-04");

  await page.goto("/");
  await expect(row(page, "Open role")).toBeVisible();
  await expect(row(page, "Closed role")).toHaveCount(0);

  await page.getByLabel("Hide closed").click();
  await expect(row(page, "Closed role")).toBeVisible();
  await expect(page).toHaveURL(/closed=shown/);

  // The toggle lives in the URL, so a reload keeps it.
  await page.reload();
  await expect(row(page, "Closed role")).toBeVisible();
});

test("editing persists", async ({ page }) => {
  await createApplication(page, { title: "Was called this", date: "2026-08-05" });

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Job title").fill("Now called this");
  await page.getByLabel("Rating").selectOption("4.5");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("heading", { name: "Now called this" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Now called this" })).toBeVisible();
  await expect(page.getByText("4.5")).toBeVisible();
});

test("deleting removes the application and its timeline", async ({ page }) => {
  await createApplication(page, { title: "Doomed role", date: "2026-08-06" });
  await addUpdate(page, "Interview", "2026-08-07", "went nowhere");
  await expect(timeline(page)).toContainText("went nowhere");

  const url = page.url();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(row(page, "Doomed role")).toHaveCount(0);

  const response = await page.goto(url);
  expect(response?.status()).toBe(404);
});
